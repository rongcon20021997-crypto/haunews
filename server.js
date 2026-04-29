require('dotenv').config();
const express = require('express');
const https = require('https');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3005;

// Ensure temp directories exist
const dirs = ['temp/images', 'temp/videos', 'temp/slidesets', 'temp/audio', 'data'];
for (const dir of dirs) {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'tiktok_news_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/temp', express.static(path.join(__dirname, 'temp')));

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/api/news', require('./routes/news'));
app.use('/api/media', require('./routes/media'));
app.use('/api/tiktok', require('./routes/tiktok'));
app.use('/api/slidesets', require('./routes/slidesets'));
app.use('/api/tts', require('./routes/tts'));
app.use('/api/youtube', require('./routes/youtube'));

// Settings API
const db = require('./database/db');

app.get('/api/settings', (req, res) => {
  const settings = db.prepare('SELECT * FROM settings').all();
  const obj = {};
  for (const s of settings) obj[s.key] = s.value;
  res.json(obj);
});

app.post('/api/settings', (req, res) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
  for (const [key, value] of Object.entries(req.body)) {
    stmt.run(key, String(value));
  }
  res.json({ success: true });
});

// Dashboard stats
app.get('/api/dashboard', (req, res) => {
  const newsCount = db.prepare('SELECT COUNT(*) as c FROM news').get().c;
  const newNews = db.prepare("SELECT COUNT(*) as c FROM news WHERE status = 'new'").get().c;
  const videoCount = db.prepare('SELECT COUNT(*) as c FROM videos').get().c;
  const uploadedCount = db.prepare("SELECT COUNT(*) as c FROM videos WHERE status = 'uploaded'").get().c;
  const totalViews = db.prepare('SELECT COALESCE(SUM(views), 0) as v FROM videos').get().v;
  const totalLikes = db.prepare('SELECT COALESCE(SUM(likes), 0) as v FROM videos').get().v;
  const recentNews = db.prepare('SELECT id, title, category, status, image_url, created_at FROM news ORDER BY created_at DESC LIMIT 5').all();
  const recentVideos = db.prepare(`
    SELECT v.id, v.status, v.views, v.likes, v.created_at, n.title as news_title, n.image_url as news_image
    FROM videos v JOIN news n ON v.news_id = n.id ORDER BY v.created_at DESC LIMIT 5
  `).all();

  res.json({ newsCount, newNews, videoCount, uploadedCount, totalViews, totalLikes, recentNews, recentVideos });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// HTTPS server with self-signed certificate
const pfxPath = path.join(__dirname, 'ssl', 'cert.pfx');
if (fs.existsSync(pfxPath)) {
  const sslOptions = {
    pfx: fs.readFileSync(pfxPath),
    passphrase: 'temp123'
  };
  https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 TikTok News Uploader running at https://0.0.0.0:${PORT}`);
    console.log(`📡 Access via IP: https://192.168.1.26:${PORT}`);
    console.log(`🔗 TikTok Redirect URI: ${process.env.TIKTOK_REDIRECT_URI}`);
    console.log(`📺 YouTube Redirect URI: ${process.env.YOUTUBE_REDIRECT_URI}`);
    console.log(`🧪 Mode: SANDBOX (privacy_level = SELF_ONLY)`);
  });
} else {
  console.error('❌ SSL certificate not found! Run: powershell -ExecutionPolicy Bypass -File generate-cert.ps1');
  process.exit(1);
}
