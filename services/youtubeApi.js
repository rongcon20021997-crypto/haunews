const axios = require('axios');
const fs = require('fs');
const path = require('path');

const YOUTUBE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const YOUTUBE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos';

class YouTubeApi {
  constructor() {
    this.clientId = process.env.YOUTUBE_CLIENT_ID;
    this.clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    this.redirectUri = process.env.YOUTUBE_REDIRECT_URI;
  }

  /**
   * Tạo URL đăng nhập Google OAuth
   */
  getAuthUrl(state = 'yt_state') {
    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/drive.file'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent',
      state
    });

    return `${YOUTUBE_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Đổi code lấy access token
   */
  async getAccessToken(code) {
    const response = await axios.post(YOUTUBE_TOKEN_URL, new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data;
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken) {
    const response = await axios.post(YOUTUBE_TOKEN_URL, new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data;
  }

  /**
   * Lấy thông tin channel của user
   */
  async getChannelInfo(accessToken) {
    const response = await axios.get(`${YOUTUBE_API_BASE}/channels`, {
      params: {
        part: 'snippet,statistics,contentDetails',
        mine: true
      },
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const channel = response.data.items?.[0];
    if (!channel) throw new Error('No YouTube channel found for this account');
    return channel;
  }

  /**
   * Lấy thông tin profile user (email, name, avatar)
   */
  async getUserInfo(accessToken) {
    const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
  }

  /**
   * Upload video lên YouTube - Resumable upload
   */
  async uploadVideo(accessToken, videoPath, metadata = {}) {
    const fileSize = fs.statSync(videoPath).size;
    const {
      title = 'Video tin tức',
      description = '',
      tags = [],
      privacyStatus = 'public',  // 'public', 'private', 'unlisted'
      categoryId = '25'           // 25 = News & Politics
    } = metadata;

    // Step 1: Initiate resumable upload session
    const initResponse = await axios.post(
      `${YOUTUBE_UPLOAD_URL}?uploadType=resumable&part=snippet,status`,
      {
        snippet: {
          title: title.substring(0, 100),
          description: description.substring(0, 5000),
          tags: tags.slice(0, 500),
          categoryId
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'video/mp4',
          'X-Upload-Content-Length': fileSize
        }
      }
    );

    const uploadUrl = initResponse.headers['location'];
    if (!uploadUrl) throw new Error('Failed to get YouTube upload URL');

    console.log(`📤 YouTube upload URL obtained, uploading ${Math.round(fileSize / 1024 / 1024)}MB...`);

    // Step 2: Upload the video file
    const fileBuffer = fs.readFileSync(videoPath);
    const uploadResponse = await axios.put(uploadUrl, fileBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': fileSize
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 0  // No timeout for large files
    });

    const videoId = uploadResponse.data?.id;
    console.log(`✅ YouTube upload complete! Video ID: ${videoId}`);
    return { video_id: videoId, data: uploadResponse.data };
  }

  /**
   * Lấy danh sách video từ channel
   */
  async getVideoList(accessToken, maxResults = 20, pageToken = null) {
    const params = {
      part: 'snippet,statistics,status,contentDetails',
      mine: true,
      maxResults,
      type: 'video',
      order: 'date'
    };
    if (pageToken) params.pageToken = pageToken;

    const searchRes = await axios.get(`${YOUTUBE_API_BASE}/search`, {
      params,
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const videoIds = searchRes.data.items?.map(i => i.id.videoId).filter(Boolean);
    if (!videoIds?.length) return { items: [], nextPageToken: null, totalResults: 0 };

    // Get detailed stats
    const detailRes = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
      params: {
        part: 'snippet,statistics,status,contentDetails',
        id: videoIds.join(',')
      },
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    return {
      items: detailRes.data.items || [],
      nextPageToken: searchRes.data.nextPageToken || null,
      totalResults: searchRes.data.pageInfo?.totalResults || 0
    };
  }

  /**
   * Lấy thống kê channel
   */
  async getChannelStats(accessToken) {
    const channel = await this.getChannelInfo(accessToken);
    return {
      channel_id: channel.id,
      title: channel.snippet?.title,
      description: channel.snippet?.description,
      thumbnail: channel.snippet?.thumbnails?.default?.url,
      subscriber_count: parseInt(channel.statistics?.subscriberCount || 0),
      video_count: parseInt(channel.statistics?.videoCount || 0),
      view_count: parseInt(channel.statistics?.viewCount || 0)
    };
  }

  /**
   * Cập nhật metadata video
   */
  async updateVideo(accessToken, videoId, metadata = {}) {
    const response = await axios.put(
      `${YOUTUBE_API_BASE}/videos?part=snippet,status`,
      {
        id: videoId,
        snippet: {
          title: metadata.title?.substring(0, 100),
          description: metadata.description?.substring(0, 5000),
          tags: metadata.tags,
          categoryId: metadata.categoryId || '25'
        },
        status: {
          privacyStatus: metadata.privacyStatus || 'public'
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  }

  /**
   * Xóa video khỏi YouTube
   */
  async deleteVideo(accessToken, videoId) {
    await axios.delete(`${YOUTUBE_API_BASE}/videos`, {
      params: { id: videoId },
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return { success: true };
  }

  // ================== GOOGLE DRIVE ==================

  /**
   * Tạo hoặc lấy ID thư mục trên Drive
   */
  async ensureDriveFolder(accessToken, folderName) {
    const query = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const searchRes = await axios.get(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (searchRes.data.files && searchRes.data.files.length > 0) {
      return searchRes.data.files[0].id;
    }

    // Create folder
    const createRes = await axios.post('https://www.googleapis.com/drive/v3/files', {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    }, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    return createRes.data.id;
  }

  /**
   * Upload file lên Google Drive
   */
  async uploadFileToDrive(accessToken, filePath, mimeType, fileName, folderName = 'TikTok News Sync') {
    const fileSize = fs.statSync(filePath).size;
    
    // Đảm bảo thư mục tồn tại
    const folderId = await this.ensureDriveFolder(accessToken, folderName);
    
    // Check if file exists in that folder
    let fileId = null;
    try {
      const query = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
      const searchRes = await axios.get(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (searchRes.data.files && searchRes.data.files.length > 0) {
        fileId = searchRes.data.files[0].id;
      }
    } catch (e) {
      console.log('Search Drive error:', e.message);
    }

    const metadata = { name: fileName };
    if (!fileId) {
      metadata.parents = [folderId]; // Chỉ set thư mục khi tạo mới
    }

    // Step 1: Initiate resumable upload
    const url = fileId 
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
      
    const initResponse = await axios({
      method: fileId ? 'PATCH' : 'POST',
      url,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': fileSize
      },
      data: metadata
    });

    const uploadUrl = initResponse.headers['location'];
    if (!uploadUrl) throw new Error('Failed to get Google Drive upload URL');

    // Step 2: Upload file
    const fileBuffer = fs.readFileSync(filePath);
    const uploadResponse = await axios.put(uploadUrl, fileBuffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Length': fileSize
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 0
    });

    return uploadResponse.data;
  }

  /**
   * Download file từ Google Drive
   */
  async downloadFileFromDrive(accessToken, fileName, destPath) {
    // 1. Search for file
    const query = encodeURIComponent(`name='${fileName}' and trashed=false`);
    const searchRes = await axios.get(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!searchRes.data.files || searchRes.data.files.length === 0) {
      throw new Error('File not found on Google Drive');
    }
    const fileId = searchRes.data.files[0].id;

    // 2. Download file
    const response = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }
}

module.exports = new YouTubeApi();
