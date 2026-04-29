const express = require('express');
const router = express.Router();
const slidesetCreator = require('../services/slidesetCreator');
const videoCreator = require('../services/videoCreator');
const scraper = require('../services/scraper');
const db = require('../database/db');
const path = require('path');
const fs = require('fs');

// Ensure slidesets table has video columns (migration)
try {
  db.exec(`ALTER TABLE slidesets ADD COLUMN video_path TEXT`);
} catch (e) { /* column already exists */ }
try {
  db.exec(`ALTER TABLE slidesets ADD COLUMN video_duration REAL DEFAULT 0`);
} catch (e) { /* column already exists */ }
try {
  db.exec(`ALTER TABLE slideset_items ADD COLUMN audio_path TEXT`);
} catch (e) { /* column already exists */ }
try {
  db.exec(`ALTER TABLE slideset_items ADD COLUMN audio_duration REAL DEFAULT 0`);
} catch (e) { /* column already exists */ }
try {
  db.exec(`ALTER TABLE slidesets ADD COLUMN tts_voice TEXT DEFAULT 'female'`);
} catch (e) { /* column already exists */ }

// GET /api/slidesets - Danh sách bộ slides
router.get('/', (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = '1=1';
  const params = [];
  if (status) { where += ' AND s.status = ?'; params.push(status); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM slidesets s WHERE ${where}`).get(...params).count;
  const sets = db.prepare(`
    SELECT s.* FROM slidesets s
    WHERE ${where} ORDER BY s.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));

  // Attach items to each set
  const itemStmt = db.prepare(`
    SELECT si.*, n.title as news_title, n.image_url as news_image, n.category 
    FROM slideset_items si LEFT JOIN news n ON si.news_id = n.id
    WHERE si.slideset_id = ? ORDER BY si.slide_index
  `);

  const result = sets.map(s => ({
    ...s,
    items: itemStmt.all(s.id)
  }));

  res.json({ data: result, total, page: Number(page), pages: Math.ceil(total / limit) });
});

// GET /api/slidesets/:id - Chi tiết bộ slides
router.get('/:id', (req, res) => {
  const set = db.prepare('SELECT * FROM slidesets WHERE id = ?').get(req.params.id);
  if (!set) return res.status(404).json({ error: 'Not found' });

  const items = db.prepare(`
    SELECT si.*, n.title as news_title, n.image_url as news_image, n.category, n.description as news_desc
    FROM slideset_items si LEFT JOIN news n ON si.news_id = n.id
    WHERE si.slideset_id = ? ORDER BY si.slide_index
  `).all(set.id);

  res.json({ ...set, items: items.map(i => ({
    ...i,
    image_url: i.image_path ? '/temp/slidesets/' + path.basename(i.image_path) : null
  })) });
});

// POST /api/slidesets/create - Tạo bộ slides từ danh sách news IDs
router.post('/create', async (req, res) => {
  try {
    const { newsIds, dateLabel, timeLabel = 'sáng' } = req.body;

    if (!newsIds || !Array.isArray(newsIds) || newsIds.length === 0) {
      return res.status(400).json({ error: 'Cần chọn ít nhất 1 tin tức' });
    }
    if (newsIds.length > 10) {
      return res.status(400).json({ error: 'Tối đa 10 tin tức' });
    }

    // Get news articles
    const placeholders = newsIds.map(() => '?').join(',');
    const newsItems = db.prepare(`SELECT * FROM news WHERE id IN (${placeholders}) ORDER BY created_at DESC`).all(...newsIds);

    if (newsItems.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy tin tức' });
    }

    // Fetch content for items that don't have it yet
    for (const item of newsItems) {
      if (!item.content && item.source_url) {
        try {
          const content = await scraper.fetchArticleContent(item.source_url);
          db.prepare('UPDATE news SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(content.content, item.id);
          item.content = content.content;
        } catch (e) {
          console.error(`Failed to fetch content for news ${item.id}:`, e.message);
        }
      }
    }

    // Auto date label if not provided
    const today = dateLabel || new Date().toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });

    // Create slideset record
    const totalSlides = newsItems.length + 2;
    const insertSet = db.prepare('INSERT INTO slidesets (title, date_label, slide_count, status) VALUES (?, ?, ?, ?)');
    const setResult = insertSet.run(`Bản tin ${timeLabel} ngày ${today}`, today, totalSlides, 'processing');
    const setId = setResult.lastInsertRowid;

    console.log(`🎨 Creating slideset #${setId} with ${newsItems.length} news items...`);

    // Generate all slides
    const slides = await slidesetCreator.createFullSlideset(newsItems, today, setId, timeLabel);

    // Save slide items to database
    const insertItem = db.prepare(
      'INSERT INTO slideset_items (slideset_id, news_id, slide_index, slide_type, image_path, summary_text) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const slide of slides) {
      insertItem.run(setId, slide.newsId, slide.index, slide.type, slide.path, slide.summary);
    }

    // Mark as ready
    db.prepare('UPDATE slidesets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('ready', setId);

    console.log(`✅ Slideset #${setId} created with ${slides.length} slides`);

    res.json({
      success: true,
      slideset_id: setId,
      slides: slides.map(s => ({
        index: s.index,
        type: s.type,
        newsId: s.newsId,
        summary: s.summary,
        image_url: '/temp/slidesets/' + path.basename(s.path)
      }))
    });
  } catch (error) {
    console.error('Create slideset error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/slidesets/:id
router.delete('/:id', (req, res) => {
  const set = db.prepare('SELECT * FROM slidesets WHERE id = ?').get(req.params.id);
  if (set) {
    const items = db.prepare('SELECT image_path FROM slideset_items WHERE slideset_id = ?').all(set.id);
    for (const item of items) {
      try { if (item.image_path && fs.existsSync(item.image_path)) fs.unlinkSync(item.image_path); } catch (e) {}
    }
    db.prepare('DELETE FROM slideset_items WHERE slideset_id = ?').run(set.id);
    db.prepare('DELETE FROM slidesets WHERE id = ?').run(set.id);
  }
  res.json({ success: true });
});

// POST /api/slidesets/:id/create-video - Tạo video từ bộ slides
router.post('/:id/create-video', async (req, res) => {
  try {
    const set = db.prepare('SELECT * FROM slidesets WHERE id = ?').get(req.params.id);
    if (!set) return res.status(404).json({ error: 'Slideset not found' });

    const items = db.prepare(`
      SELECT si.*, n.title as news_title, n.description as news_desc, n.content as news_content
      FROM slideset_items si LEFT JOIN news n ON si.news_id = n.id
      WHERE si.slideset_id = ? ORDER BY si.slide_index
    `).all(set.id);
    if (items.length === 0) return res.status(400).json({ error: 'No slides in set' });

    // Get slide duration from request body or settings
    const reqDuration = req.body.slide_duration;
    const reqIntroDuration = req.body.intro_duration;
    const enableTTS = req.body.enable_tts || false;
    const ttsVoice = req.body.tts_voice || 'female';
    const ttsRate = req.body.tts_rate || '+0%';
    const settingDuration = db.prepare('SELECT value FROM settings WHERE key = ?').get('slide_duration');
    let newsDuration = Number(reqDuration || settingDuration?.value || 4);
    let introDuration = Number(reqIntroDuration || 3);

    db.prepare('UPDATE slidesets SET status = ? WHERE id = ?').run('processing', set.id);

    // Update Intro slide if timeLabel changed
    const reqTimeLabel = req.body.timeLabel;
    if (reqTimeLabel) {
      const oldTitle = set.title || '';
      const newTitle = `Bản tin ${reqTimeLabel} ngày ${set.date_label}`;
      
      if (oldTitle.toLowerCase() !== newTitle.toLowerCase()) {
        console.log(`🕒 Updating session to ${reqTimeLabel}`);
        const introPath = await slidesetCreator.createIntroSlide(reqTimeLabel, set.date_label, set.slide_count, set.id);
        db.prepare('UPDATE slideset_items SET image_path = ? WHERE slideset_id = ? AND slide_type = ?').run(introPath, set.id, 'intro');
        db.prepare('UPDATE slidesets SET title = ? WHERE id = ?').run(newTitle, set.id);
        
        // Update in memory for video creator and TTS
        set.title = newTitle;
        const introItem = items.find(i => i.slide_type === 'intro');
        if (introItem) introItem.image_path = introPath;
      }
    }

    // Build per-slide durations
    const validItems = items.filter(i => i.image_path && fs.existsSync(i.image_path));
    const imagePaths = validItems.map(i => i.image_path);
    let durations = validItems.map(i => {
      if (i.slide_type === 'intro' || i.slide_type === 'cta') return introDuration;
      return newsDuration;
    });

    // ========== TTS PROCESSING ==========
    let mergedAudioPath = null;
    if (enableTTS) {
      const ttsService = require('../services/ttsService');
      console.log(`🔊 TTS enabled (voice: ${ttsVoice}, rate: ${ttsRate})`);

      // Build text for each slide
      const slideTexts = validItems.map(item => {
        let text = '';
        if (item.slide_type === 'intro') {
          text = `${set.title}. Cùng điểm qua những tin tức nổi bật!`;
        } else if (item.slide_type === 'cta') {
          text = 'Cảm ơn bạn đã theo dõi. Nhớ theo dõi kênh để cập nhật tin tức mới nhất mỗi ngày nhé!';
        } else if (item.slide_type === 'news') {
          text = item.summary_text || item.news_title || '';
          if (item.news_desc && !item.summary_text) {
            text += '. ' + item.news_desc;
          }
        }
        return { index: item.slide_index, type: item.slide_type, text: text.trim() };
      });

      // Generate TTS for each slide
      const audioResults = await ttsService.generateSlideAudios(slideTexts, {
        voice: ttsVoice,
        rate: ttsRate,
        prefix: `ss${set.id}`
      });

      // Auto-adjust slide durations to match TTS audio length (with padding)
      const PADDING = 0.8; // Extra seconds after speech
      for (let i = 0; i < audioResults.length; i++) {
        if (audioResults[i].duration > 0) {
          const audioDur = audioResults[i].duration + PADDING;
          // Use the longer of: TTS duration or manual duration
          durations[i] = Math.max(durations[i], Math.ceil(audioDur));
        }
      }

      console.log(`   📐 Adjusted durations: [${durations.join(', ')}]`);

      // Save audio info to DB
      const updateStmt = db.prepare('UPDATE slideset_items SET audio_path = ?, audio_duration = ? WHERE slideset_id = ? AND slide_index = ?');
      for (const result of audioResults) {
        if (result.audioPath) {
          updateStmt.run(result.audioPath, result.duration, set.id, result.index);
        }
      }

      // Merge audio clips with silence to match slide timing
      const audioParts = [];
      let currentOffset = 0;
      for (let i = 0; i < audioResults.length; i++) {
        if (audioResults[i].audioPath) {
          const silenceAfter = durations[i] - audioResults[i].duration;
          audioParts.push({
            audioPath: audioResults[i].audioPath,
            silenceAfter: Math.max(0, silenceAfter)
          });
        } else {
          // No audio for this slide - just add silence for the full duration
          const silencePath = path.join(__dirname, '..', 'temp', 'audio', `silence_${durations[i]}s.mp3`);
          if (!fs.existsSync(silencePath)) {
            await ttsService._generateSilence(durations[i], silencePath);
          }
          audioParts.push({ audioPath: silencePath, silenceAfter: 0 });
        }
      }

      mergedAudioPath = await ttsService.mergeAudioClips(
        audioParts,
        `ss${set.id}_merged_${Date.now()}.mp3`
      );

      // Save TTS voice preference
      db.prepare('UPDATE slidesets SET tts_voice = ? WHERE id = ?').run(ttsVoice, set.id);
    }

    console.log(`🎬 Creating video for slideset #${set.id}: ${imagePaths.length} slides`);
    console.log(`   📐 Intro/CTA: ${introDuration}s, News: ${newsDuration}s`);
    if (enableTTS) console.log(`   🔊 TTS: ${ttsVoice}, durations adjusted to audio`);

    // Create silent video
    let videoPath = await videoCreator.createVideoFromSlides(imagePaths, {
      duration: newsDuration,
      durations: durations,
      fps: 30,
      outputName: `slideset_${set.id}_${Date.now()}.mp4`
    });

    // Merge TTS audio into video if available
    if (mergedAudioPath && fs.existsSync(mergedAudioPath)) {
      try {
        const videoWithAudio = await videoCreator.mergeAudioToVideo(videoPath, mergedAudioPath, {
          outputName: `slideset_${set.id}_tts_${Date.now()}.mp4`
        });
        // Remove silent video
        try { fs.unlinkSync(videoPath); } catch (e) {}
        videoPath = videoWithAudio;
        console.log(`✅ Video with TTS created: ${videoPath}`);
      } catch (mergeErr) {
        console.error('⚠️ Failed to merge TTS audio, using silent video:', mergeErr.message);
      }
    }

    // Get video info
    let videoInfo = { duration: 0 };
    try { videoInfo = await videoCreator.getVideoInfo(videoPath); } catch (e) {}

    db.prepare('UPDATE slidesets SET video_path = ?, video_duration = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(videoPath, videoInfo.duration || 0, 'video_ready', set.id);

    console.log(`✅ Video created for slideset #${set.id}: ${videoPath} (${Math.round(videoInfo.duration || 0)}s)`);

    res.json({
      success: true,
      video_path: '/temp/videos/' + path.basename(videoPath),
      duration: videoInfo.duration || 0,
      slide_duration: newsDuration,
      intro_duration: introDuration,
      has_tts: enableTTS && !!mergedAudioPath
    });
  } catch (error) {
    console.error('Create slideset video error:', error);
    db.prepare('UPDATE slidesets SET status = ?, error_message = ? WHERE id = ?')
      .run('error', error.message, req.params.id);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/slidesets/:id/upload - Upload video lên TikTok
router.post('/:id/upload', async (req, res) => {
  try {
    const tiktokApi = require('../services/tiktokApi');
    const account = db.prepare('SELECT * FROM tiktok_accounts WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1').get();
    if (!account) return res.status(401).json({ error: 'No TikTok account connected' });

    const set = db.prepare('SELECT * FROM slidesets WHERE id = ?').get(req.params.id);
    if (!set) return res.status(404).json({ error: 'Slideset not found' });

    // Check if video exists
    if (!set.video_path || !fs.existsSync(set.video_path)) {
      return res.status(400).json({ error: 'Chưa tạo video cho bộ slides này. Hãy tạo video trước!' });
    }

    db.prepare('UPDATE slidesets SET status = ? WHERE id = ?').run('uploading', set.id);

    const title = `${set.title} #tintuc #tintucthegioi #tintucmoinhat #vnexpress`;

    // Upload video (not photos)
    const result = await tiktokApi.directPost(account.access_token, set.video_path, title);

    db.prepare('UPDATE slidesets SET tiktok_publish_id = ?, status = ?, uploaded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(result.publish_id || 'pending', 'uploaded', set.id);

    res.json({ success: true, publish_id: result.publish_id });
  } catch (error) {
    console.error('Slideset upload error:', error);
    db.prepare('UPDATE slidesets SET status = ?, error_message = ? WHERE id = ?')
      .run('error', error.message, req.params.id);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
