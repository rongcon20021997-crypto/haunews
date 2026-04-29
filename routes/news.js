const express = require('express');
const router = express.Router();
const scraper = require('../services/scraper');
const db = require('../database/db');

// GET /api/news - Danh sách tin tức đã lưu
router.get('/', (req, res) => {
  const { status, page = 1, limit = 20, search = '' } = req.query;
  const offset = (page - 1) * limit;

  let where = '1=1';
  const params = [];
  if (status) { where += ' AND status = ?'; params.push(status); }
  if (search) { where += ' AND (title LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM news WHERE ${where}`).get(...params).count;
  const news = db.prepare(`SELECT * FROM news WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, Number(limit), Number(offset));

  res.json({ data: news, total, page: Number(page), pages: Math.ceil(total / limit) });
});

// POST /api/news/scrape - Lấy tin mới từ VnExpress
router.post('/scrape', async (req, res) => {
  try {
    const articles = await scraper.fetchLatestNews(20);
    const insertStmt = db.prepare(`INSERT OR IGNORE INTO news (title, description, image_url, source_url, category) VALUES (?, ?, ?, ?, ?)`);

    let added = 0, skipped = 0;
    for (const article of articles) {
      const existing = db.prepare('SELECT id FROM news WHERE source_url = ?').get(article.source_url);
      if (existing) { skipped++; continue; }
      insertStmt.run(article.title, article.description, article.image_url, article.source_url, article.category);
      added++;
    }

    res.json({ success: true, added, skipped, total: articles.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/news/:id/fetch-content - Lấy nội dung chi tiết
router.post('/:id/fetch-content', async (req, res) => {
  try {
    const news = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.id);
    if (!news) return res.status(404).json({ error: 'News not found' });

    const content = await scraper.fetchArticleContent(news.source_url);
    db.prepare('UPDATE news SET content = ?, description = COALESCE(NULLIF(?, ""), description), image_url = COALESCE(NULLIF(?, ""), image_url), category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(content.content, content.description, content.image_url, content.category, news.id);

    res.json({ success: true, data: content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/news/:id - Chi tiết 1 tin
router.get('/:id', (req, res) => {
  const news = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.id);
  if (!news) return res.status(404).json({ error: 'Not found' });
  const videos = db.prepare('SELECT * FROM videos WHERE news_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ ...news, videos });
});

// DELETE /api/news/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM news WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/news/check-url - Kiểm tra URL đã tồn tại chưa
router.post('/check-url', (req, res) => {
  const { url } = req.body;
  const existing = db.prepare('SELECT id, title, status FROM news WHERE source_url = ?').get(url);
  res.json({ exists: !!existing, data: existing || null });
});

module.exports = router;
