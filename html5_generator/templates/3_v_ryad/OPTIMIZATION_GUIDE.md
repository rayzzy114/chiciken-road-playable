# Asset Optimization Guide

## ✅ background.jpg is already optimized!

The `background.jpg` file is already optimized to ~300 KB. No further action needed.

## Quick Fix Instructions

### 1. background.jpg (Already optimized ✅)
- Current size: ~300 KB
- Format: JPG
- Resolution: 1080x1920
- Status: Optimized

### 2. Optimize Audio Files (saves ~200-300 KB)

**Using FFmpeg (if installed):**
```bash
# For sound effects (pop, cash, win)
ffmpeg -i src/assets/pop.mp3 -ac 1 -ab 32k -ar 22050 src/assets/pop_opt.mp3
ffmpeg -i src/assets/cash.mp3 -ac 1 -ab 32k -ar 22050 src/assets/cash_opt.mp3
ffmpeg -i src/assets/win.mp3 -ac 1 -ab 32k -ar 22050 src/assets/win_opt.mp3

# For background music (can use slightly higher bitrate)
ffmpeg -i src/assets/bg_music.mp3 -ac 1 -ab 48k -ar 22050 src/assets/bg_music_opt.mp3
```

**Using Audacity (Free):**
1. Open each MP3 file
2. Tracks → Mix → Mix and Render to New Track (to mono)
3. File → Export → Export as MP3
4. Set bitrate to 32 kbps (or 48 kbps for bg_music)
5. Set sample rate to 22050 Hz

**Online tool:**
- https://www.freeconvert.com/mp3-compressor
- Upload, set to mono, 32kbps, download

### 3. Optimize Other Images (optional, saves ~100-200 KB)

All PNG sprites can be compressed:
- Use TinyPNG or Squoosh
- Or run: `magick src/assets/*.png -quality 85 -strip src/assets/*.png`

## Expected Size Reduction

- background.jpg: **Already optimized to ~300 KB** ✅
- Audio files: **~430 KB → ~100-150 KB** (saves ~300 KB)
- Other images: **~1.5 MB → ~800 KB** (saves ~700 KB)

**Total reduction: ~7 MB → Target: <5 MB ✅**

## After Optimization

1. Run `npm run build` to rebuild
2. Check `dist/index.html` size - should be under 5 MB
3. Test the playable ad to ensure everything works

## Automated Script

If you have ImageMagick and FFmpeg installed, you can run:
```bash
node optimize-assets.js
```

This will automatically optimize all assets.

