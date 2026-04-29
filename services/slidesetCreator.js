const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const TEMP_DIR = path.join(__dirname, '..', 'temp', 'slidesets');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const WIDTH = 1080;
const HEIGHT = 1350; // Tỷ lệ 4:5 phù hợp TikTok photo

class SlidesetCreator {
  constructor() {
    this.colors = {
      primary: '#FF0050',
      secondary: '#00F2EA',
      dark: '#0a0a14',
      cardBg: '#15152a',
      white: '#FFFFFF',
      gray: '#9CA3AF',
      gold: '#FFD700',
      warmBg1: '#1a0a2e',
      warmBg2: '#16213e',
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

  _drawGradientBg(ctx, color1 = '#0f0c29', color2 = '#302b63', color3 = '#24243e') {
    const grd = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grd.addColorStop(0, color1);
    grd.addColorStop(0.5, color2);
    grd.addColorStop(1, color3);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Decorative glow
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = this.colors.primary;
    ctx.beginPath();
    ctx.arc(150, 200, 250, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.colors.secondary;
    ctx.beginPath();
    ctx.arc(WIDTH - 100, HEIGHT - 300, 300, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawTopBar(ctx) {
    const grd = ctx.createLinearGradient(0, 0, WIDTH, 0);
    grd.addColorStop(0, this.colors.primary);
    grd.addColorStop(1, this.colors.secondary);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, WIDTH, 5);
  }

  _drawBottomBar(ctx) {
    const grd = ctx.createLinearGradient(0, 0, WIDTH, 0);
    grd.addColorStop(0, this.colors.secondary);
    grd.addColorStop(1, this.colors.primary);
    ctx.fillStyle = grd;
    ctx.fillRect(0, HEIGHT - 5, WIDTH, 5);
  }

  _drawSlideNum(ctx, num, total) {
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'right';
    ctx.fillText(`${num}/${total}`, WIDTH - 50, HEIGHT - 40);
  }

  /**
   * Tóm tắt nội dung tin - lấy khoảng 40-50 từ
   */
  summarizeContent(content) {
    if (!content) return '';
    // Clean up
    const clean = content.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    const words = clean.split(/\s+/);
    
    if (words.length <= 50) {
      return clean + (!clean.match(/[.!?]$/) ? '.' : '');
    }

    // Try to get sentences that sum up to ~40-50 words
    const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
    let summary = '';
    let wordCount = 0;

    for (const sentence of sentences) {
      const sentenceWords = sentence.trim().split(/\s+/).length;
      if (wordCount === 0 || wordCount + sentenceWords <= 55) { 
         summary += (summary ? ' ' : '') + sentence.trim();
         wordCount += sentenceWords;
         if (wordCount >= 40) break;
      } else {
         break;
      }
    }

    // If summary is still too short, just cut by words
    if (wordCount < 30) {
       summary = words.slice(0, 45).join(' ') + '...';
    }

    if (!summary.endsWith('...') && !summary.match(/[.!?]$/)) {
      summary += '.';
    }

    return summary;
  }

  /**
   * Slide 1: Intro - "Bản tin {time} ngày DD/MM/YYYY"
   */
  async createIntroSlide(timeLabel, dateLabel, totalSlides, setId) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // Dark premium background
    this._drawGradientBg(ctx, '#0a0015', '#1a0a3e', '#0d0d2b');
    this._drawTopBar(ctx);
    this._drawBottomBar(ctx);

    // Large globe emoji
    ctx.font = '160px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🌍', WIDTH / 2, HEIGHT / 2 - 180);

    // Main title
    ctx.font = 'bold 64px Arial, sans-serif';
    const titleGrd = ctx.createLinearGradient(WIDTH / 2 - 300, 0, WIDTH / 2 + 300, 0);
    titleGrd.addColorStop(0, this.colors.primary);
    titleGrd.addColorStop(0.5, this.colors.gold);
    titleGrd.addColorStop(1, this.colors.secondary);
    ctx.fillStyle = titleGrd;
    const mainTitle = `BẢN TIN ${timeLabel.toUpperCase()}`;
    ctx.fillText(mainTitle, WIDTH / 2, HEIGHT / 2 - 30);

    // Date
    ctx.font = 'bold 52px Arial, sans-serif';
    ctx.fillStyle = this.colors.white;
    ctx.fillText(`Ngày ${dateLabel}`, WIDTH / 2, HEIGHT / 2 + 50);

    // Decorative line
    const lineGrd = ctx.createLinearGradient(WIDTH / 2 - 200, 0, WIDTH / 2 + 200, 0);
    lineGrd.addColorStop(0, 'rgba(255,0,80,0)');
    lineGrd.addColorStop(0.5, this.colors.primary);
    lineGrd.addColorStop(1, 'rgba(255,0,80,0)');
    ctx.strokeStyle = lineGrd;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(WIDTH / 2 - 200, HEIGHT / 2 + 90);
    ctx.lineTo(WIDTH / 2 + 200, HEIGHT / 2 + 90);
    ctx.stroke();

    // Subtitle
    ctx.font = '32px Arial, sans-serif';
    ctx.fillStyle = this.colors.gray;
    ctx.fillText('Tổng hợp tin tức nổi bật trong ngày', WIDTH / 2, HEIGHT / 2 + 150);

    // Swipe hint
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.fillStyle = this.colors.secondary;
    ctx.fillText('👉 Vuốt để xem tin tức', WIDTH / 2, HEIGHT - 100);

    this._drawSlideNum(ctx, 1, totalSlides);

    const filePath = path.join(TEMP_DIR, `set${setId}_intro_${Date.now()}.png`);
    fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
    return filePath;
  }

  /**
   * Slides 2-6: News slide - Ảnh chính + Tiêu đề + Tóm tắt + Nguồn
   */
  async createNewsSlide(newsItem, summary, slideNum, totalSlides, setId) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    this._drawGradientBg(ctx);
    this._drawTopBar(ctx);

    let imageEndY = 60;

    // Main news image
    if (newsItem.image_url) {
      const img = await this.downloadImage(newsItem.image_url);
      if (img) {
        const imgH = 520;
        const imgY = 50;
        ctx.save();
        this._drawRoundedRect(ctx, 40, imgY, WIDTH - 80, imgH, 20);
        ctx.clip();
        const scale = Math.max((WIDTH - 80) / img.width, imgH / img.height);
        const sw = img.width * scale;
        const sh = img.height * scale;
        ctx.drawImage(img, 40 + (WIDTH - 80 - sw) / 2, imgY + (imgH - sh) / 2, sw, sh);
        
        // Dark gradient overlay at bottom of image
        const overlayGrd = ctx.createLinearGradient(0, imgY + imgH - 150, 0, imgY + imgH);
        overlayGrd.addColorStop(0, 'rgba(0,0,0,0)');
        overlayGrd.addColorStop(1, 'rgba(0,0,0,0.6)');
        ctx.fillStyle = overlayGrd;
        ctx.fillRect(40, imgY, WIDTH - 80, imgH);
        ctx.restore();

        // Slide number badge on image
        ctx.save();
        this._drawRoundedRect(ctx, WIDTH - 130, imgY + 15, 75, 40, 20);
        ctx.fillStyle = this.colors.primary;
        ctx.fill();
        ctx.font = 'bold 22px Arial, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(`${slideNum - 1}/5`, WIDTH - 92, imgY + 42);
        ctx.restore();

        imageEndY = imgY + imgH + 25;
      }
    }

    // Category badge
    if (newsItem.category) {
      ctx.font = 'bold 22px Arial, sans-serif';
      const catText = newsItem.category.toUpperCase();
      const catMetrics = ctx.measureText(catText);
      const catW = catMetrics.width + 30;
      
      this._drawRoundedRect(ctx, 50, imageEndY, catW, 38, 19);
      const catGrd = ctx.createLinearGradient(50, imageEndY, 50 + catW, imageEndY);
      catGrd.addColorStop(0, this.colors.primary);
      catGrd.addColorStop(1, '#ff4081');
      ctx.fillStyle = catGrd;
      ctx.fill();
      
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(catText, 65, imageEndY + 27);
      imageEndY += 55;
    }

    // Title
    ctx.font = 'bold 42px Arial, sans-serif';
    ctx.fillStyle = this.colors.white;
    ctx.textAlign = 'left';
    const titleLines = this._wrapText(ctx, newsItem.title, WIDTH - 100);
    let ty = imageEndY + 45;
    for (const line of titleLines.slice(0, 3)) {
      ctx.fillText(line, 50, ty);
      ty += 52;
    }

    // Divider line
    ty += 10;
    const divGrd = ctx.createLinearGradient(50, ty, WIDTH - 50, ty);
    divGrd.addColorStop(0, this.colors.primary);
    divGrd.addColorStop(0.5, 'rgba(255,0,80,0.3)');
    divGrd.addColorStop(1, 'rgba(255,0,80,0)');
    ctx.strokeStyle = divGrd;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(50, ty);
    ctx.lineTo(WIDTH - 50, ty);
    ctx.stroke();
    ty += 25;

    // Summary content in a card
    const cardY = ty;
    const cardH = HEIGHT - cardY - 110;
    this._drawRoundedRect(ctx, 40, cardY, WIDTH - 80, cardH, 20);
    ctx.fillStyle = 'rgba(21, 21, 42, 0.8)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Summary text
    ctx.font = '34px Arial, sans-serif';
    ctx.fillStyle = '#E0E0E0';
    ctx.textAlign = 'left';
    const summaryLines = this._wrapText(ctx, summary, WIDTH - 160);
    let sy = cardY + 45;
    for (const line of summaryLines.slice(0, 8)) {
      ctx.fillText(line, 70, sy);
      sy += 46;
    }

    // Source
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillStyle = this.colors.secondary;
    ctx.textAlign = 'left';
    ctx.fillText('📰 Nguồn: VnExpress.net', 50, HEIGHT - 50);

    this._drawSlideNum(ctx, slideNum, totalSlides);

    const filePath = path.join(TEMP_DIR, `set${setId}_news${slideNum}_${Date.now()}.png`);
    fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
    return filePath;
  }

  /**
   * Slide 7: CTA - Đăng ký, like, theo dõi
   */
  async createCtaSlide(totalSlides, setId) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    this._drawGradientBg(ctx, '#0a0015', '#200a3e', '#0d0d2b');
    this._drawTopBar(ctx);
    this._drawBottomBar(ctx);

    const cy = HEIGHT / 2 - 120;

    // Heart animation circles background
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? this.colors.primary : this.colors.secondary;
      ctx.beginPath();
      ctx.arc(
        Math.random() * WIDTH,
        Math.random() * HEIGHT,
        50 + Math.random() * 100,
        0, Math.PI * 2
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Main CTA icon
    ctx.font = '120px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('❤️', WIDTH / 2, cy);

    // CTA texts
    ctx.font = 'bold 54px Arial, sans-serif';
    const ctaGrd = ctx.createLinearGradient(WIDTH / 2 - 250, 0, WIDTH / 2 + 250, 0);
    ctaGrd.addColorStop(0, this.colors.primary);
    ctaGrd.addColorStop(1, this.colors.secondary);
    ctx.fillStyle = ctaGrd;
    ctx.fillText('NẾU BẠN THẤY HAY', WIDTH / 2, cy + 80);

    // Action items
    const actions = [
      { icon: '❤️', text: 'Nhấn LIKE để ủng hộ' },
      { icon: '💬', text: 'BÌNH LUẬN ý kiến của bạn' },
      { icon: '🔔', text: 'FOLLOW để cập nhật mỗi ngày' },
      { icon: '↗️', text: 'CHIA SẺ cho bạn bè cùng xem' },
    ];

    let ay = cy + 140;
    for (const action of actions) {
      // Action card
      this._drawRoundedRect(ctx, 100, ay, WIDTH - 200, 60, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = '34px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.fillText(`${action.icon}  ${action.text}`, 130, ay + 42);
      ay += 80;
    }

    // Bottom tagline
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.fillStyle = this.colors.gold;
    ctx.textAlign = 'center';
    ctx.fillText('Cảm ơn bạn đã theo dõi! 🙏', WIDTH / 2, HEIGHT - 100);

    this._drawSlideNum(ctx, totalSlides, totalSlides);

    const filePath = path.join(TEMP_DIR, `set${setId}_cta_${Date.now()}.png`);
    fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
    return filePath;
  }

  /**
   * Tạo toàn bộ 7 slides cho 1 bộ ảnh
   * @param {Array} newsItems - Mảng 5 tin tức
   * @param {string} dateLabel - Ngày (VD: "28/04/2025")
   * @param {number} setId - ID của slideset
   * @param {string} timeLabel - "sáng", "trưa", "tối"
   */
  async createFullSlideset(newsItems, dateLabel, setId, timeLabel = 'sáng') {
    const totalSlides = newsItems.length + 2; // intro + news + cta
    const slides = [];

    // Slide 1: Intro
    console.log('  📌 Creating intro slide...');
    const introPath = await this.createIntroSlide(timeLabel, dateLabel, totalSlides, setId);
    slides.push({
      path: introPath,
      type: 'intro',
      index: 1,
      newsId: null,
      summary: `Bản tin ${timeLabel} ngày ${dateLabel}`
    });

    // Slides 2-6: News
    for (let i = 0; i < newsItems.length; i++) {
      const news = newsItems[i];
      const summary = this.summarizeContent(news.content || news.description);
      console.log(`  📰 Creating news slide ${i + 1}/${newsItems.length}: ${news.title.substring(0, 40)}...`);

      const newsPath = await this.createNewsSlide(news, summary, i + 2, totalSlides, setId);
      slides.push({
        path: newsPath,
        type: 'news',
        index: i + 2,
        newsId: news.id,
        summary: summary
      });
    }

    // Slide 7: CTA
    console.log('  ❤️ Creating CTA slide...');
    const ctaPath = await this.createCtaSlide(totalSlides, setId);
    slides.push({
      path: ctaPath,
      type: 'cta',
      index: totalSlides,
      newsId: null,
      summary: 'Like, Follow, Share'
    });

    return slides;
  }
}

module.exports = new SlidesetCreator();
