const express = require('express');
const router = express.Router();
const imageCreator = require('../services/imageCreator');
const videoCreator = require('../services/videoCreator');
const scraper = require('../services/scraper');
const db = require('../database/db');
const path = require('path');
const fs = require('fs');

// POST /api/media/create-slides/:newsId - Tạo slides từ tin tức
router.post('/create-slides/:newsId', async (req, res) => {
  try {
    const news = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.newsId);
    if (!news) return res.status(404).json({ error: 'News not found' });

    // Fetch content if not available
    let article = { ...news, paragraphs: [], images: [] };
    if (!news.content) {
      const content = await scraper.fetchArticleContent(news.source_url);
      db.prepare('UPDATE news SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(content.content, news.id);
      article = { ...article, ...content };
    } else {
      article.paragraphs = news.content.split('\n\n').filter(p => p.trim().length > 20);
    }

    db.prepare('UPDATE news SET status = ? WHERE id = ?').run('processing', news.id);

    // Create slides
    const slides = await imageCreator.createAllSlides(article);

    // Create video record
    const videoInsert = db.prepare('INSERT INTO videos (news_id, slide_count, status) VALUES (?, ?, ?)');
    const result = videoInsert.run(news.id, slides.length, 'created');
    const videoId = result.lastInsertRowid;

    // Save slide records
    const slideInsert = db.prepare('INSERT INTO slides (video_id, news_id, slide_index, image_path, text_content) VALUES (?, ?, ?, ?, ?)');
    for (const slide of slides) {
      slideInsert.run(videoId, news.id, slide.index, slide.path, slide.type);
    }

    res.json({
      success: true,
      video_id: videoId,
      slides: slides.map(s => ({
        index: s.index,
        type: s.type,
        path: '/temp/images/' + path.basename(s.path)
      }))
    });
  } catch (error) {
    console.error('Create slides error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/media/create-video/:videoId - Tạo video từ slides
router.post('/create-video/:videoId', async (req, res) => {
  try {
    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.videoId);
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const slides = db.prepare('SELECT * FROM slides WHERE video_id = ? ORDER BY slide_index ASC').all(video.id);
    if (slides.length === 0) return res.status(400).json({ error: 'No slides found' });

    const slidePaths = slides.map(s => s.image_path);

    // Get settings
    const duration = db.prepare('SELECT value FROM settings WHERE key = ?').get('slide_duration');
    const transition = db.prepare('SELECT value FROM settings WHERE key = ?').get('video_transition');

    const videoPath = await videoCreator.createVideoWithTransitions(slidePaths, {
      duration: Number(duration?.value || 4),
      outputName: `news_${video.news_id}_${Date.now()}.mp4`
    });

    // Get video info
    let videoInfo = { duration: 0 };
    try { videoInfo = await videoCreator.getVideoInfo(videoPath); } catch (e) {}

    db.prepare('UPDATE videos SET file_path = ?, duration = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(videoPath, videoInfo.duration || 0, 'ready', video.id);

    res.json({
      success: true,
      video_path: '/temp/videos/' + path.basename(videoPath),
      duration: videoInfo.duration
    });
  } catch (error) {
    console.error('Create video error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/media/videos - Danh sách videos
router.get('/videos', (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = '1=1';
  const params = [];
  if (status) { where += ' AND v.status = ?'; params.push(status); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM videos v WHERE ${where}`).get(...params).count;
  const videos = db.prepare(`
    SELECT v.*, n.title as news_title, n.source_url, n.image_url as news_image
    FROM videos v JOIN news n ON v.news_id = n.id
    WHERE ${where} ORDER BY v.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));

  res.json({ data: videos, total, page: Number(page), pages: Math.ceil(total / limit) });
});

// GET /api/media/video/:id
router.get('/video/:id', (req, res) => {
  const video = db.prepare(`
    SELECT v.*, n.title as news_title, n.source_url, n.image_url as news_image, n.category
    FROM videos v JOIN news n ON v.news_id = n.id WHERE v.id = ?
  `).get(req.params.id);
  if (!video) return res.status(404).json({ error: 'Not found' });
  const slides = db.prepare('SELECT * FROM slides WHERE video_id = ? ORDER BY slide_index').all(video.id);
  res.json({ ...video, slides: slides.map(s => ({ ...s, url: '/temp/images/' + path.basename(s.image_path) })) });
});

// DELETE /api/media/video/:id
router.delete('/video/:id', (req, res) => {
  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
  if (video) {
    // Delete files
    if (video.file_path && fs.existsSync(video.file_path)) fs.unlinkSync(video.file_path);
    const slides = db.prepare('SELECT image_path FROM slides WHERE video_id = ?').all(video.id);
    for (const s of slides) { try { fs.unlinkSync(s.image_path); } catch (e) {} }
    db.prepare('DELETE FROM slides WHERE video_id = ?').run(video.id);
    db.prepare('DELETE FROM videos WHERE id = ?').run(video.id);
  }
  res.json({ success: true });
});

module.exports = router;
