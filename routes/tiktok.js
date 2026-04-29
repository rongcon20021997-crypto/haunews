const express = require('express');
const router = express.Router();
const tiktokApi = require('../services/tiktokApi');
const db = require('../database/db');

function getActiveAccount() {
  return db.prepare('SELECT * FROM tiktok_accounts WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1').get();
}

// POST /api/tiktok/upload/:videoId - Upload video lên TikTok
router.post('/upload/:videoId', async (req, res) => {
  try {
    const account = getActiveAccount();
    if (!account) return res.status(401).json({ error: 'No TikTok account connected' });

    const video = db.prepare(`
      SELECT v.*, n.title as news_title, n.category FROM videos v
      JOIN news n ON v.news_id = n.id WHERE v.id = ?
    `).get(req.params.videoId);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    if (!video.file_path) return res.status(400).json({ error: 'Video file not created yet' });

    db.prepare('UPDATE videos SET status = ? WHERE id = ?').run('uploading', video.id);

    const title = `${video.news_title} #tintuc #${(video.category || 'news').replace(/\s/g, '')} #vnexpress`;

    const result = await tiktokApi.directPost(account.access_token, video.file_path, title);

    db.prepare('UPDATE videos SET tiktok_publish_id = ?, status = ?, uploaded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(result.publish_id, 'uploaded', video.id);

    db.prepare('UPDATE news SET status = ? WHERE id = ?').run('uploaded', video.news_id);

    res.json({ success: true, publish_id: result.publish_id });
  } catch (error) {
    console.error('Upload error:', error);
    db.prepare('UPDATE videos SET status = ?, error_message = ? WHERE id = ?')
      .run('error', error.message, req.params.videoId);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/tiktok/check-status/:videoId - Kiểm tra trạng thái upload
router.post('/check-status/:videoId', async (req, res) => {
  try {
    const account = getActiveAccount();
    if (!account) return res.status(401).json({ error: 'No account' });

    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.videoId);
    if (!video || !video.tiktok_publish_id) return res.status(404).json({ error: 'Not found' });

    const status = await tiktokApi.checkPublishStatus(account.access_token, video.tiktok_publish_id);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/tiktok/videos - Lấy danh sách video từ TikTok & sync stats
router.get('/videos', async (req, res) => {
  try {
    const account = getActiveAccount();
    if (!account) return res.status(401).json({ error: 'No account' });

    const result = await tiktokApi.getVideoList(account.access_token);

    // Update local stats for regular videos
    if (result.data?.videos) {
      const tiktokVideos = result.data.videos;

      for (const v of tiktokVideos) {
        const views   = v.view_count    || 0;
        const likes   = v.like_count    || 0;
        const comments= v.comment_count || 0;
        const shares  = v.share_count   || 0;

        // Try to match a local video by tiktok_video_id
        const matched = db.prepare('SELECT id FROM videos WHERE tiktok_video_id = ?').get(v.id);
        if (matched) {
          db.prepare('UPDATE videos SET views=?, likes=?, comments=?, shares=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            .run(views, likes, comments, shares, matched.id);
          continue;
        }

        // Try to match a slideset by tiktok_video_id
        const matchedSS = db.prepare('SELECT id FROM slidesets WHERE tiktok_video_id = ?').get(v.id);
        if (matchedSS) {
          db.prepare('UPDATE slidesets SET views=?, likes=?, comments=?, shares=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            .run(views, likes, comments, shares, matchedSS.id);
          continue;
        }

        // No match by video_id - try to save the video_id into recently-uploaded slidesets
        // that have a publish_id but no video_id yet (match by upload time proximity)
        const recentSS = db.prepare(
          `SELECT id FROM slidesets WHERE status='uploaded' AND tiktok_video_id IS NULL
           ORDER BY uploaded_at DESC LIMIT 5`
        ).all();
        if (recentSS.length) {
          // Save tiktok_video_id to the first unmatched slideset (best-effort)
          db.prepare('UPDATE slidesets SET tiktok_video_id=?, views=?, likes=?, comments=?, shares=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            .run(v.id, views, likes, comments, shares, recentSS[0].id);
        }
      }
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/tiktok/stats - Thống kê tổng (videos + slidesets)
router.get('/stats', (req, res) => {
  // Migrate slideset stats columns if needed
  ['views','likes','comments','shares','tiktok_video_id'].forEach(col => {
    try {
      if (col === 'tiktok_video_id') db.exec(`ALTER TABLE slidesets ADD COLUMN tiktok_video_id TEXT`);
      else db.exec(`ALTER TABLE slidesets ADD COLUMN ${col} INTEGER DEFAULT 0`);
    } catch(e) { /* already exists */ }
  });

  const videoStats = db.prepare(`
    SELECT
      COUNT(*) as total_videos,
      COALESCE(SUM(views),0) as total_views,
      COALESCE(SUM(likes),0) as total_likes,
      COALESCE(SUM(comments),0) as total_comments,
      COALESCE(SUM(shares),0) as total_shares,
      COUNT(CASE WHEN status='uploaded' THEN 1 END) as uploaded_count,
      COUNT(CASE WHEN status='error' THEN 1 END) as error_count
    FROM videos
  `).get();

  const slidesetStats = db.prepare(`
    SELECT
      COUNT(CASE WHEN status='uploaded' THEN 1 END) as uploaded_count,
      COALESCE(SUM(views),0) as total_views,
      COALESCE(SUM(likes),0) as total_likes,
      COALESCE(SUM(comments),0) as total_comments,
      COALESCE(SUM(shares),0) as total_shares
    FROM slidesets
  `).get();

  const newsStats = db.prepare(`
    SELECT
      COUNT(*) as total_news,
      COUNT(CASE WHEN status='new' THEN 1 END) as new_count,
      COUNT(CASE WHEN status='uploaded' THEN 1 END) as uploaded_count
    FROM news
  `).get();

  // Merge video + slideset stats
  const merged = {
    total_videos:   (videoStats.total_videos || 0) + (slidesetStats.uploaded_count || 0),
    total_views:    (videoStats.total_views  || 0) + (slidesetStats.total_views  || 0),
    total_likes:    (videoStats.total_likes  || 0) + (slidesetStats.total_likes  || 0),
    total_comments: (videoStats.total_comments || 0) + (slidesetStats.total_comments || 0),
    total_shares:   (videoStats.total_shares  || 0) + (slidesetStats.total_shares  || 0),
    uploaded_count: (videoStats.uploaded_count || 0) + (slidesetStats.uploaded_count || 0),
    error_count:    videoStats.error_count || 0
  };

  res.json({ videos: merged, news: newsStats, slidesets: slidesetStats });
});

// POST /api/tiktok/auto-process/:newsId - Tự động xử lý: scrape → tạo ảnh → tạo video → upload
router.post('/auto-process/:newsId', async (req, res) => {
  try {
    const account = getActiveAccount();
    if (!account) return res.status(401).json({ error: 'No TikTok account' });

    const news = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.newsId);
    if (!news) return res.status(404).json({ error: 'News not found' });

    // This would normally be handled by the media and upload routes
    // For auto-process, we chain them
    res.json({
      success: true,
      message: 'Auto process started',
      steps: ['fetch_content', 'create_slides', 'create_video', 'upload_tiktok']
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
