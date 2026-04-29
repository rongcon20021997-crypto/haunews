const { createCanvas, loadImage, registerFont } = require('canvas');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const TEMP_DIR = path.join(__dirname, '..', 'temp', 'images');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const WIDTH = 1080;
const HEIGHT = 1920;

class ImageCreator {
  constructor() {
    this.colors = {
      primary: '#FF0050',
      secondary: '#00F2EA',
      dark: '#121212',
      darkCard: '#1E1E2E',
      white: '#FFFFFF',
      gray: '#A0A0B0',
      gradient1: '#667eea',
      gradient2: '#764ba2',
      accent: '#f7971e',
      accentEnd: '#ffd200'
    };
  }

  async downloadImage(url) {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
      return await loadImage(Buffer.from(response.data));
    } catch (e) {
      console.error('Failed to download image:', e.message);
      return null;
    }
  }

  _wrapText(ctx, text, maxWidth) {
    const words = text.split('');
    const lines = [];
    let currentLine = '';
    for (const char of words) {
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  _drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _drawBackground(ctx) {
    const grd = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    grd.addColorStop(0, '#0f0c29');
    grd.addColorStop(0.5, '#302b63');
    grd.addColorStop(1, '#24243e');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Decorative circles
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = this.colors.primary;
    ctx.beginPath();
    ctx.arc(100, 300, 200, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.colors.secondary;
    ctx.beginPath();
    ctx.arc(WIDTH - 100, HEIGHT - 400, 250, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawSource(ctx, y) {
    const sourceText = '📰 Nguồn: VnExpress.net';
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.fillStyle = this.colors.secondary;
    ctx.textAlign = 'left';
    ctx.fillText(sourceText, 60, y);
  }

  _drawCategoryBadge(ctx, category, x, y) {
    ctx.font = 'bold 26px Arial, sans-serif';
    const metrics = ctx.measureText(category);
    const padX = 20, padY = 10;
    const grd = ctx.createLinearGradient(x, y - padY, x + metrics.width + padX * 2, y + padY);
    grd.addColorStop(0, this.colors.primary);
    grd.addColorStop(1, '#ff4081');
    this._drawRoundedRect(ctx, x, y - 30, metrics.width + padX * 2, 44, 22);
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(category, x + padX, y);
  }

  /**
   * Slide 1: Cover - Ảnh chính + Tiêu đề
   */
  async createCoverSlide(article, index) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // Background
    this._drawBackground(ctx);

    // Main image
    if (article.image_url) {
      const img = await this.downloadImage(article.image_url);
      if (img) {
        const imgH = 700;
        const imgY = 200;
        // Draw image with rounded corners
        ctx.save();
        this._drawRoundedRect(ctx, 40, imgY, WIDTH - 80, imgH, 24);
        ctx.clip();
        const scale = Math.max((WIDTH - 80) / img.width, imgH / img.height);
        const sw = img.width * scale;
        const sh = img.height * scale;
        ctx.drawImage(img, 40 + (WIDTH - 80 - sw) / 2, imgY + (imgH - sh) / 2, sw, sh);
        // Dark overlay at bottom
        const overlayGrd = ctx.createLinearGradient(0, imgY + imgH - 200, 0, imgY + imgH);
        overlayGrd.addColorStop(0, 'rgba(0,0,0,0)');
        overlayGrd.addColorStop(1, 'rgba(0,0,0,0.7)');
        ctx.fillStyle = overlayGrd;
        ctx.fillRect(40, imgY, WIDTH - 80, imgH);
        ctx.restore();
      }
    }

    // Category badge
    if (article.category) {
      this._drawCategoryBadge(ctx, article.category, 60, 170);
    }

    // Title
    ctx.font = 'bold 52px Arial, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    const titleLines = this._wrapText(ctx, article.title, WIDTH - 120);
    let ty = 980;
    for (const line of titleLines.slice(0, 5)) {
      // Text shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillText(line, 62, ty + 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(line, 60, ty);
      ty += 64;
    }

    // Description preview
    if (article.description) {
      ctx.font = '32px Arial, sans-serif';
      ctx.fillStyle = this.colors.gray;
      const descLines = this._wrapText(ctx, article.description, WIDTH - 120);
      let dy = ty + 30;
      for (const line of descLines.slice(0, 3)) {
        ctx.fillText(line, 60, dy);
        dy += 42;
      }
    }

    // Source watermark
    this._drawSource(ctx, HEIGHT - 100);

    // Slide number
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.fillStyle = this.colors.primary;
    ctx.textAlign = 'right';
    ctx.fillText(`1/${index}`, WIDTH - 60, HEIGHT - 100);

    // TikTok-style top bar
    const topGrd = ctx.createLinearGradient(0, 0, WIDTH, 0);
    topGrd.addColorStop(0, this.colors.primary);
    topGrd.addColorStop(1, this.colors.secondary);
    ctx.fillStyle = topGrd;
    ctx.fillRect(0, 0, WIDTH, 6);

    const filePath = path.join(TEMP_DIR, `slide_cover_${Date.now()}.png`);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  /**
   * Slide nội dung
   */
  async createContentSlide(article, text, slideNum, totalSlides, contentImage) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    this._drawBackground(ctx);

    // Top bar
    const topGrd = ctx.createLinearGradient(0, 0, WIDTH, 0);
    topGrd.addColorStop(0, this.colors.primary);
    topGrd.addColorStop(1, this.colors.secondary);
    ctx.fillStyle = topGrd;
    ctx.fillRect(0, 0, WIDTH, 6);

    // Small title at top
    ctx.font = 'bold 32px Arial, sans-serif';
    ctx.fillStyle = this.colors.secondary;
    ctx.textAlign = 'left';
    const shortTitle = article.title.length > 50 ? article.title.substring(0, 47) + '...' : article.title;
    ctx.fillText(shortTitle, 60, 80);

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 110);
    ctx.lineTo(WIDTH - 60, 110);
    ctx.stroke();

    let contentY = 160;

    // Content image if available
    if (contentImage) {
      const img = await this.downloadImage(contentImage);
      if (img) {
        const imgH = 500;
        ctx.save();
        this._drawRoundedRect(ctx, 60, contentY, WIDTH - 120, imgH, 20);
        ctx.clip();
        const scale = Math.max((WIDTH - 120) / img.width, imgH / img.height);
        const sw = img.width * scale;
        const sh = img.height * scale;
        ctx.drawImage(img, 60 + (WIDTH - 120 - sw) / 2, contentY + (imgH - sh) / 2, sw, sh);
        ctx.restore();
        contentY += imgH + 40;
      }
    }

    // Content card
    this._drawRoundedRect(ctx, 40, contentY, WIDTH - 80, HEIGHT - contentY - 200, 24);
    ctx.fillStyle = 'rgba(30, 30, 46, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Quote icon
    ctx.font = '80px Arial, sans-serif';
    ctx.fillStyle = this.colors.primary;
    ctx.globalAlpha = 0.3;
    ctx.fillText('❝', 70, contentY + 80);
    ctx.globalAlpha = 1;

    // Content text
    ctx.font = '38px Arial, sans-serif';
    ctx.fillStyle = '#EAEAEA';
    ctx.textAlign = 'left';
    const contentLines = this._wrapText(ctx, text, WIDTH - 160);
    let cy = contentY + 100;
    for (const line of contentLines.slice(0, 18)) {
      ctx.fillText(line, 80, cy);
      cy += 52;
    }

    // Source
    this._drawSource(ctx, HEIGHT - 100);

    // Slide number
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.fillStyle = this.colors.primary;
    ctx.textAlign = 'right';
    ctx.fillText(`${slideNum}/${totalSlides}`, WIDTH - 60, HEIGHT - 100);

    const filePath = path.join(TEMP_DIR, `slide_content_${slideNum}_${Date.now()}.png`);
    fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
    return filePath;
  }

  /**
   * Slide cuối: Nguồn + CTA
   */
  async createEndSlide(article, totalSlides) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    this._drawBackground(ctx);

    // Center content
    const cy = HEIGHT / 2 - 200;

    // Source card
    this._drawRoundedRect(ctx, 80, cy, WIDTH - 160, 500, 30);
    const cardGrd = ctx.createLinearGradient(80, cy, WIDTH - 80, cy + 500);
    cardGrd.addColorStop(0, 'rgba(255,0,80,0.15)');
    cardGrd.addColorStop(1, 'rgba(0,242,234,0.15)');
    ctx.fillStyle = cardGrd;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Icon
    ctx.font = '100px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📰', WIDTH / 2, cy + 110);

    // Source text
    ctx.font = 'bold 42px Arial, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('Nguồn tin tức', WIDTH / 2, cy + 200);

    ctx.font = 'bold 48px Arial, sans-serif';
    const srcGrd = ctx.createLinearGradient(WIDTH / 2 - 200, 0, WIDTH / 2 + 200, 0);
    srcGrd.addColorStop(0, this.colors.primary);
    srcGrd.addColorStop(1, this.colors.secondary);
    ctx.fillStyle = srcGrd;
    ctx.fillText('VnExpress.net', WIDTH / 2, cy + 270);

    ctx.font = '30px Arial, sans-serif';
    ctx.fillStyle = this.colors.gray;
    ctx.fillText(article.category || 'Tin tức', WIDTH / 2, cy + 330);

    // CTA
    ctx.font = 'bold 36px Arial, sans-serif';
    ctx.fillStyle = this.colors.secondary;
    ctx.fillText('Follow để cập nhật tin tức mỗi ngày! 🔔', WIDTH / 2, cy + 430);

    // Bottom branding
    const bottomGrd = ctx.createLinearGradient(0, 0, WIDTH, 0);
    bottomGrd.addColorStop(0, this.colors.primary);
    bottomGrd.addColorStop(1, this.colors.secondary);
    ctx.fillStyle = bottomGrd;
    ctx.fillRect(0, HEIGHT - 6, WIDTH, 6);

    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.fillStyle = this.colors.primary;
    ctx.textAlign = 'right';
    ctx.fillText(`${totalSlides}/${totalSlides}`, WIDTH - 60, HEIGHT - 100);

    const filePath = path.join(TEMP_DIR, `slide_end_${Date.now()}.png`);
    fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
    return filePath;
  }

  /**
   * Tạo tất cả slides cho 1 bài viết
   */
  async createAllSlides(article) {
    const slides = [];
    const paragraphs = article.paragraphs || article.content.split('\n\n').filter(p => p.trim().length > 20);
    const images = article.images || [];
    const totalSlides = Math.min(paragraphs.length, 4) + 2; // cover + content + end

    // Slide 1: Cover
    const cover = await this.createCoverSlide(article, totalSlides);
    slides.push({ path: cover, type: 'cover', index: 1 });

    // Content slides (up to 4)
    const contentCount = Math.min(paragraphs.length, totalSlides - 2);
    for (let i = 0; i < contentCount; i++) {
      const contentImg = images[i + 1] || null;
      const slide = await this.createContentSlide(article, paragraphs[i], i + 2, totalSlides, contentImg);
      slides.push({ path: slide, type: 'content', index: i + 2 });
    }

    // End slide
    const end = await this.createEndSlide(article, totalSlides);
    slides.push({ path: end, type: 'end', index: totalSlides });

    return slides;
  }
}

module.exports = new ImageCreator();
