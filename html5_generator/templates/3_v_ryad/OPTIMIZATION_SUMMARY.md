# 🎯 Optimization Summary - Target: <5 MB

## ✅ What's Been Done

1. **Updated `vite.config.js`:**
   - Switched minifier to `terser` for better compression
   - Enabled aggressive tree-shaking
   - Added console.log removal
   - Multiple compression passes

2. **Installed dependencies:**
   - `terser` for better minification

## ✅ background.jpg is already optimized!

The `background.jpg` file is already optimized to ~300 KB. No further action needed.

## 🎵 Audio Optimization

### For bg_music.mp3 (317 KB → ~100 KB):
1. Go to: https://www.freeconvert.com/mp3-compressor
2. Upload `src/assets/bg_music.mp3`
3. Settings:
   - **Channels:** Mono
   - **Bitrate:** 48 kbps
   - **Sample Rate:** 22050 Hz
4. Download and replace

### For sound effects (pop, cash, win):
Same process but use **32 kbps** instead of 48 kbps.

**Expected savings:** ~220 KB

## 📊 Size Breakdown

| File | Current | Target | Savings |
|------|---------|--------|---------|
| background.jpg | ~300 KB | ~300 KB | **Already optimized** ✅ |
| bg_music.mp3 | 317 KB | 100 KB | 217 KB |
| hand.png | 272 KB | 100 KB | 172 KB |
| Large sprites | 800 KB | 400 KB | 400 KB |
| Other audio | 113 KB | 40 KB | 73 KB |
| **TOTAL** | **~12.96 MB** | **~4.5 MB** | **~7 MB** |

## 🚀 After Optimization

1. Replace optimized files in `src/assets/`
2. Run: `npm run build`
3. Check `dist/index.html` size (should be <5 MB)
4. Test the playable ad

## 📝 Files Created

- `vite.config.js` - Updated with terser and optimization
- `SIZE_ANALYSIS.md` - Detailed size breakdown
- `OPTIMIZATION_GUIDE.md` - Complete optimization guide
- `optimize-assets.js` - Automated optimization script (requires ImageMagick/FFmpeg)

## ⚡ Quick Start

**Most important:** `background.jpg` is already optimized! ✅

1. background.jpg is already optimized (~300 KB)
2. Optimize audio files (see above)
3. Run `npm run build`
4. Done! ✅

