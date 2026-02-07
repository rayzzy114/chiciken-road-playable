import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const devDir = path.join(__dirname, 'dev');
const releaseDir = path.join(__dirname, 'release');
const assetsDir = path.join(devDir, 'assets');
const cacheDir = path.join(assetsDir, '.release-cache');
const useImageCache = process.env.OLYMPUS_USE_IMAGE_CACHE === '1';
const htmlPath = path.join(devDir, 'index.html');
const cssPath = path.join(devDir, 'styles', 'main.css');
const manifestPath = path.join(devDir, 'scripts', 'manifest.js');
const gamePath = path.join(devDir, 'scripts', 'game.js');
const audioManagerPath = path.join(devDir, 'scripts', 'audio-manager.js');

if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir);
}

const mimeByExt = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg'
};

function toDataUri(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = mimeByExt[ext];
  if (!mime) return null;
  const data = fs.readFileSync(filePath).toString('base64');
  return `data:${mime};base64,${data}`;
}

function minifyCss(str) {
  return str.replace(/\s+/g, ' ').trim();
}

function minifyJs(str) {
  // IMPORTANT:
  // Do NOT collapse newlines into a single line, otherwise `//` comments will
  // comment-out the rest of the script and break runtime in release builds.
  // Keep newlines and only do light cleanup.
  return str
    .replace(/\r\n/g, '\n')
    // Strip block comments safely (line comments are kept to preserve semantics)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function minifyHtml(str) {
  // Keep doctype and structure intact; remove comments + collapse whitespace between tags
  return str
    .replace(/<!--[\s\S]*?-->/g, '')
    // Avoid producing a single gigantic line (some WebViews/Safari choke on it).
    // Keep tags separated by newlines while still trimming excess spaces.
    .replace(/>\s+</g, '>\n<')
    .split('\n')
    .map((l) => l.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function inlineManifest(manifestSrc, dataUriMap) {
  return manifestSrc.replace(/assets\/([A-Za-z0-9_\-./]+)(['"])/g, (full, name, quote) => {
    const key = `assets/${name}`.replace(/\\/g, '/');
    return dataUriMap[key] ? `${dataUriMap[key]}${quote}` : full;
  });
}

function inlineAssetPaths(src, dataUriMap) {
  return src.replace(/assets\/([A-Za-z0-9_\-./]+)(['"])/g, (full, name, quote) => {
    const key = `assets/${name}`.replace(/\\/g, '/');
    return dataUriMap[key] ? `${dataUriMap[key]}${quote}` : full;
  });
}

function collectReferencedAssets(...sources) {
  const used = new Set();
  const re = /assets\/([A-Za-z0-9_\-./]+)(?=['"])/g;
  for (const src of sources) {
    if (!src) continue;
    let m;
    while ((m = re.exec(src)) !== null) {
      used.add(`assets/${m[1]}`);
    }
  }
  return used;
}

function walkFiles(dir, baseDir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkFiles(abs, baseDir, out);
    } else {
      const rel = path.relative(baseDir, abs).replace(/\\/g, '/');
      out.push({ abs, rel });
    }
  }
  return out;
}

function build() {
  const htmlRaw = fs.readFileSync(htmlPath, 'utf8');
  const cssRaw = fs.readFileSync(cssPath, 'utf8');
  const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
  const audioManagerRaw = fs.readFileSync(audioManagerPath, 'utf8');
  const gameRaw = fs.readFileSync(gamePath, 'utf8');

  // Only inline assets that are actually referenced by the sources.
  const allow = collectReferencedAssets(htmlRaw, cssRaw, manifestRaw, audioManagerRaw, gameRaw);

  const dataUriMap = {};
  const assetFiles = walkFiles(assetsDir, assetsDir);
  assetFiles.forEach(({ abs, rel }) => {
    const key = `assets/${rel}`;
    if (!allow.has(key)) return;
    const uri = toDataUri(abs);
    if (uri) dataUriMap[key] = uri;
  });

  // Fallback: some legacy olympus assets live in template root, not in dev/assets.
  // Keep release robust by resolving missing references from known fallback roots.
  allow.forEach((key) => {
    if (dataUriMap[key]) return;
    const rel = key.replace(/^assets\//, '');
    const candidates = [
      path.join(__dirname, rel),
      path.join(devDir, rel)
    ];
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      const uri = toDataUri(candidate);
      if (!uri) continue;
      dataUriMap[key] = uri;
      break;
    }
  });

  // Cache-based WEBP replacement is opt-in.
  // Default behavior keeps original png/jpg/gif assets to maximize runtime compatibility.
  if (useImageCache && fs.existsSync(cacheDir)) {
    const cached = walkFiles(cacheDir, cacheDir);
    cached.forEach(({ abs, rel }) => {
      const uri = toDataUri(abs);
      if (!uri) return;
      // Map cache naming conventions to original asset paths
      // Images: background.webp replaces background jpg
      if (rel === 'background.webp') {
        const key = 'assets/bb16c47b-a4dc-48b5-9175-59a961b1122d.jpg';
        if (allow.has(key)) dataUriMap[key] = uri;
        return;
      }
      // Images: <name>.webp replaces <name>.png
      if (rel.endsWith('.webp') && !rel.startsWith('audio_') && rel !== 'background.webp') {
        const base = rel.slice(0, -'.webp'.length);
        // replace PNGs
        const pngKey = `assets/${base}.png`;
        if (allow.has(pngKey)) dataUriMap[pngKey] = uri;
        // replace GIFs (animated webp)
        const gifKey = `assets/${base}.gif`;
        if (allow.has(gifKey)) dataUriMap[gifKey] = uri;
        return;
      }
      // Audio: audio_<name>.ogg replaces assets/audio/<name>.mp3
      // NOTE:
      // We intentionally do NOT auto-replace MP3 with OGG in release builds.
      // Many ad WebViews (notably iOS/Safari) cannot decode OGG/Opus via WebAudio,
      // causing *all* audio to be silent. MP3 is the most compatible choice.
    });
  }

  const html = htmlRaw;
  const cssInline = minifyCss(cssRaw);
  const manifestInline = inlineManifest(manifestRaw, dataUriMap);
  const audioManagerInline = minifyJs(audioManagerRaw);
  const gameInline = minifyJs(inlineAssetPaths(gameRaw, dataUriMap));

  let out = html;
  // Use function replacers so `$` in inline payload is treated literally.
  out = out.replace(
    /<link rel="stylesheet"[^>]+>/i,
    () => `<style>${cssInline}</style>`
  );
  out = out.replace(
    /<script src="scripts\/audio-manager\.js"><\/script>/i,
    () => `<script>${audioManagerInline}</script>`
  );
  out = out.replace(
    /<script src="scripts\/manifest\.js"><\/script>/i,
    () => `<script>${manifestInline}</script>`
  );
  out = out.replace(
    /<script src="scripts\/game\.js"><\/script>/i,
    () => `<script>${gameInline}</script>`
  );

  // Release must be fully self-contained: strip any remote script tags.
  out = out.replace(/<script[^>]+src=["']https?:\/\/[^"']+["'][^>]*>\s*<\/script>/gi, '');

  out = minifyHtml(out);

  const releasePath = path.join(releaseDir, 'index.html');
  fs.writeFileSync(releasePath, out, 'utf8');
  const sizeKb = (fs.statSync(releasePath).size / 1024).toFixed(1);
  console.log(`release built -> release/index.html (${sizeKb} kb)`);
}

build();

