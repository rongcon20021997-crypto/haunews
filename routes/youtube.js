const express = require('express');
const router = express.Router();
const youtubeApi = require('../services/youtubeApi');
const db = require('../database/db');
const fs = require('fs');
const path = require('path');

// Ensure youtube and drive table columns (migration)
['youtube_video_id', 'youtube_url', 'drive_video_id', 'drive_url'].forEach(col => {
  try { db.exec(`ALTER TABLE videos ADD COLUMN ${col} TEXT`); } catch (e) {}
  try { db.exec(`ALTER TABLE slidesets ADD COLUMN ${col} TEXT`); } catch (e) {}
});

function getActiveAccount() {
  return db.prepare('SELECT * FROM youtube_accounts WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1').get();
}

async function ensureFreshToken(account) {
  if (!account) throw new Error('No YouTube account connected');
  const now = new Date();
  const expiresAt = new Date(account.token_expires_at);
  // Refresh if expires within 5 minutes
  if (expiresAt <= new Date(now.getTime() + 5 * 60 * 1000)) {
    console.log('🔄 Refreshing YouTube token...');
    const newToken = await youtubeApi.refreshToken(account.refresh_token);
    const newExpires = new Date(Date.now() + (newToken.expires_in || 3600) * 1000).toISOString();
    db.prepare('UPDATE youtube_accounts SET access_token = ?, token_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newToken.access_token, newExpires, account.id);
    account.access_token = newToken.access_token;
  }
  return account;
}

// GET /api/youtube/status - Trạng thái tài khoản YouTube
router.get('/status', async (req, res) => {
  try {
    const account = getActiveAccount();
    if (!account) return res.json({ logged_in: false });

    const isExpired = new Date(account.token_expires_at) < new Date();
    res.json({
      logged_in: !isExpired,
      account: {
        channel_id: account.channel_id,
        channel_title: account.channel_title,
        email: account.email,
        avatar_url: account.avatar_url,
        token_expired: isExpired
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/youtube/channel - Lấy thông tin channel
router.get('/channel', async (req, res) => {
  try {
    let account = getActiveAccount();
    account = await ensureFreshToken(account);
    const stats = await youtubeApi.getChannelStats(account.access_token);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/youtube/videos - Danh sách video YouTube
router.get('/videos', async (req, res) => {
  try {
    let account = getActiveAccount();
    account = await ensureFreshToken(account);
    const { maxResults = 20, pageToken } = req.query;
    const result = await youtubeApi.getVideoList(account.access_token, Number(maxResults), pageToken || null);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/youtube/stats - Thống kê tổng hợp YouTube
router.get('/stats', (req, res) => {
  try {
    const uploadedVideos = db.prepare(`
      SELECT COUNT(*) as c FROM videos WHERE youtube_video_id IS NOT NULL
    `).get().c;
    const uploadedSlidesets = db.prepare(`
      SELECT COUNT(*) as c FROM slidesets WHERE youtube_video_id IS NOT NULL
    `).get().c;

    res.json({
      uploaded_videos: uploadedVideos,
      uploaded_slidesets: uploadedSlidesets,
      total_uploads: uploadedVideos + uploadedSlidesets
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/youtube/upload/video/:videoId - Upload video lên YouTube
router.post('/upload/video/:videoId', async (req, res) => {
  const videoId = req.params.videoId;
  try {
    let account = getActiveAccount();
    account = await ensureFreshToken(account);

    const video = db.prepare(`
      SELECT v.*, n.title as news_title, n.description as news_desc, n.category
      FROM videos v JOIN news n ON v.news_id = n.id WHERE v.id = ?
    `).get(videoId);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    if (!video.file_path || !fs.existsSync(video.file_path)) {
      return res.status(400).json({ error: 'File video chưa được tạo' });
    }

    const {
      privacyStatus = 'private',
      title,
      description,
      tags
    } = req.body;

    const videoTitle = title || `${video.news_title} | Tin tức VnExpress`;
    const videoDesc = description || `${video.news_desc || video.news_title}\n\n#tintuc #vnexpress #${(video.category || 'news').replace(/\s/g, '')}`;
    const videoTags = tags ? (Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim())) 
                           : ['tin tức', 'vnexpress', video.category || 'news'];

    console.log(`📺 Uploading video #${videoId} to YouTube (${privacyStatus})...`);

    const result = await youtubeApi.uploadVideo(account.access_token, video.file_path, {
      title: videoTitle,
      description: videoDesc,
      tags: videoTags,
      privacyStatus,
      categoryId: '25'
    });

    const youtubeUrl = `https://www.youtube.com/watch?v=${result.video_id}`;
    db.prepare('UPDATE videos SET youtube_video_id = ?, youtube_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(result.video_id, youtubeUrl, videoId);

    res.json({ success: true, video_id: result.video_id, youtube_url: youtubeUrl });
  } catch (error) {
    console.error('YouTube video upload error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.error?.message || error.message });
  }
});

// POST /api/youtube/upload/slideset/:id - Upload slideset video lên YouTube
router.post('/upload/slideset/:id', async (req, res) => {
  const setId = req.params.id;
  try {
    let account = getActiveAccount();
    account = await ensureFreshToken(account);

    const set = db.prepare('SELECT * FROM slidesets WHERE id = ?').get(setId);
    if (!set) return res.status(404).json({ error: 'Slideset not found' });
    if (!set.video_path || !fs.existsSync(set.video_path)) {
      return res.status(400).json({ error: 'Chưa tạo video cho bộ slides này. Hãy tạo video trước!' });
    }

    const {
      privacyStatus = 'private',
      title,
      description,
      tags
    } = req.body;

    const videoTitle = title || `${set.title} | Tin tức tổng hợp`;
    const videoDesc = description || `Tin tức tổng hợp ngày ${set.date_label || ''}\n\n#tintuc #tintucthegioi #vnexpress #tintucmoinhat`;
    const videoTags = tags ? (Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim()))
                           : ['tin tức', 'tin tức thế giới', 'vnexpress', 'tin tức mới nhất'];

    console.log(`📺 Uploading slideset #${setId} video to YouTube (${privacyStatus})...`);

    const result = await youtubeApi.uploadVideo(account.access_token, set.video_path, {
      title: videoTitle,
      description: videoDesc,
      tags: videoTags,
      privacyStatus,
      categoryId: '25'
    });

    const youtubeUrl = `https://www.youtube.com/watch?v=${result.video_id}`;
    db.prepare('UPDATE slidesets SET youtube_video_id = ?, youtube_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(result.video_id, youtubeUrl, setId);

    res.json({ success: true, video_id: result.video_id, youtube_url: youtubeUrl });
  } catch (error) {
    console.error('YouTube slideset upload error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.error?.message || error.message });
  }
});

// GET /api/youtube/ready - Lấy danh sách videos sẵn sàng upload
router.get('/ready', (req, res) => {
  try {
    const videos = db.prepare(`
      SELECT v.id, v.file_path, v.status, v.created_at, v.youtube_video_id, v.youtube_url, v.drive_url, v.drive_video_id,
             n.title as news_title, n.category, n.image_url
      FROM videos v JOIN news n ON v.news_id = n.id
      WHERE v.file_path IS NOT NULL OR v.drive_url IS NOT NULL
      ORDER BY v.created_at DESC LIMIT 50
    `).all();

    const slidesets = db.prepare(`
      SELECT id, title, date_label, status, video_path, video_duration,
             created_at, youtube_video_id, youtube_url, drive_url, drive_video_id
      FROM slidesets
      WHERE video_path IS NOT NULL OR drive_url IS NOT NULL
      ORDER BY created_at DESC LIMIT 50
    `).all();

    res.json({ videos, slidesets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================== GOOGLE DRIVE ENDPOINTS ==================

// POST /api/youtube/drive/upload-video/:type/:id
router.post('/drive/upload-video/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    let account = getActiveAccount();
    account = await ensureFreshToken(account);

    let filePath = null;
    let title = '';
    if (type === 'video') {
      const v = db.prepare('SELECT file_path, news_id FROM videos WHERE id = ?').get(id);
      if (v && v.file_path) { filePath = v.file_path; title = `video_${v.news_id}`; }
    } else {
      const s = db.prepare('SELECT video_path, title FROM slidesets WHERE id = ?').get(id);
      if (s && s.video_path) { filePath = s.video_path; title = `slideset_${id}`; }
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: 'Không tìm thấy file video' });
    }

    const fileName = `${title}_${Date.now()}.mp4`;
    console.log(`📤 Uploading ${fileName} to Google Drive...`);
    
    const result = await youtubeApi.uploadFileToDrive(account.access_token, filePath, 'video/mp4', fileName);
    const driveUrl = `https://drive.google.com/file/d/${result.id}/view?usp=sharing`;
    
    // Lưu URL Drive và Xóa file local (để nhẹ máy)
    if (type === 'video') {
      db.prepare('UPDATE videos SET file_path = NULL, drive_video_id = ?, drive_url = ? WHERE id = ?')
        .run(result.id, driveUrl, id);
      try { fs.unlinkSync(filePath); } catch (e) {}
    } else {
      db.prepare('UPDATE slidesets SET video_path = NULL, drive_video_id = ?, drive_url = ? WHERE id = ?')
        .run(result.id, driveUrl, id);
      try { fs.unlinkSync(filePath); } catch (e) {}
      
      // Xóa các file audio và image tạm của slideset này
      try {
        const items = db.prepare('SELECT image_path, audio_path FROM slideset_items WHERE slideset_id = ?').all(id);
        for (const item of items) {
          if (item.image_path && fs.existsSync(item.image_path)) fs.unlinkSync(item.image_path);
          if (item.audio_path && fs.existsSync(item.audio_path)) fs.unlinkSync(item.audio_path);
        }
      } catch (e) {
        console.error('Lỗi khi xóa file tạm của slideset:', e.message);
      }
    }

    res.json({ success: true, file_id: result.id, drive_url: driveUrl, message: 'Đã upload thành công và giải phóng dung lượng local' });
  } catch (err) {
    console.error('Drive upload error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// POST /api/youtube/drive/backup-db
router.post('/drive/backup-db', async (req, res) => {
  try {
    let account = getActiveAccount();
    account = await ensureFreshToken(account);

    const dbPath = path.join(__dirname, '..', 'data', 'tiktok_news.db');
    const backupPath = path.join(__dirname, '..', 'data', 'backup.db');
    
    // Backup db safely using better-sqlite3 built-in backup
    await db.backup(backupPath);
    
    // Upload backup to Drive
    console.log('📤 Uploading DB backup to Google Drive...');
    const result = await youtubeApi.uploadFileToDrive(account.access_token, backupPath, 'application/octet-stream', 'tiktok_news_backup.db');
    
    // Remove local backup copy
    fs.unlinkSync(backupPath);
    
    res.json({ success: true, file_id: result.id, message: 'Đã đồng bộ CSDL lên Google Drive' });
  } catch (err) {
    console.error('Drive backup error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// POST /api/youtube/drive/restore-db
router.post('/drive/restore-db', async (req, res) => {
  try {
    let account = getActiveAccount();
    account = await ensureFreshToken(account);

    const restorePath = path.join(__dirname, '..', 'data', 'restore.db');
    const dbPath = path.join(__dirname, '..', 'data', 'tiktok_news.db');
    
    console.log('📥 Downloading DB backup from Google Drive...');
    await youtubeApi.downloadFileFromDrive(account.access_token, 'tiktok_news_backup.db', restorePath);
    
    console.log('🔄 Replacing local database...');
    // Close the database to release file lock
    db.close();
    
    // Overwrite the file
    fs.copyFileSync(restorePath, dbPath);
    fs.unlinkSync(restorePath);
    
    console.log('✅ DB Restored successfully. Restarting process...');
    
    res.json({ success: true, message: 'Đã tải CSDL từ Google Drive thành công. Hệ thống sẽ tự khởi động lại sau 2 giây.' });
    
    // Exit to allow PM2/Nodemon to restart the app
    setTimeout(() => { process.exit(0); }, 2000);
  } catch (err) {
    console.error('Drive restore error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

module.exports = router;
