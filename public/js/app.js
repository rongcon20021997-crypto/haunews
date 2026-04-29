// ========== STATE ==========
let currentPage = 'dashboard';
let newsFilter = 'all';
let videoFilter = 'all';
let slidesetFilter = 'all';
let newsPage = 1;

// ========== UTILITIES ==========
async function api(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    return await res.json();
  } catch (e) {
    console.error('API Error:', e);
    toast('Lỗi kết nối server', 'error');
    return null;
  }
}

function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `${icons[type] || ''} ${message}`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(100px)'; setTimeout(() => el.remove(), 300); }, 3500);
}

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const d = new Date(dateStr);
  const s = Math.floor((now - d) / 1000);
  if (s < 60) return 'Vừa xong';
  if (s < 3600) return Math.floor(s / 60) + ' phút trước';
  if (s < 86400) return Math.floor(s / 3600) + ' giờ trước';
  return Math.floor(s / 86400) + ' ngày trước';
}

function statusBadge(status) {
  const labels = { 'new': 'Mới', 'processing': 'Đang xử lý', 'ready': 'Sẵn sàng', 'video_ready': 'Video sẵn sàng', 'uploaded': 'Đã upload', 'uploading': 'Đang upload', 'error': 'Lỗi', 'created': 'Đã tạo' };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

// ========== NAVIGATION ==========
function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');

  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'news': loadNews(); break;
    case 'videos': loadVideos(); break;
    case 'slidesets': loadSlidesets(); break;
    case 'upload': loadUploadList(); break;
    case 'stats': loadTikTokStats(); break;
    case 'settings': loadSettings(); break;
    case 'youtube': loadYouTubePage(); break;
    case 'drive': loadDrivePage(); break;
  }
}

// ========== DASHBOARD ==========
async function loadDashboard() {
  const data = await api('/api/dashboard');
  if (!data) return;

  document.getElementById('stat-news').textContent = formatNumber(data.newsCount);
  document.getElementById('stat-videos').textContent = formatNumber(data.videoCount);
  document.getElementById('stat-views').textContent = formatNumber(data.totalViews);
  document.getElementById('stat-likes').textContent = formatNumber(data.totalLikes);
  document.getElementById('nav-news-count').textContent = data.newNews || 0;

  // Recent news
  const newsEl = document.getElementById('recent-news');
  if (data.recentNews?.length) {
    newsEl.innerHTML = data.recentNews.map(n => `
      <div class="news-item" onclick="viewNewsDetail(${n.id})">
        <img class="news-thumb" src="${n.image_url || ''}" alt="" onerror="this.style.display='none'">
        <div class="news-info">
          <div class="news-title">${n.title}</div>
          <div class="news-meta">
            ${statusBadge(n.status)}
            <span>${n.category || ''}</span>
            <span>${timeAgo(n.created_at)}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Recent videos
  const vidEl = document.getElementById('recent-videos');
  if (data.recentVideos?.length) {
    vidEl.innerHTML = data.recentVideos.map(v => `
      <div class="news-item" onclick="viewVideoDetail(${v.id})">
        <img class="news-thumb" src="${v.news_image || ''}" alt="" onerror="this.style.display='none'">
        <div class="news-info">
          <div class="news-title">${v.news_title}</div>
          <div class="news-meta">
            ${statusBadge(v.status)}
            <span>👁️ ${formatNumber(v.views)}</span>
            <span>❤️ ${formatNumber(v.likes)}</span>
          </div>
        </div>
      </div>
    `).join('');
  }
}

// ========== NEWS ==========
async function scrapeNews() {
  toast('Đang lấy tin tức từ VnExpress...', 'info');
  const data = await api('/api/news/scrape', { method: 'POST' });
  if (data?.success) {
    toast(`Đã thêm ${data.added} tin mới (bỏ qua ${data.skipped} tin trùng)`, 'success');
    loadNews();
    loadDashboard();
  } else {
    toast('Lỗi lấy tin: ' + (data?.error || 'Unknown'), 'error');
  }
}

async function loadNews(page = 1) {
  newsPage = page;
  const search = document.getElementById('news-search')?.value || '';
  const status = newsFilter === 'all' ? '' : newsFilter;
  const data = await api(`/api/news?page=${page}&limit=15&status=${status}&search=${encodeURIComponent(search)}`);
  if (!data) return;

  const el = document.getElementById('news-list');
  if (data.data?.length) {
    el.innerHTML = `<table class="data-table"><thead><tr>
      <th style="width:50px"></th><th>Tiêu đề</th><th>Danh mục</th><th>Trạng thái</th><th>Thời gian</th><th>Hành động</th>
    </tr></thead><tbody>${data.data.map(n => `<tr>
      <td><img src="${n.image_url || ''}" style="width:60px;height:40px;object-fit:cover;border-radius:6px;" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2240%22><rect fill=%22%231e1e2e%22 width=%2260%22 height=%2240%22/></svg>'"></td>
      <td><div style="max-width:350px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;">${n.title}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${n.source_url.substring(0, 60)}...</div></td>
      <td><span style="font-size:13px;">${n.category || '-'}</span></td>
      <td>${statusBadge(n.status)}</td>
      <td style="font-size:12px;color:var(--text-muted);">${timeAgo(n.created_at)}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-secondary" onclick="viewNewsDetail(${n.id})" title="Chi tiết">👁️</button>
          <button class="btn btn-sm btn-primary" onclick="createSlides(${n.id})" title="Tạo slides">🎨</button>
          <button class="btn btn-sm btn-danger" onclick="deleteNews(${n.id})" title="Xóa">🗑️</button>
        </div>
      </td>
    </tr>`).join('')}</tbody></table>`;
  } else {
    el.innerHTML = '<div class="empty-state"><div class="icon">📰</div><h4>Không có tin tức</h4></div>';
  }

  // Pagination
  const pagEl = document.getElementById('news-pagination');
  if (data.pages > 1) {
    let btns = '';
    for (let i = 1; i <= data.pages; i++) {
      btns += `<button class="btn btn-sm ${i === page ? 'btn-primary' : 'btn-secondary'}" onclick="loadNews(${i})">${i}</button>`;
    }
    pagEl.innerHTML = btns;
  } else {
    pagEl.innerHTML = '';
  }
}

function filterNews(status, el) {
  newsFilter = status;
  document.querySelectorAll('#page-news .tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  loadNews(1);
}

function searchNews() {
  clearTimeout(window._searchTimer);
  window._searchTimer = setTimeout(() => loadNews(1), 400);
}

async function viewNewsDetail(id) {
  const data = await api(`/api/news/${id}`);
  if (!data) return;

  openModal('📰 Chi tiết tin tức', `
    <div style="margin-bottom:16px;">
      ${data.image_url ? `<img src="${data.image_url}" style="width:100%;max-height:300px;object-fit:cover;border-radius:12px;margin-bottom:16px;">` : ''}
      <h3 style="font-size:18px;font-weight:700;margin-bottom:8px;">${data.title}</h3>
      <div style="display:flex;gap:12px;margin-bottom:12px;font-size:13px;">
        ${statusBadge(data.status)}
        <span style="color:var(--text-muted)">📂 ${data.category || 'Tin tức'}</span>
        <span style="color:var(--text-muted)">🕐 ${timeAgo(data.created_at)}</span>
      </div>
      <p style="color:var(--text-secondary);font-size:14px;line-height:1.7;margin-bottom:12px;">${data.description || ''}</p>
      ${data.content ? `<div style="padding:16px;background:var(--bg-surface);border-radius:12px;font-size:13px;line-height:1.8;color:var(--text-secondary);max-height:200px;overflow-y:auto;">${data.content.replace(/\n/g, '<br>')}</div>` : '<p style="color:var(--text-muted);font-style:italic;">Chưa lấy nội dung chi tiết</p>'}
      <div style="margin-top:12px;"><a href="${data.source_url}" target="_blank" style="color:var(--secondary);font-size:13px;">🔗 Nguồn: ${data.source_url}</a></div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="fetchContent(${data.id})">📥 Lấy nội dung</button>
    <button class="btn btn-primary" onclick="createSlides(${data.id})">🎨 Tạo Slides</button>
    <button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
  `);
}

async function fetchContent(id) {
  toast('Đang lấy nội dung chi tiết...', 'info');
  const data = await api(`/api/news/${id}/fetch-content`, { method: 'POST' });
  if (data?.success) {
    toast('Đã lấy nội dung thành công!', 'success');
    viewNewsDetail(id);
  } else {
    toast('Lỗi: ' + (data?.error || 'Unknown'), 'error');
  }
}

async function deleteNews(id) {
  if (!confirm('Xóa tin tức này?')) return;
  await api(`/api/news/${id}`, { method: 'DELETE' });
  toast('Đã xóa', 'success');
  loadNews(newsPage);
}

function checkUrlModal() {
  openModal('🔗 Kiểm tra URL', `
    <div class="form-group">
      <label class="form-label">Nhập URL bài viết VnExpress</label>
      <input type="url" class="form-input" id="check-url-input" placeholder="https://vnexpress.net/...">
    </div>
    <div id="check-url-result" style="margin-top:12px;"></div>
  `, `
    <button class="btn btn-primary" onclick="checkUrl()">🔍 Kiểm tra</button>
    <button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
  `);
}

async function checkUrl() {
  const url = document.getElementById('check-url-input').value.trim();
  if (!url) return toast('Nhập URL', 'error');
  const data = await api('/api/news/check-url', { method: 'POST', body: JSON.stringify({ url }) });
  const el = document.getElementById('check-url-result');
  if (data?.exists) {
    el.innerHTML = `<div style="padding:12px;background:rgba(255,193,7,0.1);border-radius:8px;border:1px solid rgba(255,193,7,0.3);">
      <strong style="color:var(--warning);">⚠️ URL đã tồn tại!</strong>
      <p style="margin-top:8px;font-size:13px;color:var(--text-secondary);">Tiêu đề: ${data.data.title}</p>
      <p style="font-size:13px;color:var(--text-muted);">Trạng thái: ${statusBadge(data.data.status)}</p>
    </div>`;
  } else {
    el.innerHTML = `<div style="padding:12px;background:rgba(0,200,83,0.1);border-radius:8px;border:1px solid rgba(0,200,83,0.3);">
      <strong style="color:var(--success);">✅ URL chưa có trong hệ thống</strong><p style="margin-top:4px;font-size:13px;color:var(--text-muted);">Có thể lấy tin mới từ URL này</p>
    </div>`;
  }
}

// ========== SLIDES & VIDEOS ==========
async function createSlides(newsId) {
  toast('Đang tạo slides...', 'info');
  closeModal();
  const data = await api(`/api/media/create-slides/${newsId}`, { method: 'POST' });
  if (data?.success) {
    toast(`Đã tạo ${data.slides.length} slides!`, 'success');
    // Show slides preview
    openModal('🎨 Preview Slides', `
      <div class="slides-preview">${data.slides.map(s => `
        <div class="slide-preview"><img src="${s.path}" alt="Slide ${s.index}"></div>
      `).join('')}</div>
      <p style="text-align:center;color:var(--text-muted);font-size:13px;">Video ID: ${data.video_id}</p>
    `, `
      <button class="btn btn-primary" onclick="createVideo(${data.video_id})">🎬 Tạo Video</button>
      <button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
    `);
  } else {
    toast('Lỗi tạo slides: ' + (data?.error || 'Unknown'), 'error');
  }
}

async function createVideo(videoId) {
  toast('Đang tạo video bằng FFmpeg...', 'info');
  closeModal();
  const data = await api(`/api/media/create-video/${videoId}`, { method: 'POST' });
  if (data?.success) {
    toast('Video đã tạo thành công!', 'success');
    openModal('🎬 Video đã tạo', `
      <div style="text-align:center;">
        <video src="${data.video_path}" controls style="max-width:100%;max-height:500px;border-radius:12px;"></video>
        <p style="margin-top:12px;color:var(--text-muted);">Thời lượng: ${Math.round(data.duration || 0)}s</p>
      </div>
    `, `
      <button class="btn btn-tiktok" onclick="uploadToTikTok(${videoId})">⬆️ Upload TikTok</button>
      <button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
    `);
  } else {
    toast('Lỗi tạo video: ' + (data?.error || 'Unknown'), 'error');
  }
}

async function loadVideos() {
  const status = videoFilter === 'all' ? '' : videoFilter;
  const data = await api(`/api/media/videos?status=${status}`);
  if (!data) return;

  const el = document.getElementById('video-list');
  if (data.data?.length) {
    el.innerHTML = data.data.map(v => `
      <div class="video-card">
        <img class="video-thumb" src="${v.news_image || ''}" alt="" onerror="this.style.background='var(--bg-surface)'">
        <div class="video-info">
          <div class="video-title">${v.news_title || 'Video #' + v.id}</div>
          <div style="margin-bottom:8px;">${statusBadge(v.status)}</div>
          <div class="video-stats">
            <span>👁️ ${formatNumber(v.views)}</span>
            <span>❤️ ${formatNumber(v.likes)}</span>
            <span>💬 ${formatNumber(v.comments)}</span>
            <span>🔄 ${formatNumber(v.shares)}</span>
          </div>
          <div class="video-actions">
            ${v.status === 'created' ? `<button class="btn btn-sm btn-primary" onclick="createVideo(${v.id})">🎬 Tạo video</button>` : ''}
            ${['ready', 'error'].includes(v.status) ? `<button class="btn btn-sm btn-tiktok" onclick="uploadToTikTok(${v.id})">⬆️ Upload</button>` : ''}
            <button class="btn btn-sm btn-secondary" onclick="viewVideoDetail(${v.id})">👁️</button>
            <button class="btn btn-sm btn-danger" onclick="deleteVideo(${v.id})">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');
  } else {
    el.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="icon">🎬</div><h4>Không có video</h4></div>';
  }
}

function filterVideos(status, el) {
  videoFilter = status;
  document.querySelectorAll('#page-videos .tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  loadVideos();
}

async function viewVideoDetail(id) {
  const data = await api(`/api/media/video/${id}`);
  if (!data) return;
  openModal('🎬 Chi tiết Video #' + id, `
    <div>
      <h3 style="font-size:16px;font-weight:700;margin-bottom:12px;">${data.news_title || ''}</h3>
      <div style="display:flex;gap:12px;margin-bottom:16px;">
        ${statusBadge(data.status)}
        <span style="color:var(--text-muted);font-size:13px;">📂 ${data.category || ''}</span>
      </div>
      ${data.drive_url 
        ? `<div style="text-align:center;padding:24px;background:var(--bg-surface);border-radius:12px;margin-bottom:16px;border:1px dashed rgba(255,255,255,0.2);">
             <div style="font-size:32px;margin-bottom:8px;">☁️</div>
             <div style="margin-bottom:12px;color:var(--text-secondary);">Video này đã được chuyển lên Google Drive để nhẹ máy.</div>
             <a href="${data.drive_url}" target="_blank" class="btn btn-secondary" style="color:var(--secondary);border-color:var(--secondary);">▶️ Mở xem trên Drive</a>
           </div>`
        : (data.file_path ? `<video src="/temp/videos/${data.file_path.split(/[/\\\\]/).pop()}" controls style="width:100%;max-height:400px;border-radius:12px;margin-bottom:16px;"></video>` : '')}
      ${data.slides?.length ? `<h4 style="margin-bottom:8px;font-size:14px;">Slides (${data.slides.length})</h4><div class="slides-preview">${data.slides.map(s => `<div class="slide-preview"><img src="${s.url}" alt="Slide"></div>`).join('')}</div>` : ''}
      <div class="video-stats" style="margin-top:16px;font-size:14px;">
        <span>👁️ ${formatNumber(data.views)} views</span>
        <span>❤️ ${formatNumber(data.likes)} likes</span>
        <span>💬 ${formatNumber(data.comments)} comments</span>
        <span>🔄 ${formatNumber(data.shares)} shares</span>
      </div>
      <div style="margin-top:12px;font-size:12px;color:var(--text-muted);">
        <a href="${data.source_url}" target="_blank" style="color:var(--secondary);">🔗 Nguồn: VnExpress</a>
      </div>
    </div>
  `, `
    ${['ready', 'error'].includes(data.status) ? `<button class="btn btn-tiktok" onclick="uploadToTikTok(${id})">⬆️ Upload TikTok</button>` : ''}
    <button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
  `);
}

async function deleteVideo(id) {
  if (!confirm('Xóa video này?')) return;
  await api(`/api/media/video/${id}`, { method: 'DELETE' });
  toast('Đã xóa video', 'success');
  loadVideos();
}

// ========== TIKTOK ==========
async function uploadToTikTok(videoId) {
  toast('Đang upload lên TikTok...', 'info');
  closeModal();
  const data = await api(`/api/tiktok/upload/${videoId}`, { method: 'POST' });
  if (data?.success) {
    toast('Upload thành công! Publish ID: ' + data.publish_id, 'success');
    loadVideos();
  } else {
    toast('Lỗi upload: ' + (data?.error || 'Unknown'), 'error');
  }
}

async function loadUploadList() {
  const el = document.getElementById('upload-list');

  // Load both regular videos (ready) and slidesets (video_ready)
  const [videoData, slidesetData] = await Promise.all([
    api('/api/media/videos?status=ready'),
    api('/api/slidesets?status=video_ready')
  ]);

  const videoRows = (videoData?.data || []).map(v => `<tr>
    <td><img src="${v.news_image || ''}" style="width:60px;height:40px;object-fit:cover;border-radius:6px;" onerror="this.style.display='none'"></td>
    <td style="font-weight:600;">${v.news_title || 'Video #' + v.id}</td>
    <td><span style="font-size:11px;padding:2px 6px;background:rgba(99,102,241,0.15);border-radius:4px;color:#a5b4fc;">🎬 Video đơn</span></td>
    <td>${statusBadge(v.status)}</td>
    <td style="font-size:12px;color:var(--text-muted);">${timeAgo(v.created_at)}</td>
    <td><button class="btn btn-sm btn-tiktok" onclick="uploadToTikTok(${v.id})">⬆️ Upload</button></td>
  </tr>`);

  const slidesetRows = (slidesetData?.data || []).map(s => `<tr>
    <td><div style="width:60px;height:40px;background:var(--bg-surface);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:18px;">🖼️</div></td>
    <td style="font-weight:600;">${s.title || 'Bộ slides #' + s.id}</td>
    <td><span style="font-size:11px;padding:2px 6px;background:rgba(0,242,234,0.1);border-radius:4px;color:var(--secondary);">🖼️ Bộ slides · ${s.slide_count} slides</span></td>
    <td>${statusBadge(s.status)}</td>
    <td style="font-size:12px;color:var(--text-muted);">${timeAgo(s.created_at)}</td>
    <td><button class="btn btn-sm btn-tiktok" onclick="uploadSlideset(${s.id})">⬆️ Upload</button></td>
  </tr>`);

  const allRows = [...videoRows, ...slidesetRows];

  if (allRows.length) {
    el.innerHTML = `<table class="data-table"><thead><tr>
      <th></th><th>Tiêu đề</th><th>Loại</th><th>Trạng thái</th><th>Thời gian</th><th>Hành động</th>
    </tr></thead><tbody>${allRows.join('')}</tbody></table>`;
  } else {
    el.innerHTML = '<div class="empty-state"><div class="icon">⬆️</div><h4>Không có video sẵn sàng</h4><p>Tạo video từ Bộ Slides hoặc Tin tức trước</p></div>';
  }
}

async function syncTikTokStats() {
  const btn = document.getElementById('btn-sync-stats');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang sync...'; }
  toast('Đang đồng bộ thống kê từ TikTok...', 'info');

  const data = await api('/api/tiktok/videos');
  if (btn) { btn.disabled = false; btn.textContent = '🔄 Sync từ TikTok'; }

  if (data?.error) {
    const isScopeError = data.error.includes('scope') || data.error.includes('quyền');
    if (isScopeError) {
      // Show modal with re-login instruction
      openModal('🔒 Cần cấp thêm quyền', `
        <div style="text-align:center;padding:8px 0;">
          <div style="font-size:48px;margin-bottom:16px;">🔒</div>
          <h3 style="font-size:18px;margin-bottom:12px;">Thiếu quyền <code style="background:var(--bg-surface);padding:2px 8px;border-radius:4px;font-size:14px;">video.list</code></h3>
          <p style="color:var(--text-secondary);font-size:14px;line-height:1.7;margin-bottom:16px;">
            Access token hiện tại không có quyền đọc danh sách video TikTok.<br>
            Cần <strong>đăng xuất và đăng nhập lại</strong> để cấp thêm quyền mới.
          </p>
          <div style="padding:12px;background:rgba(0,242,234,0.08);border-radius:8px;font-size:13px;color:var(--secondary);text-align:left;">
            <strong>Sau khi đăng nhập lại:</strong><br>
            ✅ Scope <code>video.list</code> sẽ được cấp tự động<br>
            ✅ Có thể sync view/like từ TikTok về app<br>
            ✅ Upload video vẫn hoạt động bình thường
          </div>
        </div>
      `, `
        <button class="btn btn-tiktok" onclick="loginTikTok()">🔗 Đăng nhập lại TikTok</button>
        <button class="btn btn-ghost" onclick="closeModal()">Để sau</button>
      `);
    } else {
      toast('Lỗi sync: ' + data.error, 'error');
    }
  } else {
    const count = data?.data?.videos?.length || 0;
    if (count === 0) {
      toast('Không tìm thấy video nào trên TikTok (có thể do Sandbox mode)', 'info');
    } else {
      toast(`Đã sync ${count} video từ TikTok!`, 'success');
    }
    loadTikTokStats();
  }
}


async function loadTikTokStats() {
  // Backend now merges videos + slidesets stats
  const data = await api('/api/tiktok/stats');
  if (!data) return;

  // Stats counters - backend already merged both
  document.getElementById('tt-total-videos').textContent = formatNumber(data.videos?.total_videos || 0);
  document.getElementById('tt-total-views').textContent = formatNumber(data.videos?.total_views || 0);
  document.getElementById('tt-total-likes').textContent = formatNumber(data.videos?.total_likes || 0);
  document.getElementById('tt-total-comments').textContent = formatNumber(data.videos?.total_comments || 0);

  // Load both uploaded videos and slidesets (with real stats from DB)
  const [vData, ssData] = await Promise.all([
    api('/api/media/videos?status=uploaded'),
    api('/api/slidesets?status=uploaded')
  ]);

  const uploadedVideos   = vData?.data  || [];
  const uploadedSlidesets = ssData?.data || [];

  // Build rows for uploaded videos
  const videoRows = uploadedVideos.map(v => `<tr>
    <td style="font-weight:600;">
      <span style="font-size:10px;padding:1px 5px;background:rgba(99,102,241,0.15);border-radius:3px;color:#a5b4fc;margin-right:6px;">🎬 Video</span>
      ${v.news_title || 'Video #' + v.id}
    </td>
    <td>👁️ ${formatNumber(v.views)}</td>
    <td>❤️ ${formatNumber(v.likes)}</td>
    <td>💬 ${formatNumber(v.comments)}</td>
    <td>🔄 ${formatNumber(v.shares)}</td>
    <td style="font-size:12px;color:var(--text-muted);">${v.uploaded_at ? timeAgo(v.uploaded_at) : '-'}</td>
  </tr>`);

  // Build rows for uploaded slidesets - show real stats if synced, else show sync hint
  const slidesetRows = uploadedSlidesets.map(s => {
    const hasSynced = s.views > 0 || s.likes > 0;
    const viewsHtml = hasSynced
      ? `👁️ ${formatNumber(s.views)}`
      : `<span style="color:var(--text-muted);font-size:11px;">Chưa sync</span>`;
    return `<tr>
      <td style="font-weight:600;">
        <span style="font-size:10px;padding:1px 5px;background:rgba(0,242,234,0.1);border-radius:3px;color:var(--secondary);margin-right:6px;">🖼️ Slides</span>
        ${s.title || 'Bộ slides #' + s.id}
      </td>
      <td>${viewsHtml}</td>
      <td>❤️ ${hasSynced ? formatNumber(s.likes) : '-'}</td>
      <td>💬 ${hasSynced ? formatNumber(s.comments) : '-'}</td>
      <td>🔄 ${hasSynced ? formatNumber(s.shares) : '-'}</td>
      <td style="font-size:12px;color:var(--text-muted);">${s.uploaded_at ? timeAgo(s.uploaded_at) : '-'}</td>
    </tr>`;
  });

  const allRows = [...videoRows, ...slidesetRows];
  const tbody = document.getElementById('stats-table-body');
  if (tbody) {
    tbody.innerHTML = allRows.length
      ? allRows.join('')
      : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">Chưa có video nào được upload</td></tr>';
  }

  // Show sync hint if there are unsynced slidesets
  const unsynced = uploadedSlidesets.filter(s => !s.views && !s.likes).length;
  const syncHint = document.getElementById('stats-sync-hint');
  if (syncHint) {
    syncHint.style.display = unsynced > 0 ? 'block' : 'none';
    syncHint.textContent = `💡 ${unsynced} bộ slides chưa có thống kê. Nhấn "Sync từ TikTok" để cập nhật.`;
  }
}


// ========== ACCOUNT & SETTINGS ==========
async function checkAuth() {
  const data = await api('/auth/status');
  if (data?.logged_in) {
    document.getElementById('account-name').textContent = data.account.display_name || data.account.username || 'TikTok User';
    document.getElementById('account-status').className = 'account-status';
    document.getElementById('account-status').textContent = 'Online';
    if (data.account.avatar_url) {
      document.getElementById('account-avatar').innerHTML = `<img src="${data.account.avatar_url}" alt="">`;
    }
  } else {
    document.getElementById('account-name').textContent = 'Chưa đăng nhập';
    document.getElementById('account-status').className = 'account-status offline';
    document.getElementById('account-status').textContent = 'Offline';
  }
}

function handleAccountClick() {
  const name = document.getElementById('account-name').textContent;
  const isLoggedIn = document.getElementById('account-status').textContent === 'Online';

  if (isLoggedIn) {
    openModal('👤 Tài khoản TikTok', `
      <div style="text-align:center;padding:8px 0;">
        <div style="font-size:56px;margin-bottom:12px;">${document.getElementById('account-avatar').innerHTML || '👤'}</div>
        <h3 style="font-size:18px;margin-bottom:4px;">${name}</h3>
        <span style="font-size:13px;color:var(--secondary);">● Đang kết nối</span>
      </div>
      <div style="margin-top:20px;padding:12px;background:rgba(255,255,255,0.04);border-radius:8px;font-size:13px;color:var(--text-muted);">
        <p style="margin:0;">💡 Nếu gặp lỗi <strong>"thiếu quyền"</strong> khi sync thống kê, hãy đăng xuất và đăng nhập lại để cấp thêm quyền <code>video.list</code>.</p>
      </div>
    `, `
      <button class="btn btn-ghost" onclick="logoutTikTok()" style="color:#ff4d4d;">🚪 Đăng xuất</button>
      <button class="btn btn-tiktok" onclick="closeModal();loginTikTok()">🔗 Đăng nhập lại</button>
      <button class="btn btn-secondary" onclick="closeModal()">Đóng</button>
    `);
  } else {
    navigateTo('settings');
  }
}

async function logoutTikTok() {
  closeModal();
  const data = await api('/auth/logout', { method: 'POST' });
  if (data?.success) {
    toast('Đã đăng xuất TikTok', 'info');
    document.getElementById('account-name').textContent = 'Chưa đăng nhập';
    document.getElementById('account-status').className = 'account-status offline';
    document.getElementById('account-status').textContent = 'Offline';
    document.getElementById('account-avatar').innerHTML = '👤';
  }
}

function loginTikTok() {
  window.location.href = '/auth/tiktok';
}


async function loadSettings() {
  const data = await api('/api/settings');
  if (!data) return;
  if (data.slides_per_video) document.getElementById('set-slides').value = data.slides_per_video;
  if (data.slide_duration) document.getElementById('set-duration').value = data.slide_duration;
  if (data.watermark_text) document.getElementById('set-watermark').value = data.watermark_text;
}

async function saveSettings() {
  const settings = {
    slides_per_video: document.getElementById('set-slides').value,
    slide_duration: document.getElementById('set-duration').value,
    watermark_text: document.getElementById('set-watermark').value
  };
  await api('/api/settings', { method: 'POST', body: JSON.stringify(settings) });
  toast('Đã lưu cài đặt!', 'success');
}

// ========== SLIDESETS ==========
let slidesetFilter_val = 'all';

async function loadSlidesets() {
  const status = slidesetFilter_val === 'all' ? '' : slidesetFilter_val;
  const data = await api(`/api/slidesets?status=${status}`);
  if (!data) return;

  const el = document.getElementById('slidesets-list');
  if (data.data?.length) {
    el.innerHTML = data.data.map(s => {
      const newsItems = s.items?.filter(i => i.slide_type === 'news') || [];
      const hasVideo = s.status === 'video_ready' || s.status === 'uploaded';
      return `
      <div class="card" style="margin-bottom:16px;">
        <div class="card-body" style="padding:16px;">
          <div style="display:flex;gap:16px;align-items:flex-start;">
            <div style="flex:1;">
              <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;">
                ${statusBadge(s.status)}
                <span style="font-size:12px;color:var(--text-muted);">${timeAgo(s.created_at)}</span>
                <span style="font-size:12px;color:var(--text-muted);">📅 ${s.date_label || ''}</span>
                ${s.video_duration ? `<span style="font-size:12px;color:var(--secondary);">🎬 ${Math.round(s.video_duration)}s</span>` : ''}
              </div>
              <h4 style="font-size:16px;font-weight:700;margin-bottom:8px;">${s.title || 'Bộ slides #' + s.id}</h4>
              <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">
                ${newsItems.map((n, i) => `<div style="margin-bottom:4px;">📰 ${i + 1}. ${n.news_title || 'Tin #' + n.news_id}</div>`).join('')}
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-sm btn-secondary" onclick="previewSlideset(${s.id})">👁️ Xem</button>
                ${s.status === 'ready' ? `<button class="btn btn-sm btn-primary" onclick="createSlidesetVideo(${s.id})">🎬 Tạo Video</button>` : ''}
                ${['video_ready', 'error'].includes(s.status) ? `<button class="btn btn-sm btn-tiktok" onclick="uploadSlideset(${s.id})">⬆️ Upload TikTok</button>` : ''}
                ${hasVideo ? `<button class="btn btn-sm btn-secondary" onclick="previewSlidesetVideo(${s.id})">▶️ Xem Video</button>` : ''}
                <button class="btn btn-sm btn-danger" onclick="deleteSlideset(${s.id})">🗑️ Xóa</button>
              </div>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0;">
              ${(s.items || []).slice(0, 3).map(item =>
                item.image_path ? `<img src="/temp/slidesets/${item.image_path.split(/[/\\\\]/).pop()}" style="width:80px;height:100px;object-fit:cover;border-radius:8px;border:1px solid rgba(255,255,255,0.1);" onerror="this.style.display='none'">` : ''
              ).join('')}
              ${s.slide_count > 3 ? `<div style="width:80px;height:100px;background:var(--bg-surface);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--text-muted);border:1px solid rgba(255,255,255,0.1);">+${s.slide_count - 3}</div>` : ''}
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
  } else {
    el.innerHTML = '<div class="empty-state"><div class="icon">🖼️</div><h4>Không có bộ slides</h4></div>';
  }
}

function filterSlidesets(status, el) {
  slidesetFilter_val = status;
  document.querySelectorAll('#page-slidesets .tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  loadSlidesets();
}

async function openCreateSlideset() {
  const data = await api('/api/news?limit=50&status=');
  if (!data?.data?.length) {
    toast('Chưa có tin tức. Hãy lấy tin từ VnExpress trước!', 'error');
    return;
  }

  const today = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  openModal('🖼️ Tạo bộ Slides Ảnh TikTok', `
    <div style="margin-bottom:16px;">
      <div class="form-group" style="margin-bottom:16px;">
        <label class="form-label">📅 Ngày hiển thị trên slide mở đầu</label>
        <input type="text" class="form-input" id="slideset-date" value="${today}" placeholder="DD/MM/YYYY">
      </div>
      <div class="form-group" style="margin-bottom:16px;">
        <label class="form-label">🕒 Buổi phát sóng</label>
        <select class="form-input" id="slideset-time">
          <option value="sáng">Sáng</option>
          <option value="trưa">Trưa</option>
          <option value="tối">Tối</option>
        </select>
      </div>
      <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
        <label class="form-label" style="margin:0;">📰 Chọn 5 tin tức (bấm để chọn/bỏ chọn)</label>
        <span id="slideset-count" style="font-size:13px;color:var(--text-muted);">Đã chọn: 0/5</span>
      </div>
      <div id="slideset-news-list" style="max-height:400px;overflow-y:auto;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:8px;">
        ${data.data.map(n => `
          <div class="slideset-news-item" data-id="${n.id}" onclick="toggleSlidesetNews(this)"
               style="display:flex;gap:12px;padding:10px;border-radius:10px;cursor:pointer;margin-bottom:4px;border:2px solid transparent;transition:all 0.2s;">
            <img src="${n.image_url || ''}" style="width:70px;height:50px;object-fit:cover;border-radius:8px;flex-shrink:0;" onerror="this.style.background='var(--bg-surface)'">
            <div style="flex:1;min-width:0;">
              <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${n.title}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                <span>${n.category || ''}</span> · <span>${timeAgo(n.created_at)}</span>
              </div>
            </div>
            <div class="check-icon" style="flex-shrink:0;width:28px;height:28px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:14px;transition:all 0.2s;"></div>
          </div>
        `).join('')}
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-top:8px;">💡 Bộ slides gồm: 1 slide mở đầu + tin tức + 1 slide kêu gọi</p>
    </div>
  `, `
    <button class="btn btn-primary" id="btn-create-slideset" onclick="createSlideset()">🎨 Tạo bộ slides (0 tin)</button>
    <button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
  `);
}

function toggleSlidesetNews(el) {
  const isSelected = el.classList.toggle('selected');
  const checkIcon = el.querySelector('.check-icon');
  if (isSelected) {
    el.style.borderColor = 'var(--primary)';
    el.style.background = 'rgba(255,0,80,0.08)';
    checkIcon.textContent = '✓';
    checkIcon.style.background = 'var(--primary)';
    checkIcon.style.borderColor = 'var(--primary)';
    checkIcon.style.color = '#fff';
  } else {
    el.style.borderColor = 'transparent';
    el.style.background = 'transparent';
    checkIcon.textContent = '';
    checkIcon.style.background = 'transparent';
    checkIcon.style.borderColor = 'rgba(255,255,255,0.2)';
  }

  const selected = document.querySelectorAll('.slideset-news-item.selected');
  document.getElementById('slideset-count').textContent = `Đã chọn: ${selected.length}/5`;
  document.getElementById('btn-create-slideset').textContent = `🎨 Tạo bộ slides (${selected.length} tin)`;
}

async function createSlideset() {
  const selected = document.querySelectorAll('.slideset-news-item.selected');
  if (selected.length === 0) { toast('Chọn ít nhất 1 tin tức!', 'error'); return; }
  if (selected.length > 10) { toast('Tối đa 10 tin tức!', 'error'); return; }

  const newsIds = Array.from(selected).map(el => Number(el.dataset.id));
  const dateLabel = document.getElementById('slideset-date')?.value || '';
  const timeLabel = document.getElementById('slideset-time')?.value || 'sáng';

  closeModal();
  toast(`Đang tạo bộ ${newsIds.length + 2} slides...`, 'info');

  const data = await api('/api/slidesets/create', {
    method: 'POST',
    body: JSON.stringify({ newsIds, dateLabel, timeLabel })
  });

  if (data?.success) {
    toast(`Đã tạo bộ slides thành công! (${data.slides?.length || 0} slides)`, 'success');
    previewSlideset(data.slideset_id);
    loadSlidesets();
  } else {
    toast('Lỗi tạo slides: ' + (data?.error || 'Unknown'), 'error');
  }
}

async function previewSlideset(id) {
  const data = await api(`/api/slidesets/${id}`);
  if (!data) return;

  // Get current slide_duration from settings
  const settings = await api('/api/settings');
  const currentDuration = settings?.slide_duration || '4';

  const hasVideo = (data.video_path || data.drive_url) && (data.status === 'video_ready' || data.status === 'uploaded');

  openModal(`🖼️ Preview: ${data.title || 'Bộ slides #' + id}`, `
    <div style="text-align:center;margin-bottom:16px;">
      ${statusBadge(data.status)}
      <span style="margin-left:8px;font-size:13px;color:var(--text-muted);">📅 ${data.date_label || ''} · ${data.slide_count} slides</span>
      ${data.video_duration ? `<span style="margin-left:8px;font-size:13px;color:var(--secondary);">🎬 Video: ${Math.round(data.video_duration)}s</span>` : ''}
    </div>
    <div class="slides-preview" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:12px;">
      ${(data.items || []).map(item => `
        <div style="flex-shrink:0;text-align:center;">
          <img src="${item.image_url}" style="width:180px;height:225px;object-fit:cover;border-radius:12px;border:2px solid rgba(255,255,255,0.1);" onerror="this.style.background='var(--bg-surface)'">
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${item.slide_type === 'intro' ? '📌 Mở đầu' : item.slide_type === 'cta' ? '❤️ CTA' : '📰 Tin ' + (item.slide_index - 1)}</div>
        </div>
      `).join('')}
    </div>
    ${['ready', 'video_ready', 'uploaded', 'error'].includes(data.status) ? `
    <div style="margin-top:16px;padding:16px;background:var(--bg-surface);border-radius:12px;border:1px solid rgba(255,255,255,0.08);">
      <h4 style="font-size:14px;margin-bottom:12px;color:var(--text-primary);">🎬 Cấu hình Video</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">🕒 Buổi phát sóng</label>
          <select class="form-input" id="slideset-time-label">
            <option value="sáng" ${data.title && data.title.toLowerCase().includes('sáng') ? 'selected' : ''}>Sáng</option>
            <option value="trưa" ${data.title && data.title.toLowerCase().includes('trưa') ? 'selected' : ''}>Trưa</option>
            <option value="tối" ${data.title && data.title.toLowerCase().includes('tối') ? 'selected' : ''}>Tối</option>
          </select>
          <p style="font-size:11px;color:var(--text-muted);margin-top:2px;">Sửa buổi mở đầu</p>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">⏱️ Slide Intro/CTA</label>
          <input type="number" class="form-input" id="slideset-intro-duration" value="3" min="2" max="8" step="1">
          <p style="font-size:11px;color:var(--text-muted);margin-top:2px;">Slide mở đầu + gọi</p>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">⏱️ Slide Tin tức</label>
          <input type="number" class="form-input" id="slideset-video-duration" value="${currentDuration}" min="3" max="15" step="1">
          <p style="font-size:11px;color:var(--text-muted);margin-top:2px;">Mỗi slide (giây)</p>
        </div>
      </div>
      <div style="margin-top:10px;padding:8px 12px;background:rgba(0,242,234,0.08);border-radius:8px;font-size:13px;color:var(--secondary);" id="slideset-total-estimate">
        📐 Ước tính: 2×3s (intro/cta) + ${(data.slide_count - 2)}×${currentDuration}s (tin) = ${2*3 + (data.slide_count - 2) * Number(currentDuration)}s tổng
      </div>

      <!-- TTS Section -->
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06);">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <h4 style="font-size:14px;color:var(--text-primary);margin:0;">🔊 Giọng đọc (Text-to-Speech)</h4>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;">
            <input type="checkbox" id="slideset-tts-enable" style="width:18px;height:18px;accent-color:var(--primary);cursor:pointer;">
            <span style="color:var(--text-secondary);">Bật giọng đọc</span>
          </label>
        </div>
        <div id="tts-options" style="display:none;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px;">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">🎙️ Giọng đọc</label>
              <select class="form-input" id="slideset-tts-voice">
                <option value="female">👩 Hoài My (Nữ)</option>
                <option value="male">👨 Nam Minh (Nam)</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">⚡ Tốc độ đọc</label>
              <select class="form-input" id="slideset-tts-rate">
                <option value="-20%">Rất chậm</option>
                <option value="-10%">Chậm</option>
                <option value="+0%" selected>Bình thường</option>
                <option value="+10%">Nhanh</option>
                <option value="+20%">Rất nhanh</option>
              </select>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn btn-sm btn-secondary" onclick="previewTTS(${id})" id="btn-tts-preview">🔊 Nghe thử</button>
            <span id="tts-preview-status" style="font-size:12px;color:var(--text-muted);"></span>
            <audio id="tts-preview-audio" style="display:none;"></audio>
          </div>
          <p style="font-size:11px;color:var(--text-muted);margin-top:8px;">💡 Khi bật TTS, thời gian slide sẽ tự điều chỉnh theo độ dài giọng đọc (tối thiểu = giá trị trên)</p>
        </div>
      </div>
    </div>
    ` : ''}
    ${hasVideo ? `
    <div style="margin-top:16px;text-align:center;">
      ${data.drive_url
        ? `<div style="padding:24px;background:var(--bg-surface);border-radius:12px;border:1px dashed rgba(255,255,255,0.2);">
             <div style="font-size:32px;margin-bottom:8px;">☁️</div>
             <div style="margin-bottom:12px;color:var(--text-secondary);">Video đã được chuyển lên Google Drive để nhẹ máy.</div>
             <a href="${data.drive_url}" target="_blank" class="btn btn-secondary" style="color:var(--secondary);border-color:var(--secondary);">▶️ Mở xem trên Drive</a>
           </div>`
        : `<video src="/temp/videos/${data.video_path.split(/[/\\\\]/).pop()}" controls style="max-width:100%;max-height:400px;border-radius:12px;"></video>`
      }
    </div>
    ` : ''}
  `, `
    ${data.status === 'ready' ? `<button class="btn btn-primary" onclick="createSlidesetVideoFromPreview(${id})">🎬 Tạo Video</button>` : ''}
    ${['video_ready', 'error'].includes(data.status) ? `<button class="btn btn-tiktok" onclick="uploadSlideset(${id})">⬆️ Upload lên TikTok</button>` : ''}
    ${hasVideo ? `<button class="btn btn-secondary" onclick="createSlidesetVideoFromPreview(${id})">🔄 Tạo lại Video</button>` : ''}
    <button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
  `);

  // TTS toggle
  const ttsCheckbox = document.getElementById('slideset-tts-enable');
  const ttsOptions = document.getElementById('tts-options');
  if (ttsCheckbox) {
    ttsCheckbox.addEventListener('change', () => {
      ttsOptions.style.display = ttsCheckbox.checked ? 'block' : 'none';
    });
  }

  // Update total duration estimate when user changes inputs
  const newsCount = (data.items || []).filter(i => i.slide_type === 'news').length;
  const introCtaCount = (data.items || []).length - newsCount;
  const durationInput = document.getElementById('slideset-video-duration');
  const introInput = document.getElementById('slideset-intro-duration');
  const estimateEl = document.getElementById('slideset-total-estimate');

  function updateEstimate() {
    if (!durationInput || !introInput || !estimateEl) return;
    const nd = Number(durationInput.value) || 4;
    const id = Number(introInput.value) || 3;
    const total = introCtaCount * id + newsCount * nd;
    const ttsNote = ttsCheckbox?.checked ? ' (sẽ tự tăng nếu giọng đọc dài hơn)' : '';
    estimateEl.innerHTML = `📐 Ước tính: ${introCtaCount}×${id}s (intro/cta) + ${newsCount}×${nd}s (tin) = <strong>${total}s</strong> tổng${ttsNote}`;
  }

  if (durationInput) durationInput.addEventListener('input', updateEstimate);
  if (introInput) introInput.addEventListener('input', updateEstimate);
  if (ttsCheckbox) ttsCheckbox.addEventListener('change', updateEstimate);
}

async function previewTTS(slidesetId) {
  const voice = document.getElementById('slideset-tts-voice')?.value || 'female';
  const rate = document.getElementById('slideset-tts-rate')?.value || '+0%';
  const statusEl = document.getElementById('tts-preview-status');
  const audioEl = document.getElementById('tts-preview-audio');
  const btnEl = document.getElementById('btn-tts-preview');

  if (btnEl) btnEl.disabled = true;
  if (statusEl) statusEl.textContent = '⏳ Đang tạo giọng đọc...';

  const data = await api('/api/tts/preview', {
    method: 'POST',
    body: JSON.stringify({
      text: 'Tin tức nổi bật hôm nay. Cùng điểm qua những sự kiện đáng chú ý nhất trong ngày!',
      voice,
      rate
    })
  });

  if (btnEl) btnEl.disabled = false;

  if (data?.success) {
    if (statusEl) statusEl.textContent = `✅ ${data.duration?.toFixed(1)}s`;
    if (audioEl) {
      audioEl.src = data.audio_url;
      audioEl.style.display = 'inline';
      audioEl.play();
    }
  } else {
    if (statusEl) statusEl.textContent = '❌ Lỗi: ' + (data?.error || 'Unknown');
  }
}

async function createSlidesetVideoFromPreview(id) {
  const durationInput = document.getElementById('slideset-video-duration');
  const introInput = document.getElementById('slideset-intro-duration');
  const ttsCheckbox = document.getElementById('slideset-tts-enable');
  const ttsVoice = document.getElementById('slideset-tts-voice');
  const ttsRate = document.getElementById('slideset-tts-rate');
  const timeLabelInput = document.getElementById('slideset-time-label');

  const duration = durationInput ? Number(durationInput.value) : 4;
  const introDuration = introInput ? Number(introInput.value) : 3;
  const enableTTS = ttsCheckbox?.checked || false;
  const voice = ttsVoice?.value || 'female';
  const rate = ttsRate?.value || '+0%';
  const timeLabel = timeLabelInput?.value || null;

  await createSlidesetVideo(id, duration, introDuration, { enableTTS, voice, rate, timeLabel });
}

async function createSlidesetVideo(id, slideDuration = null, introDuration = 3, ttsOptions = {}) {
  if (!slideDuration) {
    // Ask for duration via quick modal
    const settings = await api('/api/settings');
    const defaultDur = settings?.slide_duration || '4';
    slideDuration = prompt(`Thời gian mỗi slide tin tức (giây):`, defaultDur);
    if (!slideDuration) return;
    slideDuration = Number(slideDuration);
  }
  if (slideDuration < 2) slideDuration = 2;
  if (slideDuration > 15) slideDuration = 15;
  if (introDuration < 2) introDuration = 2;

  const ttsLabel = ttsOptions.enableTTS ? ' + TTS 🔊' : '';
  toast(`Đang tạo video${ttsLabel} (tin: ${slideDuration}s, intro/cta: ${introDuration}s)...`, 'info');
  closeModal();

  const body = {
    slide_duration: slideDuration,
    intro_duration: introDuration
  };
  if (ttsOptions.timeLabel) {
    body.timeLabel = ttsOptions.timeLabel;
  }
  if (ttsOptions.enableTTS) {
    body.enable_tts = true;
    body.tts_voice = ttsOptions.voice || 'female';
    body.tts_rate = ttsOptions.rate || '+0%';
  }

  const data = await api(`/api/slidesets/${id}/create-video`, {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (data?.success) {
    const ttsInfo = data.has_tts ? ' 🔊 có giọng đọc' : '';
    toast(`Video đã tạo thành công! (${Math.round(data.duration || 0)}s${ttsInfo})`, 'success');
    // Show video preview
    openModal('🎬 Video đã tạo', `
      <div style="text-align:center;">
        <video src="${data.video_path}" controls autoplay style="max-width:100%;max-height:500px;border-radius:12px;"></video>
        <p style="margin-top:12px;color:var(--text-muted);">Thời lượng: ${Math.round(data.duration || 0)}s · ${data.slide_duration}s/slide${ttsInfo}</p>
      </div>
    `, `
      <button class="btn btn-tiktok" onclick="uploadSlideset(${id})">⬆️ Upload TikTok</button>
      <button class="btn btn-secondary" onclick="previewSlideset(${id})">🔄 Tạo lại</button>
      <button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
    `);
    loadSlidesets();
  } else {
    toast('Lỗi tạo video: ' + (data?.error || 'Unknown'), 'error');
    loadSlidesets();
  }
}

async function previewSlidesetVideo(id) {
  const data = await api(`/api/slidesets/${id}`);
  if (!data || !data.video_path) {
    toast('Chưa có video cho bộ slides này', 'error');
    return;
  }
  openModal('▶️ Video: ' + (data.title || 'Slideset #' + id), `
    <div style="text-align:center;">
      <video src="/temp/videos/${data.video_path.split(/[/\\\\]/).pop()}" controls autoplay style="max-width:100%;max-height:500px;border-radius:12px;"></video>
      <p style="margin-top:12px;color:var(--text-muted);">Thời lượng: ${Math.round(data.video_duration || 0)}s · ${data.slide_count} slides</p>
    </div>
  `, `
    ${['video_ready', 'error'].includes(data.status) ? `<button class="btn btn-tiktok" onclick="uploadSlideset(${id})">⬆️ Upload TikTok</button>` : ''}
    <button class="btn btn-secondary" onclick="previewSlideset(${id})">🔄 Tạo lại Video</button>
    <button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
  `);
}

async function uploadSlideset(id) {
  toast('Đang upload bộ slides lên TikTok...', 'info');
  closeModal();
  const data = await api(`/api/slidesets/${id}/upload`, { method: 'POST' });
  if (data?.success) {
    toast('Upload slides thành công!', 'success');
    loadSlidesets();
  } else {
    toast('Lỗi upload: ' + (data?.error || 'Unknown'), 'error');
    loadSlidesets();
  }
}

async function deleteSlideset(id) {
  if (!confirm('Xóa bộ slides này?')) return;
  await api(`/api/slidesets/${id}`, { method: 'DELETE' });
  toast('Đã xóa', 'success');
  loadSlidesets();
}

// ========== MODAL ==========
function openModal(title, bodyHtml, footerHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML = footerHtml || '';
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('modal-overlay').classList.remove('active');
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadDashboard();
  checkYouTubeAuth(); // quietly update YT badge

  // Check URL params
  const params = new URLSearchParams(window.location.search);
  if (params.get('success')) toast('Đăng nhập TikTok thành công!', 'success');
  if (params.get('error')) toast('Lỗi: ' + params.get('error'), 'error');
  if (params.get('yt_success')) { toast('Đăng nhập YouTube thành công!', 'success'); navigateTo('youtube'); }
  if (params.get('yt_error')) toast('Lỗi YouTube: ' + params.get('yt_error'), 'error');
  if (params.has('success') || params.has('error') || params.has('yt_success') || params.has('yt_error')) {
    window.history.replaceState({}, '', '/');
  }
});

// Keyboard shortcut
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// ========== YOUTUBE ==========
let _ytLoggedIn = false;
let _ytReadyData = { videos: [], slidesets: [] };
let _ytActiveTab = 'videos';

async function checkYouTubeAuth() {
  const data = await api('/auth/youtube/status');
  _ytLoggedIn = data?.logged_in || false;
  const badge = document.getElementById('nav-yt-badge');
  if (badge) badge.style.display = _ytLoggedIn ? 'inline-flex' : 'none';
  return data;
}

async function loadYouTubePage() {
  // Load settings
  const settings = await api('/api/settings');
  const redirectUri = window.location.origin + '/auth/youtube/callback';
  const uriEl = document.getElementById('yt-redirect-uri');
  const setupEl = document.getElementById('yt-setup-uri');
  if (uriEl) uriEl.value = redirectUri;
  if (setupEl) setupEl.textContent = redirectUri;
  if (settings) {
    const tagsEl = document.getElementById('yt-set-tags');
    if (tagsEl && settings.yt_auto_tags) tagsEl.value = settings.yt_auto_tags;
  }

  // Check auth
  const authData = await checkYouTubeAuth();
  _renderYTAccountCard(authData);

  if (_ytLoggedIn) {
    // Load channel stats
    _loadYTChannelStats();
  }

  // Load ready content queue
  await _loadYTReadyQueue();
}

function _renderYTAccountCard(authData) {
  const infoEl = document.getElementById('yt-account-info');
  const loginBtn = document.getElementById('btn-yt-login');
  const logoutBtn = document.getElementById('btn-yt-logout');
  if (!infoEl) return;

  if (authData?.logged_in && authData.account) {
    const acc = authData.account;
    infoEl.innerHTML = `
      <div style="display:flex;gap:16px;align-items:center;padding:8px 0">
        <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#ff0000,#cc0000);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">
          ${acc.avatar_url ? `<img src="${acc.avatar_url}" style="width:56px;height:56px;border-radius:50%;object-fit:cover">` : '📺'}
        </div>
        <div style="flex:1">
          <div style="font-size:16px;font-weight:700;margin-bottom:2px">${acc.display_name || acc.email}</div>
          <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">${acc.email || ''}</div>
          <div style="display:flex;gap:8px;align-items:center">
            <span style="font-size:12px;padding:2px 8px;background:rgba(255,0,0,0.15);border-radius:20px;color:#ff6666">📺 ${acc.channel_title || 'YouTube Channel'}</span>
            <span style="font-size:12px;color:var(--success)">● Đang kết nối</span>
          </div>
        </div>
      </div>`;
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
  } else {
    infoEl.innerHTML = `
      <div class="empty-state" style="padding:20px">
        <div class="icon">📺</div>
        <h4>Chưa kết nối YouTube</h4>
        <p>Nhấn "Đăng nhập Google" để kết nối kênh YouTube của bạn</p>
      </div>`;
    if (loginBtn) loginBtn.style.display = 'inline-flex';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }
}

async function _loadYTChannelStats() {
  const statsEl = document.getElementById('yt-channel-stats');
  if (!statsEl) return;
  try {
    const ch = await api('/api/youtube/channel');
    if (!ch || ch.error) return;
    statsEl.style.display = 'block';
    document.getElementById('yt-stat-videos').textContent = formatNumber(ch.video_count || 0);
    document.getElementById('yt-stat-views').textContent = formatNumber(ch.view_count || 0);
    document.getElementById('yt-stat-subs').textContent = formatNumber(ch.subscriber_count || 0);
  } catch (e) { /* silent */ }
}

async function _loadYTReadyQueue() {
  const data = await api('/api/youtube/ready');
  if (!data) return;
  _ytReadyData = data;
  _renderYTTab(_ytActiveTab);
}

function switchYTTab(tab, el) {
  _ytActiveTab = tab;
  document.querySelectorAll('#page-youtube .tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('.yt-tab-panel').forEach(p => p.style.display = 'none');
  const panel = document.getElementById(`yt-tab-${tab}`);
  if (panel) panel.style.display = 'block';
  _renderYTTab(tab);
}

function _renderYTTab(tab) {
  if (tab === 'videos') _renderYTVideos();
  else if (tab === 'slidesets') _renderYTSlidesets();
  else if (tab === 'uploaded') _renderYTUploaded();
}

function _renderYTVideos() {
  const el = document.getElementById('yt-videos-list');
  if (!el) return;
  const videos = (_ytReadyData.videos || []).filter(v => v.file_path && !v.youtube_video_id);
  if (!videos.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">🎬</div><h4>Không có video sẵn sàng</h4><p>Tạo video từ tin tức trước</p></div>';
    return;
  }
  el.innerHTML = `<table class="data-table"><thead><tr>
    <th></th><th>Tiêu đề</th><th>Danh mục</th><th>Trạng thái</th><th>Thời gian</th><th>Hành động</th>
  </tr></thead><tbody>${videos.map(v => `<tr>
    <td><img src="${v.image_url || ''}" style="width:60px;height:40px;object-fit:cover;border-radius:6px" onerror="this.style.display='none'"></td>
    <td style="font-weight:600;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.news_title || 'Video #' + v.id}</td>
    <td><span style="font-size:12px">${v.category || '-'}</span></td>
    <td>${statusBadge(v.status)}</td>
    <td style="font-size:12px;color:var(--text-muted)">${timeAgo(v.created_at)}</td>
    <td>
      <button class="btn btn-sm" style="background:linear-gradient(135deg,#ff0000,#cc0000);color:#fff" onclick="uploadVideoToYouTube(${v.id})">
        📺 Upload YT
      </button>
    </td>
  </tr>`).join('')}</tbody></table>`;
}

function _renderYTSlidesets() {
  const el = document.getElementById('yt-slidesets-list');
  if (!el) return;
  const sets = (_ytReadyData.slidesets || []).filter(s => s.video_path && !s.youtube_video_id);
  if (!sets.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">🖼️</div><h4>Không có slideset có video</h4><p>Tạo video từ slideset trước</p></div>';
    return;
  }
  el.innerHTML = `<table class="data-table"><thead><tr>
    <th>Tiêu đề</th><th>Slides</th><th>Thời lượng</th><th>Trạng thái</th><th>Hành động</th>
  </tr></thead><tbody>${sets.map(s => `<tr>
    <td style="font-weight:600">${s.title || 'Slides #' + s.id}</td>
    <td style="font-size:12px">${s.slide_count || '-'} slides</td>
    <td style="font-size:12px;color:var(--secondary)">${s.video_duration ? Math.round(s.video_duration) + 's' : '-'}</td>
    <td>${statusBadge(s.status)}</td>
    <td>
      <button class="btn btn-sm" style="background:linear-gradient(135deg,#ff0000,#cc0000);color:#fff" onclick="uploadSlidesetToYouTube(${s.id})">
        📺 Upload YT
      </button>
    </td>
  </tr>`).join('')}</tbody></table>`;
}

function _renderYTUploaded() {
  const el = document.getElementById('yt-uploaded-list');
  if (!el) return;
  const uploaded = [
    ...(_ytReadyData.videos || []).filter(v => v.youtube_video_id).map(v => ({ ...v, _type: 'video', _label: v.news_title || 'Video #' + v.id })),
    ...(_ytReadyData.slidesets || []).filter(s => s.youtube_video_id).map(s => ({ ...s, _type: 'slideset', _label: s.title || 'Slides #' + s.id }))
  ];
  if (!uploaded.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">✅</div><h4>Chưa có video nào được upload lên YouTube</h4></div>';
    return;
  }
  el.innerHTML = `<table class="data-table"><thead><tr>
    <th>Tiêu đề</th><th>Loại</th><th>YouTube ID</th><th>Thời gian</th><th>Xem</th>
  </tr></thead><tbody>${uploaded.map(item => `<tr>
    <td style="font-weight:600">${item._label}</td>
    <td><span style="font-size:11px;padding:2px 6px;background:rgba(255,0,0,0.1);border-radius:4px;color:#ff6666">${item._type === 'video' ? '🎬 Video' : '🖼️ Slideset'}</span></td>
    <td style="font-size:12px;font-family:monospace">
      <a href="${item.youtube_url}" target="_blank" style="color:#ff4444">${item.youtube_video_id}</a>
    </td>
    <td style="font-size:12px;color:var(--text-muted)">${timeAgo(item.created_at)}</td>
    <td><a href="${item.youtube_url}" target="_blank" class="btn btn-sm btn-secondary">▶️ Xem</a></td>
  </tr>`).join('')}</tbody></table>`;
}

async function uploadVideoToYouTube(videoId) {
  if (!_ytLoggedIn) {
    toast('Cần đăng nhập YouTube trước!', 'error');
    return;
  }
  const privacy = document.getElementById('yt-privacy')?.value || 'private';
  const settings = await api('/api/settings');
  const tags = settings?.yt_auto_tags ? settings.yt_auto_tags.split(',').map(t => t.trim()) : ['tin tức', 'vnexpress'];

  toast('Đang upload video lên YouTube... (có thể mất vài phút)', 'info');
  const data = await api(`/api/youtube/upload/video/${videoId}`, {
    method: 'POST',
    body: JSON.stringify({ privacyStatus: privacy, tags })
  });

  if (data?.success) {
    toast('✅ Upload YouTube thành công!', 'success');
    openModal('📺 Upload YouTube thành công!', `
      <div style="text-align:center;padding:16px 0">
        <div style="font-size:56px;margin-bottom:16px">🎉</div>
        <h3 style="margin-bottom:12px">Video đã được upload lên YouTube!</h3>
        <div style="margin-bottom:16px">
          <a href="${data.youtube_url}" target="_blank"
             style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:linear-gradient(135deg,#ff0000,#cc0000);color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
            ▶️ Xem trên YouTube
          </a>
        </div>
        <div style="font-size:13px;color:var(--text-muted)">Video ID: <code>${data.video_id}</code></div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Chế độ: ${privacy}</div>
      </div>
    `, `<button class="btn btn-ghost" onclick="closeModal();_loadYTReadyQueue()">Đóng</button>`);
  } else {
    toast('Lỗi upload YouTube: ' + (data?.error || 'Unknown'), 'error');
  }
}

async function uploadSlidesetToYouTube(setId) {
  if (!_ytLoggedIn) {
    toast('Cần đăng nhập YouTube trước!', 'error');
    return;
  }
  const privacy = document.getElementById('yt-privacy')?.value || 'private';
  const settings = await api('/api/settings');
  const tags = settings?.yt_auto_tags ? settings.yt_auto_tags.split(',').map(t => t.trim()) : ['tin tức', 'vnexpress'];

  toast('Đang upload slideset lên YouTube... (có thể mất vài phút)', 'info');
  const data = await api(`/api/youtube/upload/slideset/${setId}`, {
    method: 'POST',
    body: JSON.stringify({ privacyStatus: privacy, tags })
  });

  if (data?.success) {
    toast('✅ Upload YouTube thành công!', 'success');
    openModal('📺 Upload YouTube thành công!', `
      <div style="text-align:center;padding:16px 0">
        <div style="font-size:56px;margin-bottom:16px">🎉</div>
        <h3 style="margin-bottom:12px">Slideset đã được upload lên YouTube!</h3>
        <div style="margin-bottom:16px">
          <a href="${data.youtube_url}" target="_blank"
             style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:linear-gradient(135deg,#ff0000,#cc0000);color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
            ▶️ Xem trên YouTube
          </a>
        </div>
        <div style="font-size:13px;color:var(--text-muted)">Video ID: <code>${data.video_id}</code></div>
      </div>
    `, `<button class="btn btn-ghost" onclick="closeModal();_loadYTReadyQueue()">Đóng</button>`);
  } else {
    toast('Lỗi upload YouTube: ' + (data?.error || 'Unknown'), 'error');
  }
}

function loginYouTube() {
  window.location.href = '/auth/youtube';
}

async function logoutYouTube() {
  const data = await api('/auth/youtube/logout', { method: 'POST' });
  if (data?.success) {
    _ytLoggedIn = false;
    toast('Đã đăng xuất YouTube', 'info');
    const badge = document.getElementById('nav-yt-badge');
    if (badge) badge.style.display = 'none';
    document.getElementById('yt-channel-stats').style.display = 'none';
    _renderYTAccountCard({ logged_in: false });
    _ytReadyData = { videos: [], slidesets: [] };
    _renderYTTab(_ytActiveTab);
  }
}

async function saveYouTubeSettings() {
  const clientId = document.getElementById('yt-set-client-id')?.value?.trim();
  const clientSecret = document.getElementById('yt-set-client-secret')?.value?.trim();
  const tags = document.getElementById('yt-set-tags')?.value?.trim();

  const settings = {};
  if (tags) settings.yt_auto_tags = tags;
  if (Object.keys(settings).length) {
    await api('/api/settings', { method: 'POST', body: JSON.stringify(settings) });
  }

  if (clientId || clientSecret) {
    toast('⚠️ Client ID/Secret phải cập nhật trong file .env và khởi động lại server!', 'info');
    openModal('📋 Cập nhật .env', `
      <div style="font-size:14px;line-height:1.8">
        <p>Mở file <code>.env</code> trong thư mục dự án và cập nhật:</p>
        <div style="background:var(--bg-surface);padding:16px;border-radius:8px;font-family:monospace;font-size:13px;margin:12px 0">
          YOUTUBE_CLIENT_ID=${clientId || 'your_client_id'}<br>
          YOUTUBE_CLIENT_SECRET=${clientSecret || 'your_client_secret'}<br>
          YOUTUBE_REDIRECT_URI=${window.location.origin}/auth/youtube/callback
        </div>
        <p style="color:var(--text-muted)">Sau khi lưu .env, khởi động lại server bằng lệnh: <code>npm run dev</code></p>
      </div>
    `, `<button class="btn btn-ghost" onclick="closeModal()">Đóng</button>`);
  } else {
    toast('Đã lưu cài đặt YouTube!', 'success');
  }
}

// ================== GOOGLE DRIVE ==================

async function loadDrivePage() {
  const data = await api('/api/youtube/ready');
  if (!data) return;

  const el = document.getElementById('drive-media-list');
  
  const videoRows = (data.videos || []).map(v => `
    <tr>
      <td><img src="${v.image_url || ''}" style="width:60px;height:40px;object-fit:cover;border-radius:6px;" onerror="this.style.display='none'"></td>
      <td style="font-weight:600;">${v.news_title || 'Video #' + v.id}</td>
      <td><span style="font-size:11px;padding:2px 6px;background:rgba(99,102,241,0.15);border-radius:4px;color:#a5b4fc;">🎬 Video đơn</span></td>
      <td><button class="btn btn-sm btn-primary" onclick="uploadToDrive('video', ${v.id})">☁️ Up lên Drive</button></td>
    </tr>
  `);

  const slidesetRows = (data.slidesets || []).map(s => `
    <tr>
      <td><div style="width:60px;height:40px;background:var(--bg-surface);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:18px;">🖼️</div></td>
      <td style="font-weight:600;">${s.title || 'Bộ slides #' + s.id}</td>
      <td><span style="font-size:11px;padding:2px 6px;background:rgba(0,242,234,0.1);border-radius:4px;color:var(--secondary);">🖼️ Bộ slides</span></td>
      <td><button class="btn btn-sm btn-primary" onclick="uploadToDrive('slideset', ${s.id})">☁️ Up lên Drive</button></td>
    </tr>
  `);

  const allRows = [...videoRows, ...slidesetRows];

  if (allRows.length) {
    el.innerHTML = `<table class="data-table"><thead><tr>
      <th></th><th>Tiêu đề</th><th>Loại</th><th>Hành động</th>
    </tr></thead><tbody>${allRows.join('')}</tbody></table>`;
  } else {
    el.innerHTML = '<div class="empty-state"><div class="icon">☁️</div><h4>Không có video nào</h4><p>Tạo video trước khi upload lên Drive</p></div>';
  }
}

async function uploadToDrive(type, id) {
  toast('Đang upload file lên Google Drive...', 'info');
  const data = await api(`/api/youtube/drive/upload-video/${type}/${id}`, { method: 'POST' });
  if (data?.success) {
    toast(data.message || 'Đã upload thành công!', 'success');
    loadDrivePage();
    if (document.getElementById('page-videos').classList.contains('active')) loadVideos();
  } else {
    _handleDriveError(data?.error);
  }
}

async function backupDbToDrive() {
  if (!confirm('Bạn có chắc chắn muốn xuất dữ liệu và tải lên Google Drive? Quá trình này có thể mất vài giây.')) return;
  toast('Đang sao lưu và tải lên Drive...', 'info');
  const data = await api('/api/youtube/drive/backup-db', { method: 'POST' });
  if (data?.success) {
    toast(data.message || 'Đã đồng bộ thành công!', 'success');
  } else {
    _handleDriveError(data?.error);
  }
}

async function restoreDbFromDrive() {
  if (!confirm('CẢNH BÁO: Hành động này sẽ TẢI VỀ và GHI ĐÈ dữ liệu hiện tại bằng dữ liệu từ Google Drive. Bạn có chắc chắn muốn tiếp tục?')) return;
  toast('Đang tải dữ liệu từ Drive...', 'info');
  const data = await api('/api/youtube/drive/restore-db', { method: 'POST' });
  if (data?.success) {
    toast(data.message, 'success');
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  } else {
    _handleDriveError(data?.error);
  }
}

function _handleDriveError(errorMsg) {
  if (!errorMsg) {
    toast('Lỗi không xác định', 'error');
    return;
  }
  
  // Lỗi chưa enable Drive API trong Google Cloud Console
  if (errorMsg.includes('has not been used in project') || errorMsg.includes('is disabled')) {
    const urlMatch = errorMsg.match(/https:\/\/console\.developers\.google\.com[^\s]+/);
    const link = urlMatch ? urlMatch[0] : 'https://console.cloud.google.com/apis/library/drive.googleapis.com';
    openModal('⚙️ Chưa bật Google Drive API', `
      <div style="padding:12px;">
        <p style="color:var(--text-primary);font-size:15px;line-height:1.6;margin-bottom:16px;">
          Bạn cần bật (Enable) <strong>Google Drive API</strong> cho dự án trên Google Cloud của bạn trước khi có thể sử dụng tính năng này.
        </p>
        <div style="background:var(--bg-surface);padding:16px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);">
          <strong style="color:var(--secondary);display:block;margin-bottom:8px;">Các bước thực hiện:</strong>
          <ol style="margin:0;padding-left:20px;line-height:1.8;color:var(--text-secondary);">
            <li>Click vào nút màu xanh bên dưới để mở Google Cloud Console.</li>
            <li>Bấm nút <strong>Enable</strong> (Bật) màu xanh dương trên trang web.</li>
            <li>Đợi khoảng 1-2 phút rồi quay lại phần mềm bấm Upload lại.</li>
          </ol>
        </div>
        <div style="margin-top:20px;text-align:center;">
          <a href="${link}" target="_blank" style="display:inline-block;background:var(--primary);color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
            👉 Mở Google Cloud để Bật API
          </a>
        </div>
      </div>
    `, `<button class="btn btn-ghost" onclick="closeModal()">Đóng</button>`);
    return;
  }

  // Lỗi chưa cấp quyền (Scope)
  if (errorMsg.includes('insufficient authentication scopes') || errorMsg.includes('scope')) {
    openModal('🔒 Cần cấp thêm quyền Google Drive', `
      <div style="text-align:center;padding:16px;">
        <div style="font-size:48px;margin-bottom:16px;">☁️</div>
        <p style="color:var(--text-secondary);font-size:15px;line-height:1.7;">
          Tài khoản của bạn chưa được cấp quyền truy cập Google Drive.<br>
          Hệ thống cần quyền này để upload/download file.
        </p>
        <div style="background:rgba(255,193,7,0.1);border:1px solid rgba(255,193,7,0.3);padding:12px;border-radius:8px;margin-top:16px;color:var(--warning);font-size:13px;text-align:left;">
          <strong>Cách khắc phục:</strong> Bấm nút bên dưới để <b>đăng nhập lại Google</b>. Khi có hộp thoại hiện ra, hãy nhớ tick chọn (✔) cấp quyền cho phép ứng dụng truy cập Google Drive.
        </div>
      </div>
    `, `
      <button class="btn btn-primary" onclick="closeModal(); loginYouTube()">🔗 Đăng nhập lại Google</button>
      <button class="btn btn-ghost" onclick="closeModal()">Để sau</button>
    `);
  } else {
    toast('Lỗi Drive: ' + errorMsg, 'error');
  }
}
