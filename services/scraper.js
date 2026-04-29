const axios = require('axios');
const cheerio = require('cheerio');

const RSS_URL = 'https://vnexpress.net/rss/tin-moi-nhat.rss';
const VNEXPRESS_URL = 'https://vnexpress.net';

class NewsScraper {
  async fetchLatestNews(limit = 20) {
    const { data } = await axios.get(RSS_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 15000
    });
    const $ = cheerio.load(data, { xmlMode: true });
    const articles = [];
    $('item').each((i, el) => {
      if (i >= limit) return false;
      const title = $(el).find('title').text().trim();
      const link = $(el).find('link').text().trim();
      const desc = $(el).find('description').text().trim();
      const descHtml = cheerio.load(desc);
      const imageUrl = descHtml('img').attr('src') || '';
      const descText = descHtml.text().trim();
      if (title && link) {
        articles.push({ title, source_url: link, description: descText, image_url: imageUrl, category: this._cat(link) });
      }
    });
    return articles;
  }

  async fetchArticleContent(url) {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 15000
    });
    const $ = cheerio.load(data);
    const title = $('h1.title-detail').text().trim() || $('h1').first().text().trim();
    const description = $('p.description').text().trim() || $('.sapo_detail').text().trim();
    let imageUrl = $('meta[property="og:image"]').attr('content') || '';
    if (!imageUrl) {
      const img = $('article img').first();
      imageUrl = img.attr('data-src') || img.attr('src') || '';
    }
    const paragraphs = [];
    $('article.fck_detail p.Normal, p.Normal').each((i, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 20 && !paragraphs.includes(text)) paragraphs.push(text);
    });
    const images = [];
    $('article img, .fck_detail img').each((i, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src') || '';
      if (src && src.includes('vnexpress') && !src.includes('icon')) images.push(src);
    });
    const category = $('ul.breadcrumb li a').last().text().trim() || 'Tin tức';
    const author = $('p.author_mail strong').text().trim() || 'VnExpress';
    return { title, description, content: paragraphs.join('\n\n'), paragraphs, image_url: imageUrl, images, category, author, source_url: url };
  }

  _cat(url) {
    const m = { 'thoi-su':'Thời sự','the-gioi':'Thế giới','kinh-doanh':'Kinh doanh','giai-tri':'Giải trí','the-thao':'Thể thao','phap-luat':'Pháp luật','giao-duc':'Giáo dục','suc-khoe':'Sức khỏe','doi-song':'Đời sống','du-lich':'Du lịch','khoa-hoc':'Khoa học','so-hoa':'Số hóa' };
    for (const [s, n] of Object.entries(m)) { if (url.includes(`/${s}/`)) return n; }
    return 'Tin tức';
  }
}

module.exports = new NewsScraper();
