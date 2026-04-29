const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'tiktok_news.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    content TEXT,
    image_url TEXT,
    source_url TEXT UNIQUE NOT NULL,
    category TEXT DEFAULT 'general',
    status TEXT DEFAULT 'new',
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    news_id INTEGER NOT NULL,
    file_path TEXT,
    thumbnail_path TEXT,
    slide_count INTEGER DEFAULT 0,
    duration REAL DEFAULT 0,
    tiktok_video_id TEXT,
    tiktok_publish_id TEXT,
    status TEXT DEFAULT 'created',
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    error_message TEXT,
    uploaded_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS slides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    news_id INTEGER NOT NULL,
    slide_index INTEGER NOT NULL,
    image_path TEXT,
    text_content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tiktok_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    open_id TEXT UNIQUE,
    username TEXT,
    display_name TEXT,
    avatar_url TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at DATETIME,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS youtube_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE,
    email TEXT,
    display_name TEXT,
    avatar_url TEXT,
    channel_id TEXT,
    channel_title TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at DATETIME,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS slidesets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT DEFAULT 'Tin tức thế giới',
    date_label TEXT,
    status TEXT DEFAULT 'created',
    slide_count INTEGER DEFAULT 7,
    tiktok_publish_id TEXT,
    error_message TEXT,
    uploaded_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS slideset_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slideset_id INTEGER NOT NULL,
    news_id INTEGER,
    slide_index INTEGER NOT NULL,
    slide_type TEXT DEFAULT 'news',
    image_path TEXT,
    summary_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (slideset_id) REFERENCES slidesets(id) ON DELETE CASCADE,
    FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_news_source_url ON news(source_url);
  CREATE INDEX IF NOT EXISTS idx_news_status ON news(status);
  CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
  CREATE INDEX IF NOT EXISTS idx_videos_news_id ON videos(news_id);
  CREATE INDEX IF NOT EXISTS idx_slidesets_status ON slidesets(status);
  CREATE INDEX IF NOT EXISTS idx_slideset_items_set ON slideset_items(slideset_id);
`);

// Insert default settings
const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
const defaultSettings = [
  ['auto_scrape', 'false'],
  ['scrape_interval', '30'],
  ['auto_upload', 'false'],
  ['slides_per_video', '5'],
  ['slide_duration', '4'],
  ['video_transition', 'fade'],
  ['watermark_text', 'Nguồn: VnExpress.net'],
  ['yt_default_privacy', 'private'],
  ['yt_default_category', '25'],
  ['yt_auto_tags', 'tin tức,vnexpress,tintucmoinhat'],
];
for (const [key, value] of defaultSettings) {
  insertSetting.run(key, value);
}

module.exports = db;
