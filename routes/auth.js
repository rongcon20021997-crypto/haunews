const express = require('express');
const router = express.Router();
const tiktokApi = require('../services/tiktokApi');
const youtubeApi = require('../services/youtubeApi');
const db = require('../database/db');

// GET /auth/tiktok - Redirect to TikTok login
router.get('/tiktok', (req, res) => {
  const state = Math.random().toString(36).substring(7);
  req.session.oauth_state = state;
  const authUrl = tiktokApi.getAuthUrl(state);
  res.redirect(authUrl);
});

// GET /auth/tiktok/callback - Handle OAuth callback
router.get('/tiktok/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect('/?error=' + encodeURIComponent(error));
    }

    if (!code) {
      return res.redirect('/?error=no_code');
    }

    // Exchange code for token
    console.log('🔑 Exchanging code for token...');
    console.log('  Code:', code);
    console.log('  Redirect URI:', process.env.TIKTOK_REDIRECT_URI);
    console.log('  Client Key:', process.env.TIKTOK_CLIENT_KEY);

    let tokenData;
    try {
      tokenData = await tiktokApi.getAccessToken(code);
      console.log('📦 Token response:', JSON.stringify(tokenData, null, 2));
    } catch (tokenError) {
      console.error('❌ Token exchange HTTP error:', tokenError.response?.data || tokenError.message);
      return res.redirect('/?error=' + encodeURIComponent(
        JSON.stringify(tokenError.response?.data) || tokenError.message
      ));
    }

    // Check if tokenData has the access_token at the root or wrapped in data
    const tokenPayload = tokenData.data || tokenData;

    if (tokenData.error || !tokenPayload.access_token) {
      console.error('❌ Token data error:', tokenData);
      return res.redirect('/?error=' + encodeURIComponent(tokenData.error_description || tokenData.message || 'Token exchange failed'));
    }

    const { access_token, refresh_token, expires_in, open_id } = tokenPayload;

    // Get user info
    let userInfo = {};
    try {
      userInfo = await tiktokApi.getUserInfo(access_token);
    } catch (e) {
      console.error('Failed to get user info:', e.message);
    }

    // Save to database
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
    const stmt = db.prepare(`
      INSERT INTO tiktok_accounts (open_id, username, display_name, avatar_url, access_token, refresh_token, token_expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(open_id) DO UPDATE SET
        username = excluded.username,
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        token_expires_at = excluded.token_expires_at,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(
      open_id,
      userInfo.username || '',
      userInfo.display_name || '',
      userInfo.avatar_url || '',
      access_token,
      refresh_token,
      expiresAt
    );

    // Store in session
    req.session.tiktok = {
      open_id,
      access_token,
      username: userInfo.username,
      display_name: userInfo.display_name,
      avatar_url: userInfo.avatar_url
    };

    res.redirect('/?success=logged_in');
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('/?error=' + encodeURIComponent(error.message));
  }
});

// GET /auth/status - Check login status
router.get('/status', (req, res) => {
  const account = db.prepare('SELECT * FROM tiktok_accounts WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1').get();
  if (account) {
    const isExpired = new Date(account.token_expires_at) < new Date();
    res.json({
      logged_in: !isExpired,
      account: {
        username: account.username,
        display_name: account.display_name,
        avatar_url: account.avatar_url,
        open_id: account.open_id,
        token_expired: isExpired
      }
    });
  } else {
    res.json({ logged_in: false });
  }
});

// POST /auth/refresh - Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const account = db.prepare('SELECT * FROM tiktok_accounts WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1').get();
    if (!account) return res.status(401).json({ error: 'No account found' });

    const tokenData = await tiktokApi.refreshToken(account.refresh_token);
    if (tokenData.error) {
      return res.status(400).json({ error: tokenData.error_description });
    }

    const { access_token, refresh_token, expires_in } = tokenData.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    db.prepare(`UPDATE tiktok_accounts SET access_token = ?, refresh_token = ?, token_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(access_token, refresh_token, expiresAt, account.id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  db.prepare('UPDATE tiktok_accounts SET is_active = 0').run();
  req.session.destroy();
  res.json({ success: true });
});

// ============================================================
// YOUTUBE OAUTH
// ============================================================

// GET /auth/youtube - Redirect to Google login
router.get('/youtube', (req, res) => {
  const state = 'yt_' + Math.random().toString(36).substring(7);
  req.session.yt_state = state;
  const authUrl = youtubeApi.getAuthUrl(state);
  res.redirect(authUrl);
});

// GET /auth/youtube/callback - Google OAuth callback
router.get('/youtube/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect('/?yt_error=' + encodeURIComponent(error));
    }
    if (!code) {
      return res.redirect('/?yt_error=no_code');
    }

    console.log('🔑 [YouTube] Exchanging code for token...');
    const tokenData = await youtubeApi.getAccessToken(code);

    if (tokenData.error) {
      return res.redirect('/?yt_error=' + encodeURIComponent(tokenData.error_description || 'Token exchange failed'));
    }

    const { access_token, refresh_token, expires_in } = tokenData;
    const expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();

    // Get user info (email, name, avatar)
    let userInfo = {};
    try { userInfo = await youtubeApi.getUserInfo(access_token); } catch (e) { console.error('YT userInfo error:', e.message); }

    // Get channel info
    let channelId = '', channelTitle = '';
    try {
      const channel = await youtubeApi.getChannelInfo(access_token);
      channelId = channel.id || '';
      channelTitle = channel.snippet?.title || '';
    } catch (e) { console.error('YT channel error:', e.message); }

    // Save to DB
    const googleId = userInfo.id || userInfo.sub || userInfo.email || 'unknown';
    db.prepare(`
      INSERT INTO youtube_accounts (google_id, email, display_name, avatar_url, channel_id, channel_title, access_token, refresh_token, token_expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(google_id) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url,
        channel_id = excluded.channel_id,
        channel_title = excluded.channel_title,
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, youtube_accounts.refresh_token),
        token_expires_at = excluded.token_expires_at,
        is_active = 1,
        updated_at = CURRENT_TIMESTAMP
    `).run(googleId, userInfo.email || '', userInfo.name || '', userInfo.picture || '', channelId, channelTitle, access_token, refresh_token || null, expiresAt);

    req.session.youtube = { google_id: googleId, access_token, channel_title: channelTitle };

    console.log('✅ [YouTube] Account saved:', userInfo.email, '| Channel:', channelTitle);
    res.redirect('/?yt_success=logged_in');
  } catch (error) {
    console.error('[YouTube] OAuth callback error:', error.response?.data || error.message);
    res.redirect('/?yt_error=' + encodeURIComponent(error.message));
  }
});

// GET /auth/youtube/status - Check YouTube login status
router.get('/youtube/status', (req, res) => {
  const account = db.prepare('SELECT * FROM youtube_accounts WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1').get();
  if (!account) return res.json({ logged_in: false });
  const isExpired = new Date(account.token_expires_at) < new Date();
  res.json({
    logged_in: !isExpired,
    account: {
      email: account.email,
      display_name: account.display_name,
      channel_id: account.channel_id,
      channel_title: account.channel_title,
      avatar_url: account.avatar_url,
      token_expired: isExpired
    }
  });
});

// POST /auth/youtube/logout
router.post('/youtube/logout', (req, res) => {
  db.prepare('UPDATE youtube_accounts SET is_active = 0').run();
  delete req.session.youtube;
  res.json({ success: true });
});

module.exports = router;
