const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

const TEMP_DIR = path.join(__dirname, '..', 'temp', 'videos');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// Set ffmpeg path if configured
if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

class VideoCreator {
  /**
   * Tạo video từ danh sách ảnh slides
   * @param {Array} slidePaths - Mảng đường dẫn ảnh
   * @param {Object} options - Tùy chọn
   * @returns {string} Đường dẫn video output
   */
  /**
   * Tạo video từ danh sách ảnh slides
   * @param {Array} slidePaths - Mảng đường dẫn ảnh
   * @param {Object} options - Tùy chọn
   * @param {number} options.duration - Thời gian mặc định mỗi slide (giây)
   * @param {Array<number>} options.durations - Thời gian riêng cho từng slide (giây), ưu tiên hơn duration
   * @returns {string} Đường dẫn video output
   */
  async createVideoFromSlides(slidePaths, options = {}) {
    const {
      duration = 4,        // Thời gian mặc định mỗi slide (giây)
      durations = null,    // Mảng thời gian riêng cho từng slide [3, 5, 5, 5, 5, 5, 3]
      transition = 'fade', // Loại transition
      fps = 30,
      outputName = `video_${Date.now()}.mp4`
    } = options;

    const outputPath = path.join(TEMP_DIR, outputName);

    // Calculate per-slide durations
    const slideDurations = slidePaths.map((_, i) => {
      if (durations && durations[i] !== undefined) return durations[i];
      return duration;
    });
    const totalDuration = slideDurations.reduce((sum, d) => sum + d, 0);

    console.log(`📐 Slide durations: [${slideDurations.join(', ')}] = ${totalDuration}s total`);

    // Create a concat file for ffmpeg
    const concatFilePath = path.join(TEMP_DIR, `concat_${Date.now()}.txt`);
    const concatContent = slidePaths.map((p, i) => {
      const absPath = path.resolve(p).replace(/\\/g, '/');
      return `file '${absPath}'\nduration ${slideDurations[i]}`;
    }).join('\n');
    // Add last file again (ffmpeg concat demuxer requirement)
    const lastPath = path.resolve(slidePaths[slidePaths.length - 1]).replace(/\\/g, '/');
    fs.writeFileSync(concatFilePath, concatContent + `\nfile '${lastPath}'`);

    return new Promise((resolve, reject) => {
      const cmd = ffmpeg()
        .input(concatFilePath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
          '-vf', `scale=1080:-2:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0a0a14,fps=${fps}`,
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-preset', 'medium',
          '-crf', '23',
          '-movflags', '+faststart',
          '-t', String(totalDuration)
        ])
        .output(outputPath)
        .on('start', (cmd) => {
          console.log('FFmpeg started:', cmd);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`Encoding: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          // Cleanup concat file
          try { fs.unlinkSync(concatFilePath); } catch (e) {}
          console.log('Video created:', outputPath);
          resolve(outputPath);
        })
        .on('error', (err) => {
          try { fs.unlinkSync(concatFilePath); } catch (e) {}
          console.error('FFmpeg error:', err.message);
          reject(err);
        });

      cmd.run();
    });
  }

  /**
   * Tạo video với fade transition giữa các slides
   */
  async createVideoWithTransitions(slidePaths, options = {}) {
    const {
      duration = 4,
      fadeDuration = 0.5,
      fps = 30,
      outputName = `video_fade_${Date.now()}.mp4`
    } = options;

    const outputPath = path.join(TEMP_DIR, outputName);
    const totalDuration = slidePaths.length * duration;

    // Build complex filter for xfade transitions
    if (slidePaths.length < 2) {
      return this.createVideoFromSlides(slidePaths, options);
    }

    let filterParts = [];
    let inputArgs = [];

    // Add inputs
    for (let i = 0; i < slidePaths.length; i++) {
      inputArgs.push('-loop', '1', '-t', String(duration), '-i', slidePaths[i].replace(/\\/g, '/'));
    }

    // Build xfade filter chain
    let prevLabel = '[0:v]';
    for (let i = 1; i < slidePaths.length; i++) {
      const offset = i * duration - fadeDuration * i;
      const outLabel = i < slidePaths.length - 1 ? `[v${i}]` : '[outv]';
      filterParts.push(
        `${prevLabel}[${i}:v]xfade=transition=fade:duration=${fadeDuration}:offset=${offset}${outLabel}`
      );
      prevLabel = outLabel.replace(']', '').replace('[', '') === 'outv' ? '[outv]' : `[v${i}]`;
    }

    const filterComplex = filterParts.join(';');

    return new Promise((resolve, reject) => {
      const cmd = ffmpeg();

      // Add all inputs
      for (let i = 0; i < slidePaths.length; i++) {
        cmd.input(slidePaths[i]).inputOptions(['-loop', '1', '-t', String(duration)]);
      }

      cmd
        .complexFilter(filterComplex, 'outv')
        .outputOptions([
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-preset', 'medium',
          '-crf', '23',
          '-movflags', '+faststart',
          '-s', '1080x1920'
        ])
        .output(outputPath)
        .on('end', () => {
          console.log('Video with transitions created:', outputPath);
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('FFmpeg transition error:', err.message);
          // Fallback to simple concat
          console.log('Falling back to simple concat...');
          this.createVideoFromSlides(slidePaths, { ...options, outputName })
            .then(resolve)
            .catch(reject);
        });

      cmd.run();
    });
  }

  /**
   * Lấy thông tin video
   */
  async getVideoInfo(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) return reject(err);
        const video = metadata.streams.find(s => s.codec_type === 'video');
        resolve({
          duration: metadata.format.duration,
          size: metadata.format.size,
          width: video ? video.width : 0,
          height: video ? video.height : 0,
          format: metadata.format.format_name
        });
      });
    });
  }
  /**
   * Ghép audio vào video (TTS voiceover)
   * @param {string} videoPath - Đường dẫn video gốc (không có audio hoặc có audio)
   * @param {string} audioPath - Đường dẫn audio cần ghép
   * @param {Object} options
   * @returns {string} Đường dẫn video output có audio
   */
  async mergeAudioToVideo(videoPath, audioPath, options = {}) {
    const {
      outputName = `video_tts_${Date.now()}.mp4`,
      replaceAudio = true // true = thay thế audio cũ, false = mix
    } = options;

    const outputPath = path.join(TEMP_DIR, outputName);

    console.log(`🔊 Merging audio into video...`);
    console.log(`   📹 Video: ${videoPath}`);
    console.log(`   🎵 Audio: ${audioPath}`);

    return new Promise((resolve, reject) => {
      const cmd = ffmpeg()
        .input(videoPath)
        .input(audioPath);

      if (replaceAudio) {
        cmd.outputOptions([
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-shortest',
          '-movflags', '+faststart'
        ]);
      } else {
        // Mix with existing audio
        cmd.outputOptions([
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=shortest',
          '-movflags', '+faststart'
        ]);
      }

      cmd
        .output(outputPath)
        .on('start', (cmdLine) => {
          console.log('FFmpeg merge started:', cmdLine);
        })
        .on('end', () => {
          console.log('✅ Video with audio created:', outputPath);
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('FFmpeg merge error:', err.message);
          reject(err);
        });

      cmd.run();
    });
  }
}

module.exports = new VideoCreator();
