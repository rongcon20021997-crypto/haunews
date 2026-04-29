const { EdgeTTS } = require('edge-tts-universal');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');

// Set ffmpeg path if configured
if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

const AUDIO_DIR = path.join(__dirname, '..', 'temp', 'audio');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

// Vietnamese voices from Microsoft Edge TTS
const VOICES = {
  'female': 'vi-VN-HoaiMyNeural',
  'male': 'vi-VN-NamMinhNeural'
};

// Delay helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class TTSService {
  /**
   * Tạo audio từ text (with retry)
   * @param {string} text - Nội dung cần đọc
   * @param {Object} options
   * @param {string} options.voice - 'female' hoặc 'male'
   * @param {string} options.rate - Tốc độ đọc: '-10%', '+0%', '+10%', '+20%'
   * @param {string} options.volume - Âm lượng: '+0%', '-10%', etc.
   * @returns {string} Đường dẫn file audio MP3
   */
  async textToSpeech(text, options = {}) {
    const {
      voice = 'female',
      rate = '+0%',
      volume = '+0%',
      outputName = `tts_${Date.now()}.mp3`,
      retries = 3
    } = options;

    const outputPath = path.join(AUDIO_DIR, outputName);
    const voiceName = VOICES[voice] || VOICES['female'];

    console.log(`🔊 TTS: Generating audio with voice ${voiceName}...`);
    console.log(`   📝 Text (${text.length} chars): "${text.substring(0, 80)}..."`);

    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // EdgeTTS constructor: new EdgeTTS(text, voice, { rate, volume, pitch })
        const tts = new EdgeTTS(text, voiceName, {
          rate: rate,
          volume: volume
        });

        const result = await tts.synthesize();

        // result.audio is a Blob - convert to Buffer
        if (!result || !result.audio) {
          throw new Error('TTS synthesize returned no audio data');
        }

        const arrayBuffer = await result.audio.arrayBuffer();
        const audioData = Buffer.from(arrayBuffer);

        if (audioData.length === 0) {
          throw new Error('TTS audio data is empty');
        }

        fs.writeFileSync(outputPath, audioData);
        console.log(`✅ TTS audio saved: ${outputPath} (${(audioData.length / 1024).toFixed(1)}KB)`);
        return outputPath;
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          const delay = attempt * 1500; // 1.5s, 3s, 4.5s
          console.log(`   ⚠️ Attempt ${attempt}/${retries} failed: ${err.message}. Retrying in ${delay}ms...`);
          await sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Tạo audio cho từng slide trong slideset
   * @param {Array} slideTexts - Mảng { index, text, type }
   * @param {Object} options
   * @returns {Array} Mảng { index, audioPath, duration }
   */
  async generateSlideAudios(slideTexts, options = {}) {
    const {
      voice = 'female',
      rate = '+0%',
      prefix = 'slide'
    } = options;

    const results = [];

    for (const slide of slideTexts) {
      if (!slide.text || slide.text.trim().length === 0) {
        results.push({ index: slide.index, audioPath: null, duration: 0 });
        continue;
      }

      try {
        const outputName = `${prefix}_${slide.index}_${Date.now()}.mp3`;
        const audioPath = await this.textToSpeech(slide.text, {
          voice,
          rate,
          outputName,
          retries: 3
        });

        // Get audio duration
        const duration = await this.getAudioDuration(audioPath);
        results.push({
          index: slide.index,
          type: slide.type,
          audioPath,
          duration
        });

        console.log(`   🎵 Slide ${slide.index}: ${duration.toFixed(1)}s`);

        // Delay between TTS calls to avoid rate limiting
        await sleep(800);
      } catch (err) {
        console.error(`   ❌ TTS error for slide ${slide.index}:`, err.message);
        results.push({ index: slide.index, audioPath: null, duration: 0 });
      }
    }

    return results;
  }

  /**
   * Ghép nhiều audio clips thành 1 file, với khoảng silence giữa mỗi clip
   * @param {Array} audioParts - [{ audioPath, silenceAfter (seconds) }]
   * @param {string} outputName
   * @returns {string} Đường dẫn audio merged
   */
  async mergeAudioClips(audioParts, outputName = `merged_${Date.now()}.mp3`) {
    const outputPath = path.join(AUDIO_DIR, outputName);

    // Create concat file with silence gaps
    const concatFilePath = path.join(AUDIO_DIR, `concat_audio_${Date.now()}.txt`);

    // Generate silence files if needed
    const parts = [];
    for (let i = 0; i < audioParts.length; i++) {
      const part = audioParts[i];
      if (part.audioPath && fs.existsSync(part.audioPath)) {
        parts.push(part.audioPath);
      }

      // Add silence gap between clips (or after for spacing)
      if (part.silenceAfter && part.silenceAfter > 0) {
        const silenceKey = Math.round(part.silenceAfter * 10); // round to 0.1s
        const silencePath = path.join(AUDIO_DIR, `silence_${silenceKey}.mp3`);
        if (!fs.existsSync(silencePath)) {
          await this._generateSilence(part.silenceAfter, silencePath);
        }
        parts.push(silencePath);
      }
    }

    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0];

    // Write concat file
    const concatContent = parts.map(p => {
      const absPath = path.resolve(p).replace(/\\/g, '/');
      return `file '${absPath}'`;
    }).join('\n');
    fs.writeFileSync(concatFilePath, concatContent);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatFilePath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy'])
        .output(outputPath)
        .on('end', () => {
          try { fs.unlinkSync(concatFilePath); } catch (e) {}
          console.log(`✅ Merged audio: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          try { fs.unlinkSync(concatFilePath); } catch (e) {}
          reject(err);
        })
        .run();
    });
  }

  /**
   * Lấy danh sách voices có sẵn
   */
  async getAvailableVoices() {
    return Object.entries(VOICES).map(([key, name]) => ({
      ShortName: name,
      FriendlyName: key === 'female' ? 'Hoài My (Nữ)' : 'Nam Minh (Nam)',
      Gender: key === 'female' ? 'Female' : 'Male',
      Locale: 'vi-VN'
    }));
  }

  /**
   * Lấy thời lượng audio
   */
  async getAudioDuration(audioPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) return resolve(0);
        resolve(metadata.format.duration || 0);
      });
    });
  }

  /**
   * Tạo file silence bằng WAV thuần (không cần lavfi)
   * Generates a silent WAV file then converts to MP3
   */
  async _generateSilence(durationSec, outputPath) {
    // Generate silent WAV file programmatically
    const sampleRate = 44100;
    const numChannels = 1;
    const bitsPerSample = 16;
    const numSamples = Math.round(sampleRate * durationSec);
    const dataSize = numSamples * numChannels * (bitsPerSample / 8);
    const fileSize = 44 + dataSize; // WAV header = 44 bytes

    const buffer = Buffer.alloc(fileSize);

    // WAV header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(fileSize - 8, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);          // PCM format chunk size
    buffer.writeUInt16LE(1, 20);           // Audio format: PCM
    buffer.writeUInt16LE(numChannels, 22); // Channels
    buffer.writeUInt32LE(sampleRate, 24);  // Sample rate
    buffer.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28); // Byte rate
    buffer.writeUInt16LE(numChannels * bitsPerSample / 8, 32);             // Block align
    buffer.writeUInt16LE(bitsPerSample, 34); // Bits per sample
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    // Data section is already zeros (silence) from Buffer.alloc

    // Write WAV then convert to MP3 with ffmpeg
    const wavPath = outputPath.replace('.mp3', '.wav');
    fs.writeFileSync(wavPath, buffer);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(wavPath)
        .outputOptions(['-c:a', 'libmp3lame', '-b:a', '128k'])
        .output(outputPath)
        .on('end', () => {
          try { fs.unlinkSync(wavPath); } catch (e) {}
          console.log(`🔇 Generated silence: ${durationSec}s -> ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          try { fs.unlinkSync(wavPath); } catch (e) {}
          reject(err);
        })
        .run();
    });
  }

  /**
   * Dọn dẹp audio temp files
   */
  cleanup(audioPaths) {
    for (const p of audioPaths) {
      try {
        if (p && fs.existsSync(p) && !p.includes('silence_')) {
          fs.unlinkSync(p);
        }
      } catch (e) {}
    }
  }
}

module.exports = new TTSService();
