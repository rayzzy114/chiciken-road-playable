import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { fileURLToPath } from 'url';
const execAsync = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// We are in src/, so root is one level up
const ROOT_DIR = path.resolve(__dirname, '..');
const PREVIEWS_DIR = path.join(ROOT_DIR, 'previews');
const TEMP_DIR = path.join(ROOT_DIR, 'temp');
const DEPS_CACHE_ROOT = path.join(TEMP_DIR, "_deps_cache");
const BUILD_TIMEOUT_MS = 120_000;
const BUILD_MAX_BUFFER_BYTES = 20 * 1024 * 1024;
const DEPS_INSTALL_TIMEOUT_MS = 300_000;
const MAX_BUILD_QUEUE_SIZE = 20;
const ASSET_PATH_REGEX = /(?:\.\/|\/)?assets\/[^"'`()<>]+?\.[a-zA-Z0-9]+(?:\?[a-zA-Z0-9=%&._-]+)?(?:#[a-zA-Z0-9=%&._-]+)?/g;
const RAILROAD_THEME_REQUIRED_ASSETS = {
    chicken_farm: [
        "assets/ground_tile.webp",
        "assets/railroad.webp",
        "assets/platform.webp",
        "assets/idle.gif",
        "assets/death.gif",
        "assets/train.webp",
        "assets/coin_small.webp",
        "assets/scroll_body.webp",
        "assets/audio/main_theme.ogg",
        "assets/audio/move.ogg",
        "assets/audio/pn.ogg",
        "assets/audio/big_win.ogg",
    ],
    cyber_city: [
        "assets/cyber/ground.webp",
        "assets/cyber/rail.webp",
        "assets/cyber/platform.webp",
        "assets/cyber/robot_idle.png",
        "assets/cyber/robot_jump.png",
        "assets/cyber/explosion.png",
        "assets/cyber/car.webp",
        "assets/cyber/chip.webp",
        "assets/cyber/holo_panel.webp",
        "assets/audio/cyber_theme.ogg",
        "assets/audio/laser_jump.ogg",
        "assets/audio/glitch.ogg",
        "assets/audio/cyber_win.ogg",
    ],
};
const TEMPLATE_BY_GAME = {
    railroad: {
        templateDirName: "railroad",
        buildCommand: "npm run build",
        requiredBins: ["tsc", "vite"],
        outputHtmlRelativePath: path.join("dist", "index.html"),
        configMode: "railroad",
    },
    olympus: {
        templateDirName: "gate_of_olympus",
        buildCommand: "node build-release.js",
        requiredBins: [],
        outputHtmlRelativePath: path.join("release", "index.html"),
        configMode: "runtime",
    },
    matching: {
        templateDirName: "matching",
        buildCommand: "npm run build",
        requiredBins: ["vite"],
        outputHtmlRelativePath: path.join("dist", "index.html"),
        configMode: "runtime",
    },
    match3: {
        templateDirName: "3_v_ryad",
        buildCommand: "npm run build",
        requiredBins: ["vite"],
        outputHtmlRelativePath: path.join("dist", "index.html"),
        configMode: "runtime",
    },
};
const TEMPLATE_RESOLUTION_CHECKS = {
    railroad: [
        {
            relativePath: path.join("src", "Game.ts"),
            patterns: [
                { regex: /width:\s*1080\b/, description: "Pixi width is 1080" },
                { regex: /height:\s*1920\b/, description: "Pixi height is 1920" },
            ],
        },
    ],
    matching: [
        {
            relativePath: path.join("src", "config.js"),
            patterns: [
                { regex: /width:\s*1080\b/, description: "Design width is 1080" },
                { regex: /height:\s*1920\b/, description: "Design height is 1920" },
            ],
        },
    ],
    "3_v_ryad": [
        {
            relativePath: path.join("src", "main.js"),
            patterns: [
                { regex: /const\s+DESIGN_W\s*=\s*1080\b/, description: "DESIGN_W is 1080" },
                { regex: /const\s+DESIGN_H\s*=\s*1920\b/, description: "DESIGN_H is 1920" },
            ],
        },
    ],
    gate_of_olympus: [
        {
            relativePath: path.join("dev", "scripts", "game.js"),
            patterns: [
                { regex: /const\s+DESIGN_WIDTH\s*=\s*1080\b/, description: "DESIGN_WIDTH is 1080" },
                { regex: /const\s+DESIGN_HEIGHT\s*=\s*1920\b/, description: "DESIGN_HEIGHT is 1920" },
            ],
        },
        {
            relativePath: path.join("dev", "styles", "main.css"),
            patterns: [
                { regex: /--design-width:\s*1080\b/, description: "CSS --design-width is 1080" },
                { regex: /--design-height:\s*1920\b/, description: "CSS --design-height is 1920" },
            ],
        },
    ],
};
const depsCachePromises = new Map();
function isBuildTimeoutError(error) {
    if (!error || typeof error !== "object")
        return false;
    const execError = error;
    const message = String(execError.message ?? "").toLowerCase();
    if (message.includes("timed out"))
        return true;
    return execError.killed === true && execError.signal === "SIGTERM";
}
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".png")
        return "image/png";
    if (ext === ".jpg" || ext === ".jpeg")
        return "image/jpeg";
    if (ext === ".webp")
        return "image/webp";
    if (ext === ".gif")
        return "image/gif";
    if (ext === ".svg")
        return "image/svg+xml";
    if (ext === ".mp3")
        return "audio/mpeg";
    if (ext === ".ogg")
        return "audio/ogg";
    if (ext === ".wav")
        return "audio/wav";
    if (ext === ".m4a")
        return "audio/mp4";
    if (ext === ".webm")
        return "video/webm";
    if (ext === ".json")
        return "application/json";
    if (ext === ".woff")
        return "font/woff";
    if (ext === ".woff2")
        return "font/woff2";
    if (ext === ".ttf")
        return "font/ttf";
    return null;
}
function shouldReplaceWithInlinePlaceholder(normalizedAssetPath) {
    return (normalizedAssetPath.startsWith("assets/cyber/") ||
        normalizedAssetPath.startsWith("assets/audio/cyber_") ||
        normalizedAssetPath === "assets/audio/laser_jump.ogg" ||
        normalizedAssetPath === "assets/audio/glitch.ogg");
}
function buildEmptyDataUri(assetPath) {
    const mime = getMimeType(assetPath) ?? "application/octet-stream";
    return `data:${mime};base64,`;
}
async function inlineLocalAssetsInHtml(htmlPath, workDir) {
    const html = await fs.readFile(htmlPath, "utf-8");
    const refs = html.match(ASSET_PATH_REGEX);
    if (!refs || refs.length === 0)
        return;
    const uniqueRefs = Array.from(new Set(refs));
    let updated = html;
    let replacedCount = 0;
    const unresolvedRefs = [];
    for (const ref of uniqueRefs) {
        const cleanRef = ref.split("#")[0].split("?")[0];
        const normalized = cleanRef.replace(/^\.?\//, "");
        if (!normalized.startsWith("assets/") || normalized.includes(".."))
            continue;
        const assetPath = path.join(workDir, normalized);
        const assetExists = await fs
            .access(assetPath, fsConstants.F_OK)
            .then(() => true)
            .catch(() => false);
        if (!assetExists) {
            if (shouldReplaceWithInlinePlaceholder(normalized)) {
                updated = updated.split(ref).join(buildEmptyDataUri(normalized));
                replacedCount++;
                continue;
            }
            unresolvedRefs.push(ref);
            continue;
        }
        const mimeType = getMimeType(assetPath);
        if (!mimeType) {
            if (shouldReplaceWithInlinePlaceholder(normalized)) {
                updated = updated.split(ref).join(buildEmptyDataUri(normalized));
                replacedCount++;
                continue;
            }
            unresolvedRefs.push(ref);
            continue;
        }
        const payload = await fs.readFile(assetPath);
        const dataUri = `data:${mimeType};base64,${payload.toString("base64")}`;
        if (updated.includes(ref)) {
            updated = updated.split(ref).join(dataUri);
            replacedCount++;
        }
    }
    if (replacedCount > 0 && updated !== html) {
        await fs.writeFile(htmlPath, updated, "utf-8");
        console.log(`[Builder] Inlined ${replacedCount} local asset reference(s) into ${path.basename(htmlPath)}.`);
    }
    if (unresolvedRefs.length > 0) {
        const sample = Array.from(new Set(unresolvedRefs)).slice(0, 5).join(", ");
        console.warn(`[Builder] Unresolved asset references (${unresolvedRefs.length}): ${sample}`);
    }
}
function resolveTemplateConfig(game) {
    if (game && TEMPLATE_BY_GAME[game])
        return TEMPLATE_BY_GAME[game];
    return TEMPLATE_BY_GAME.railroad;
}
async function validateRailroadThemeAssets(workDir, themeId) {
    const selectedTheme = themeId && RAILROAD_THEME_REQUIRED_ASSETS[themeId]
        ? themeId
        : "chicken_farm";
    const requiredAssets = RAILROAD_THEME_REQUIRED_ASSETS[selectedTheme];
    const missingAssets = [];
    for (const relPath of requiredAssets) {
        const normalized = relPath.replace(/^\.?\//, "");
        const absolutePath = path.join(workDir, normalized);
        const exists = await fs
            .access(absolutePath, fsConstants.F_OK)
            .then(() => true)
            .catch(() => false);
        if (!exists)
            missingAssets.push(relPath);
    }
    if (missingAssets.length === 0)
        return;
    const sample = missingAssets.slice(0, 8).join(", ");
    const suffix = missingAssets.length > 8 ? ` (+${missingAssets.length - 8} more)` : "";
    throw new Error(`[Builder] Missing required assets for theme ${selectedTheme}: ${sample}${suffix}`);
}
async function hasAllDevDeps(nodeModulesDir, packageJsonPath) {
    try {
        const raw = await fs.readFile(packageJsonPath, "utf-8");
        const pkg = JSON.parse(raw);
        const devDeps = Object.keys(pkg.devDependencies ?? {});
        if (devDeps.length === 0)
            return true;
        for (const dep of devDeps) {
            const depPath = path.join(nodeModulesDir, ...dep.split("/"));
            const depManifest = path.join(depPath, "package.json");
            try {
                await fs.access(depManifest, fsConstants.F_OK);
            }
            catch {
                return false;
            }
        }
        return true;
    }
    catch {
        return false;
    }
}
async function hasBin(nodeModulesDir, bin) {
    const candidates = [bin, `${bin}.cmd`, `${bin}.ps1`, `${bin}.exe`];
    for (const candidate of candidates) {
        const binPath = path.join(nodeModulesDir, ".bin", candidate);
        try {
            await fs.access(binPath, fsConstants.F_OK);
            return true;
        }
        catch { }
    }
    return false;
}
async function hasBuildBins(nodeModulesDir, bins) {
    try {
        for (const bin of bins) {
            if (!(await hasBin(nodeModulesDir, bin))) {
                return false;
            }
        }
        return true;
    }
    catch {
        return false;
    }
}
async function ensureDepsCache(templateDir, requiredBins) {
    const cacheKey = `${path.basename(templateDir)}__${requiredBins.join("_") || "none"}`;
    const existingPromise = depsCachePromises.get(cacheKey);
    if (existingPromise)
        return existingPromise;
    const createdPromise = (async () => {
        const cacheDir = path.join(DEPS_CACHE_ROOT, cacheKey);
        await fs.mkdir(cacheDir, { recursive: true });
        const cachePackageJson = path.join(cacheDir, "package.json");
        const templatePackageJson = path.join(templateDir, "package.json");
        const templatePkg = await fs.readFile(templatePackageJson, "utf-8");
        await fs.writeFile(cachePackageJson, templatePkg, "utf-8");
        const cacheNodeModules = path.join(cacheDir, "node_modules");
        let needsInstall = true;
        try {
            await fs.access(cacheNodeModules, fsConstants.F_OK);
            needsInstall = false;
        }
        catch { }
        if (!needsInstall) {
            const devDepsOk = await hasAllDevDeps(cacheNodeModules, cachePackageJson);
            const binsOk = await hasBuildBins(cacheNodeModules, requiredBins);
            if (!devDepsOk || !binsOk)
                needsInstall = true;
        }
        if (needsInstall) {
            console.log(`[Builder] Installing dependency cache for ${path.basename(templateDir)}...`);
            await execAsync(`npm install --no-audit --no-fund --include=dev`, {
                cwd: cacheDir,
                timeout: DEPS_INSTALL_TIMEOUT_MS,
                maxBuffer: BUILD_MAX_BUFFER_BYTES,
            });
        }
        return cacheNodeModules;
    })();
    depsCachePromises.set(cacheKey, createdPromise);
    return createdPromise;
}
// Build Queue Configuration
const MAX_CONCURRENT_BUILDS = 2;
let activeBuilds = 0;
const buildQueue = [];
/**
 * Cleans up the entire temp directory on startup.
 */
export async function cleanupTemp() {
    try {
        await fs.mkdir(TEMP_DIR, { recursive: true });
        const entries = await fs.readdir(TEMP_DIR, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === path.basename(DEPS_CACHE_ROOT))
                continue;
            const targetPath = path.join(TEMP_DIR, entry.name);
            await fs.rm(targetPath, { recursive: true, force: true });
        }
        await fs.mkdir(TEMP_DIR, { recursive: true });
    }
    catch (e) {
        console.error("[Builder] Cleanup error:", e);
    }
}
// Ensure previews folder exists
(async () => {
    try {
        await fs.mkdir(PREVIEWS_DIR, { recursive: true });
    }
    catch (e) { }
})();
function toRuntimeConfig(config) {
    const runtimeConfig = {
        game: config.game ?? "railroad",
        themeId: config.themeId ?? "default",
        language: config.language ?? "en",
        currency: config.currency ?? "$",
        startingBalance: config.startingBalance ?? 1000,
        isWatermarked: config.isWatermarked,
    };
    const extra = config;
    if (typeof extra.clickUrl === "string" && extra.clickUrl.trim()) {
        runtimeConfig.clickUrl = extra.clickUrl;
    }
    if (typeof extra.targetBalance === "number" && Number.isFinite(extra.targetBalance)) {
        runtimeConfig.targetBalance = extra.targetBalance;
    }
    return runtimeConfig;
}
async function injectRuntimeConfig(htmlPath, runtimeConfig) {
    const html = await fs.readFile(htmlPath, "utf-8");
    const json = JSON.stringify(runtimeConfig)
        .replaceAll("<", "\\u003c")
        .replaceAll("-->", "--\\>");
    const script = `<script>(function(){window.__USER_CONFIG__=${json};if(window.__USER_CONFIG__&&typeof window.__USER_CONFIG__.clickUrl==="string"){window.STORE_URL=window.__USER_CONFIG__.clickUrl;}window.__PLAYABLE_DIMENSIONS__={width:1080,height:1920};var OVERLAY_ID="builder-preview-watermark";var STYLE_ID="builder-preview-watermark-style";function ensureStyle(){if(document.getElementById(STYLE_ID))return;var style=document.createElement("style");style.id=STYLE_ID;style.textContent="#"+OVERLAY_ID+"{position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:grid;place-items:center;font:900 42px/1.1 Arial,sans-serif;color:rgba(255,0,0,.28);text-transform:uppercase;letter-spacing:2px;transform:rotate(-24deg);white-space:pre;text-align:center;}";document.head.appendChild(style);}function removeWatermarks(){["watermark","watermark2","watermark3","watermark-overlay",OVERLAY_ID].forEach(function(id){var el=document.getElementById(id);if(el&&el.parentNode){el.parentNode.removeChild(el);}});document.querySelectorAll(".watermark").forEach(function(el){if(el&&el.parentNode){el.parentNode.removeChild(el);}});}function applyPreviewState(){var cfg=window.__USER_CONFIG__||{};if(!cfg.isWatermarked){removeWatermarks();return;}var hasNative=!!(document.getElementById("watermark-overlay")||document.getElementById("watermark")||document.querySelector(".watermark"));if(hasNative||document.getElementById(OVERLAY_ID))return;ensureStyle();var overlay=document.createElement("div");overlay.id=OVERLAY_ID;overlay.textContent="PREVIEW MODE\\nPURCHASE TO UNLOCK";document.body.appendChild(overlay);}if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",applyPreviewState,{once:true});}else{applyPreviewState();}})();</script>`;
    const withConfig = html.includes("</head>")
        ? html.replace("</head>", `${script}</head>`)
        : `${script}\n${html}`;
    await fs.writeFile(htmlPath, withConfig, "utf-8");
}
async function validateTemplateResolutionContract(templateConfig, workDir) {
    const checks = TEMPLATE_RESOLUTION_CHECKS[templateConfig.templateDirName];
    if (!checks || checks.length === 0)
        return;
    for (const check of checks) {
        const checkPath = path.join(workDir, check.relativePath);
        let content = "";
        try {
            content = await fs.readFile(checkPath, "utf-8");
        }
        catch {
            throw new Error(`[Builder] Resolution contract file is missing: ${check.relativePath}`);
        }
        for (const rule of check.patterns) {
            if (!rule.regex.test(content)) {
                throw new Error(`[Builder] Resolution contract failed for ${templateConfig.templateDirName} ` +
                    `(${check.relativePath}): ${rule.description}`);
            }
        }
    }
}
function buildOutputFilename(order) {
    const isPreview = order.config.isWatermarked;
    if (isPreview) {
        return `PREVIEW_${order.id}.html`;
    }
    const game = (order.config.game ?? "railroad").replace(/[^a-zA-Z0-9_-]/g, "");
    const theme = (order.config.themeId ?? "default").replace(/[^a-zA-Z0-9_-]/g, "");
    const language = (order.config.language ?? "en").toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    const safeCurrency = (order.config.currency ?? "$").replace(/[^a-zA-Z0-9]/g, "");
    return `${game}_${theme}_${language}_${safeCurrency}.html`;
}
async function injectTemplateConfig(templateConfig, workDir, config) {
    if (templateConfig.configMode !== "railroad")
        return;
    const configPath = path.join(workDir, "src", "UserConfig.json");
    const userConfig = {
        language: config.language ?? "en",
        currency: config.currency ?? "$",
        startingBalance: config.startingBalance ?? 1000,
        defaultBet: 50,
        minBet: 10,
        maxBet: 1000,
        themeId: config.themeId ?? "chicken_farm",
        isWatermarked: config.isWatermarked,
    };
    await fs.writeFile(configPath, JSON.stringify(userConfig, null, 2), "utf-8");
}
async function ensureWorkDependencies(templateConfig, templateDir, workDir) {
    const templatePackageJson = path.join(templateDir, "package.json");
    const hasPackageJson = await fs
        .access(templatePackageJson, fsConstants.F_OK)
        .then(() => true)
        .catch(() => false);
    if (!hasPackageJson)
        return;
    const templateNodeModules = path.join(templateDir, "node_modules");
    const workNodeModules = path.join(workDir, "node_modules");
    const hasTemplateDeps = await fs
        .access(templateNodeModules, fsConstants.F_OK)
        .then(() => true)
        .catch(() => false);
    const canReuseTemplateDeps = hasTemplateDeps
        ? (await hasAllDevDeps(templateNodeModules, templatePackageJson)) &&
            (await hasBuildBins(templateNodeModules, templateConfig.requiredBins))
        : false;
    let linkedNodeModules = false;
    if (canReuseTemplateDeps) {
        try {
            await fs.symlink(templateNodeModules, workNodeModules, "dir");
            linkedNodeModules = true;
        }
        catch {
            await fs.cp(templateNodeModules, workNodeModules, { recursive: true });
            linkedNodeModules = true;
        }
    }
    if (!linkedNodeModules) {
        const cacheNodeModules = await ensureDepsCache(templateDir, templateConfig.requiredBins);
        try {
            await fs.symlink(cacheNodeModules, workNodeModules, "dir");
        }
        catch {
            await fs.cp(cacheNodeModules, workNodeModules, { recursive: true });
        }
    }
    const nodeModulesPath = path.join(workDir, "node_modules");
    const devDepsOk = await hasAllDevDeps(nodeModulesPath, path.join(workDir, "package.json"));
    const binsOk = await hasBuildBins(nodeModulesPath, templateConfig.requiredBins);
    if (!devDepsOk || !binsOk) {
        throw new Error(`[Builder] Missing build dependencies in work dir for ${templateConfig.templateDirName}. ` +
            `Runtime npm install is disabled; warm dependency cache before serving traffic.`);
    }
}
/**
 * Internal worker that performs the actual build.
 */
async function performBuild(order) {
    const isPreview = order.config.isWatermarked;
    const modeLabel = isPreview ? "PREVIEW" : "FINAL";
    console.log(`[Builder] [Job ${order.id}] Processing ${modeLabel}...`);
    const templateConfig = resolveTemplateConfig(order.config.game);
    const templateDir = path.join(ROOT_DIR, "templates", templateConfig.templateDirName);
    if (process.env.BUILDER_FAST_TEST === "1") {
        const filename = buildOutputFilename(order);
        const finalPath = path.join(PREVIEWS_DIR, filename);
        const payload = toRuntimeConfig(order.config);
        await fs.mkdir(PREVIEWS_DIR, { recursive: true });
        await fs.writeFile(finalPath, `<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>`, "utf-8");
        await injectRuntimeConfig(finalPath, payload);
        return finalPath;
    }
    // 1. Create Temp Work Directory
    const workDir = path.join(TEMP_DIR, order.id);
    try {
        await fs.mkdir(workDir, { recursive: true });
        await fs.access(templateDir, fsConstants.F_OK);
        // 2. Copy Template (skip node_modules to keep builds fast)
        await fs.cp(templateDir, workDir, {
            recursive: true,
            filter: (src) => !src.includes(`${path.sep}node_modules`)
        });
        // 3. Link dependencies when template has package.json
        await ensureWorkDependencies(templateConfig, templateDir, workDir);
        // 4. Inject template-specific config
        await injectTemplateConfig(templateConfig, workDir, order.config);
        await validateTemplateResolutionContract(templateConfig, workDir);
        if (templateConfig.configMode === "railroad") {
            await validateRailroadThemeAssets(workDir, order.config.themeId);
        }
        // 5. Build
        if (templateConfig.buildCommand) {
            console.log(`[Builder] [Job ${order.id}] Building ${templateConfig.templateDirName}...`);
            await execAsync(templateConfig.buildCommand, {
                cwd: workDir,
                timeout: BUILD_TIMEOUT_MS,
                maxBuffer: BUILD_MAX_BUFFER_BYTES,
            });
        }
        // 6. Move Result
        const distPath = path.join(workDir, templateConfig.outputHtmlRelativePath);
        const filename = buildOutputFilename(order);
        const finalPath = path.join(PREVIEWS_DIR, filename);
        await fs.access(distPath, fsConstants.F_OK);
        await inlineLocalAssetsInHtml(distPath, workDir);
        await fs.copyFile(distPath, finalPath);
        await injectRuntimeConfig(finalPath, toRuntimeConfig(order.config));
        return finalPath;
    }
    catch (e) {
        if (isBuildTimeoutError(e)) {
            console.error(`[Builder] [Job ${order.id}] BUILD_TIMEOUT after ${BUILD_TIMEOUT_MS}ms`);
        }
        console.error(`[Builder] [Job ${order.id}] Failed:`, e);
        return null;
    }
    finally {
        // Always attempt cleanup to avoid orphaned temp dirs
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => { });
    }
}
/**
 * Entry point for building playables with concurrency control.
 */
export async function generatePlayable(order) {
    if (activeBuilds >= MAX_CONCURRENT_BUILDS) {
        if (buildQueue.length >= MAX_BUILD_QUEUE_SIZE) {
            console.error(`[Builder] Queue overflow: ${buildQueue.length} waiting. Rejecting job ${order.id}.`);
            return null;
        }
        console.log(`[Builder] Queueing job ${order.id}... (${buildQueue.length} in queue)`);
        await new Promise(resolve => buildQueue.push(resolve));
    }
    activeBuilds++;
    try {
        return await performBuild(order);
    }
    finally {
        activeBuilds--;
        const next = buildQueue.shift();
        if (next)
            next();
    }
}
