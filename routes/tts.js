const express = require('express');
const router = express.Router();
const ttsService = require('../services/ttsService');
const db = require('../database/db');
const path = require('path');

// GET /api/tts/voices - Lấy danh sách voices
router.get('/voices', async (req, res) => {
  try {
    const voices = await ttsService.getAvailableVoices();
    res.json({ voices });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/tts/preview - Tạo preview audio từ text
router.post('/preview', async (req, res) => {
  try {
    const { text, voice = 'female', rate = '+0%' } = req.body;
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Cần nhập nội dung' });
    }

    const audioPath = await ttsService.textToSpeech(text, {
      voice,
      rate,
      outputName: `preview_${Date.now()}.mp3`
    });

    const duration = await ttsService.getAudioDuration(audioPath);

    res.json({
      success: true,
      audio_url: '/temp/audio/' + path.basename(audioPath),
      duration,
      text_length: text.length
    });
  } catch (error) {
    console.error('TTS preview error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/tts/slideset/:id - Tạo TTS cho bộ slides
router.post('/slideset/:id', async (req, res) => {
  try {
    const { voice = 'female', rate = '+0%' } = req.body;

    const set = db.prepare('SELECT * FROM slidesets WHERE id = ?').get(req.params.id);
    if (!set) return res.status(404).json({ error: 'Slideset not found' });

    const items = db.prepare(`
      SELECT si.*, n.title as news_title, n.description as news_desc, n.content as news_content
      FROM slideset_items si LEFT JOIN news n ON si.news_id = n.id
      WHERE si.slideset_id = ? ORDER BY si.slide_index
    `).all(set.id);

    // Build text for each slide
    const slideTexts = items.map(item => {
      let text = '';
      if (item.slide_type === 'intro') {
        text = `Tin tức nổi bật ngày ${set.date_label || 'hôm nay'}. Cùng điểm qua những tin tức mới nhất!`;
      } else if (item.slide_type === 'cta') {
        text = 'Cảm ơn bạn đã theo dõi. Nhớ theo dõi kênh để cập nhật tin tức mới nhất mỗi ngày nhé!';
      } else if (item.slide_type === 'news') {
        // Use summary_text first, then title + description
        text = item.summary_text || item.news_title || '';
        if (item.news_desc && !item.summary_text) {
          text += '. ' + item.news_desc;
        }
      }
      return {
        index: item.slide_index,
        type: item.slide_type,
        text: text.trim()
      };
    });

    console.log(`🔊 Generating TTS for slideset #${set.id} (${slideTexts.length} slides, voice: ${voice})...`);

    const audioResults = await ttsService.generateSlideAudios(slideTexts, {
      voice,
      rate,
      prefix: `ss${set.id}`
    });

    // Store audio paths in database
    const updateStmt = db.prepare('UPDATE slideset_items SET audio_path = ?, audio_duration = ? WHERE slideset_id = ? AND slide_index = ?');
    for (const result of audioResults) {
      if (result.audioPath) {
        updateStmt.run(result.audioPath, result.duration, set.id, result.index);
      }
    }

    const totalDuration = audioResults.reduce((sum, r) => sum + (r.duration || 0), 0);
    console.log(`✅ TTS generated: ${audioResults.filter(r => r.audioPath).length} audio clips, total ${totalDuration.toFixed(1)}s`);

    res.json({
      success: true,
      audios: audioResults.map(r => ({
        index: r.index,
        type: r.type,
        duration: r.duration,
        audio_url: r.audioPath ? '/temp/audio/' + path.basename(r.audioPath) : null
      })),
      total_duration: totalDuration
    });
  } catch (error) {
    console.error('TTS slideset error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
