const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Sandbox mode: uses the same API endpoints but restricts privacy to SELF_ONLY
const IS_SANDBOX = true;
const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';
const PRIVACY_LEVEL = IS_SANDBOX ? 'SELF_ONLY' : 'PUBLIC_TO_EVERYONE';

class TikTokApi {
  constructor() {
    this.clientKey = process.env.TIKTOK_CLIENT_KEY;
    this.clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    this.redirectUri = process.env.TIKTOK_REDIRECT_URI;
  }

  /**
   * Tạo URL đăng nhập TikTok OAuth
   */
  getAuthUrl(state = 'random_state') {
    // Scopes needed:
    // user.info.basic - Login Kit
    // video.upload    - Content Posting API (upload video)
    // video.list      - Query Creator Info API (read video stats)
    const scopes = [
      'user.info.basic',
      'video.upload',
      'video.list'
    ].join(',');

    const params = new URLSearchParams({
      client_key: this.clientKey,
      scope: scopes,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      state
    });

    return `${TIKTOK_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Đổi code lấy access token
   */
  async getAccessToken(code) {
    const response = await axios.post(TIKTOK_TOKEN_URL, new URLSearchParams({
      client_key: this.clientKey,
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
    const response = await axios.post(TIKTOK_TOKEN_URL, new URLSearchParams({
      client_key: this.clientKey,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data;
  }

  /**
   * Lấy thông tin user
   */
  async getUserInfo(accessToken) {
    const fields = IS_SANDBOX ? 'open_id,union_id,avatar_url,display_name' : 'open_id,union_id,avatar_url,display_name,username,follower_count,following_count,likes_count,video_count';
    const response = await axios.get(`${TIKTOK_API_BASE}/user/info/`, {
      params: { fields: fields },
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    return response.data.data?.user || response.data;
  }

  /**
   * Upload video - Step 1: Init upload
   */
  async initVideoUpload(accessToken, videoSize) {
    const response = await axios.post(
      `${TIKTOK_API_BASE}/post/publish/inbox/video/init/`,
      {
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoSize,
          chunk_size: videoSize,
          total_chunk_count: 1
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        }
      }
    );
    return response.data;
  }

  /**
   * Upload video - Step 2: Upload file chunk
   */
  async uploadVideoChunk(uploadUrl, videoPath) {
    const fileBuffer = fs.readFileSync(videoPath);
    const fileSize = fileBuffer.length;

    const response = await axios.put(uploadUrl, fileBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': fileSize,
        'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });
    return response.data;
  }

  /**
   * Upload video - Step 3: Publish
   */
  async publishVideo(accessToken, publishId, title = '') {
    const response = await axios.post(
      `${TIKTOK_API_BASE}/post/publish/`,
      {
        publish_id: publishId,
        post_info: {
          title: title.substring(0, 150),
          privacy_level: 'SELF_ONLY',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        }
      }
    );
    return response.data;
  }

  /**
   * Direct post (photo/video) - Content Posting API
   */
  async directPost(accessToken, videoPath, title = '') {
    const fileSize = fs.statSync(videoPath).size;

    // Step 1: Init
    const initUrl = IS_SANDBOX 
      ? `${TIKTOK_API_BASE}/post/publish/inbox/video/init/`
      : `${TIKTOK_API_BASE}/post/publish/video/init/`;

    const payload = IS_SANDBOX ? {
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: fileSize,
        chunk_size: fileSize,
        total_chunk_count: 1
      }
    } : {
      post_info: {
        title: title.substring(0, 150),
        privacy_level: PRIVACY_LEVEL,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: fileSize,
        chunk_size: fileSize,
        total_chunk_count: 1
      }
    };

    const initRes = await axios.post(
      initUrl,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        }
      }
    );

    const publishId = initRes.data.data?.publish_id;
    const uploadUrl = initRes.data.data?.upload_url;

    if (!uploadUrl) {
      throw new Error('Failed to get upload URL: ' + JSON.stringify(initRes.data));
    }

    // Step 2: Upload
    const fileBuffer = fs.readFileSync(videoPath);
    await axios.put(uploadUrl, fileBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': fileSize,
        'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    return { publish_id: publishId };
  }

  /**
   * Photo post - Upload ảnh lên TikTok
   */
  async postPhotos(accessToken, imagePaths, title = '') {
    // Sandbox: use inbox endpoint (video.upload scope)
    // Production: use direct post endpoint (video.publish scope)
    const initUrl = IS_SANDBOX
      ? `${TIKTOK_API_BASE}/post/publish/inbox/content/init/`
      : `${TIKTOK_API_BASE}/post/publish/content/init/`;

    const payload = IS_SANDBOX ? {
      source_info: {
        source: 'FILE_UPLOAD',
        photo_cover_index: 0,
        photo_images: imagePaths.map(() => ({
          image_type: 'PNG'
        }))
      },
      media_type: 'PHOTO'
    } : {
      post_info: {
        title: title.substring(0, 150),
        privacy_level: PRIVACY_LEVEL,
        disable_comment: false
      },
      source_info: {
        source: 'FILE_UPLOAD',
        photo_cover_index: 0,
        photo_images: imagePaths.map(() => ({
          image_type: 'PNG'
        }))
      },
      post_mode: 'DIRECT_POST',
      media_type: 'PHOTO'
    };

    console.log('📸 Photo post init:', JSON.stringify(payload, null, 2));

    const initRes = await axios.post(initUrl, payload, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8'
      }
    });

    console.log('📸 Photo post response:', JSON.stringify(initRes.data, null, 2));

    const publishId = initRes.data?.data?.publish_id;
    const uploadUrls = initRes.data?.data?.upload_urls || [];

    if (!uploadUrls.length) {
      console.error('📸 No upload URLs returned:', initRes.data);
      return initRes.data;
    }

    // Step 2: Upload each image to its corresponding URL
    for (let i = 0; i < uploadUrls.length && i < imagePaths.length; i++) {
      const imageBuffer = fs.readFileSync(imagePaths[i]);
      console.log(`📸 Uploading image ${i + 1}/${uploadUrls.length} (${imageBuffer.length} bytes)...`);
      await axios.put(uploadUrls[i], imageBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': imageBuffer.length
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });
    }

    console.log('📸 All images uploaded! Publish ID:', publishId);
    return { data: { publish_id: publishId } };
  }

  /**
   * Lấy danh sách video đã upload
   */
  async getVideoList(accessToken, cursor = 0, maxCount = 20) {
    try {
      const response = await axios.post(
        `${TIKTOK_API_BASE}/video/list/`,
        { cursor, max_count: maxCount },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          params: { fields: 'id,title,video_description,duration,cover_image_url,share_url,view_count,like_count,comment_count,share_count,create_time' }
        }
      );
      return response.data;
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        const scopeErr = new Error(
          'Không có quyền đọc danh sách video (thiếu scope video.list). ' +
          'Hãy đăng xuất và đăng nhập lại TikTok để cấp quyền mới.'
        );
        scopeErr.code = 'MISSING_SCOPE';
        throw scopeErr;
      }
      throw err;
    }
  }

  /**
   * Check publish status
   */
  async checkPublishStatus(accessToken, publishId) {
    const response = await axios.post(
      `${TIKTOK_API_BASE}/post/publish/status/fetch/`,
      { publish_id: publishId },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  }
}

module.exports = new TikTokApi();
