// Script to optimize assets before build
// Run with: node optimize-assets.js

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import path from 'path';

const assetsDir = './src/assets';
const tempDir = './temp_optimized';

console.log('🚀 Starting asset optimization...\n');

// Check if ImageMagick or ffmpeg is available
function checkCommand(cmd) {
  try {
    execSync(`${cmd} -version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const hasImageMagick = checkCommand('magick') || checkCommand('convert');
const hasFFmpeg = checkCommand('ffmpeg');

console.log(`ImageMagick: ${hasImageMagick ? '✅' : '❌'}`);
console.log(`FFmpeg: ${hasFFmpeg ? '✅' : '❌'}\n`);

if (!hasImageMagick && !hasFFmpeg) {
  console.log('⚠️  ImageMagick and FFmpeg not found. Please install:');
  console.log('   - ImageMagick: https://imagemagick.org/script/download.php');
  console.log('   - FFmpeg: https://ffmpeg.org/download.html');
  console.log('\n📝 Manual optimization instructions:');
  console.log('   1. background.jpg: Resize to 1080x1920, compress with TinyPNG or similar');
  console.log('   2. Audio files: Convert to mono, 32-48kbps using Audacity or online tools');
  process.exit(1);
}

async function optimizeImages() {
  if (!hasImageMagick) {
    console.log('⏭️  Skipping image optimization (ImageMagick not found)');
    return;
  }

  console.log('🖼️  Optimizing images...');
  const files = await readdir(assetsDir);
  const imageFiles = files.filter(f => /\.(png|jpg|jpeg)$/i.test(f));

  for (const file of imageFiles) {
    const inputPath = path.join(assetsDir, file);
    const outputPath = path.join(assetsDir, file.replace(/\.(jpg|jpeg)$/i, '.webp'));

    try {
      if (file === 'background.jpg') {
        // Special handling for background - resize to 1080x1920 and compress heavily
        console.log(`   📐 Resizing and compressing ${file}...`);
        execSync(`magick "${inputPath}" -resize 1080x1920! -quality 75 -strip "${inputPath}"`, { stdio: 'inherit' });
        // Try to convert to WebP
        try {
          execSync(`magick "${inputPath}" -quality 75 "${outputPath}"`, { stdio: 'ignore' });
          console.log(`   ✅ Created optimized WebP version`);
        } catch {
          console.log(`   ⚠️  WebP conversion failed, using PNG`);
        }
      } else {
        // Other images - compress but keep original size
        console.log(`   🗜️  Compressing ${file}...`);
        execSync(`magick "${inputPath}" -quality 85 -strip "${inputPath}"`, { stdio: 'ignore' });
      }
    } catch (error) {
      console.log(`   ❌ Failed to optimize ${file}: ${error.message}`);
    }
  }
}

async function optimizeAudio() {
  if (!hasFFmpeg) {
    console.log('⏭️  Skipping audio optimization (FFmpeg not found)');
    return;
  }

  console.log('\n🎵 Optimizing audio files...');
  const files = await readdir(assetsDir);
  const audioFiles = files.filter(f => /\.mp3$/i.test(f));

  for (const file of audioFiles) {
    const inputPath = path.join(assetsDir, file);
    const outputPath = path.join(tempDir, file);

    try {
      console.log(`   🎧 Optimizing ${file}...`);
      // Convert to mono, 32kbps for sound effects, 48kbps for music
      const bitrate = file.includes('bg_music') ? '48k' : '32k';
      execSync(
        `ffmpeg -i "${inputPath}" -ac 1 -ab ${bitrate} -ar 22050 -y "${outputPath}"`,
        { stdio: 'ignore' }
      );
      // Replace original
      execSync(`move "${outputPath}" "${inputPath}"`, { stdio: 'ignore', shell: true });
      console.log(`   ✅ Optimized ${file} (mono, ${bitrate})`);
    } catch (error) {
      console.log(`   ❌ Failed to optimize ${file}: ${error.message}`);
    }
  }
}

// Main
(async () => {
  try {
    await optimizeImages();
    await optimizeAudio();
    console.log('\n✅ Asset optimization complete!');
    console.log('📦 Run "npm run build" to create optimized single-file build.');
  } catch (error) {
    console.error('❌ Error during optimization:', error);
    process.exit(1);
  }
})();

