"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupTemp = cleanupTemp;
exports.generatePlayable = generatePlayable;
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const util_1 = __importDefault(require("util"));
const execAsync = util_1.default.promisify(child_process_1.exec);
// Detect if we are in 'dist' or root to resolve paths correctly
const isDist = __dirname.endsWith('dist');
const ROOT_DIR = isDist ? path_1.default.resolve(__dirname, '..') : __dirname;
const TEMPLATE_DIR = path_1.default.join(ROOT_DIR, 'templates', 'railroad');
const PREVIEWS_DIR = path_1.default.join(ROOT_DIR, 'previews');
const TEMP_DIR = path_1.default.join(ROOT_DIR, 'temp');
const DEPS_CACHE_DIR = path_1.default.join(TEMP_DIR, "_deps_cache");
let depsCachePromise = null;
async function hasAllDevDeps(nodeModulesDir, packageJsonPath) {
    try {
        const raw = await promises_1.default.readFile(packageJsonPath, "utf-8");
        const pkg = JSON.parse(raw);
        const devDeps = Object.keys(pkg.devDependencies ?? {});
        if (devDeps.length === 0)
            return true;
        for (const dep of devDeps) {
            const depPath = path_1.default.join(nodeModulesDir, ...dep.split("/"));
            const depManifest = path_1.default.join(depPath, "package.json");
            try {
                await promises_1.default.access(depManifest, fs_1.constants.F_OK);
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
async function hasBuildBins(nodeModulesDir, bins) {
    try {
        for (const bin of bins) {
            const binPath = path_1.default.join(nodeModulesDir, ".bin", bin);
            await promises_1.default.access(binPath, fs_1.constants.F_OK);
        }
        return true;
    }
    catch {
        return false;
    }
}
async function ensureDepsCache() {
    if (depsCachePromise)
        return depsCachePromise;
    depsCachePromise = (async () => {
        await promises_1.default.mkdir(DEPS_CACHE_DIR, { recursive: true });
        const cachePackageJson = path_1.default.join(DEPS_CACHE_DIR, "package.json");
        const templatePackageJson = path_1.default.join(TEMPLATE_DIR, "package.json");
        const templatePkg = await promises_1.default.readFile(templatePackageJson, "utf-8");
        await promises_1.default.writeFile(cachePackageJson, templatePkg, "utf-8");
        const cacheNodeModules = path_1.default.join(DEPS_CACHE_DIR, "node_modules");
        let needsInstall = true;
        try {
            await promises_1.default.access(cacheNodeModules, fs_1.constants.F_OK);
            needsInstall = false;
        }
        catch { }
        if (!needsInstall) {
            const devDepsOk = await hasAllDevDeps(cacheNodeModules, cachePackageJson);
            const binsOk = await hasBuildBins(cacheNodeModules, ["tsc", "vite"]);
            if (!devDepsOk || !binsOk)
                needsInstall = true;
        }
        if (needsInstall) {
            console.log("[Builder] Installing dependency cache...");
            await execAsync(`npm install --no-audit --no-fund --include=dev`, { cwd: DEPS_CACHE_DIR });
        }
        return cacheNodeModules;
    })();
    return depsCachePromise;
}
// Build Queue Configuration
const MAX_CONCURRENT_BUILDS = 2;
let activeBuilds = 0;
const buildQueue = [];
/**
 * Cleans up the entire temp directory on startup.
 */
async function cleanupTemp() {
    try {
        if (await promises_1.default.access(TEMP_DIR).then(() => true).catch(() => false)) {
            console.log(`[Builder] Cleaning up old temp files in ${TEMP_DIR}...`);
            await promises_1.default.rm(TEMP_DIR, { recursive: true, force: true });
        }
        await promises_1.default.mkdir(TEMP_DIR, { recursive: true });
    }
    catch (e) {
        console.error("[Builder] Cleanup error:", e);
    }
}
// Ensure previews folder exists
(async () => {
    try {
        await promises_1.default.mkdir(PREVIEWS_DIR, { recursive: true });
    }
    catch (e) { }
})();
/**
 * Internal worker that performs the actual build.
 */
async function performBuild(order) {
    const isPreview = order.config.isWatermarked;
    const modeLabel = isPreview ? "PREVIEW" : "FINAL";
    console.log(`[Builder] [Job ${order.id}] Processing ${modeLabel}...`);
    if (process.env.BUILDER_FAST_TEST === "1") {
        const safeCurrency = (order.config.currency || "$").replace(/[^a-zA-Z0-9]/g, "");
        const filename = isPreview
            ? `PREVIEW_${order.id}.html`
            : `Railroad_${order.config.themeId}_${(order.config.language || "en").toUpperCase()}_${safeCurrency}.html`;
        const finalPath = path_1.default.join(PREVIEWS_DIR, filename);
        const payload = {
            language: order.config.language || "en",
            currency: order.config.currency || "$",
            startingBalance: order.config.startingBalance || 1000,
            themeId: order.config.themeId || "chicken_farm",
            isWatermarked: order.config.isWatermarked
        };
        await promises_1.default.mkdir(PREVIEWS_DIR, { recursive: true });
        await promises_1.default.writeFile(finalPath, `<!doctype html><html><head><meta charset="utf-8"></head><body><script>window.__USER_CONFIG__=${JSON.stringify(payload)}</script></body></html>`, "utf-8");
        return finalPath;
    }
    // 1. Create Temp Work Directory
    const workDir = path_1.default.join(TEMP_DIR, order.id);
    try {
        await promises_1.default.mkdir(workDir, { recursive: true });
        // 2. Copy Template (skip node_modules to keep builds fast)
        await promises_1.default.cp(TEMPLATE_DIR, workDir, {
            recursive: true,
            filter: (src) => !src.includes(`${path_1.default.sep}node_modules`)
        });
        // If template deps are already installed, reuse them via symlink to skip install
        const templateNodeModules = path_1.default.join(TEMPLATE_DIR, "node_modules");
        const workNodeModules = path_1.default.join(workDir, "node_modules");
        const templatePackageJson = path_1.default.join(TEMPLATE_DIR, "package.json");
        const hasTemplateDeps = await promises_1.default
            .access(templateNodeModules, fs_1.constants.F_OK)
            .then(() => true)
            .catch(() => false);
        const canReuseTemplateDeps = hasTemplateDeps
            ? (await hasAllDevDeps(templateNodeModules, templatePackageJson)) &&
                (await hasBuildBins(templateNodeModules, ["tsc", "vite"]))
            : false;
        let linkedNodeModules = false;
        if (canReuseTemplateDeps) {
            try {
                await promises_1.default.symlink(templateNodeModules, workNodeModules, "dir");
                linkedNodeModules = true;
            }
            catch {
                // Fallback: copy if symlink isn't permitted
                await promises_1.default.cp(templateNodeModules, workNodeModules, { recursive: true });
                linkedNodeModules = true;
            }
        }
        if (!linkedNodeModules) {
            const cacheNodeModules = await ensureDepsCache();
            try {
                await promises_1.default.symlink(cacheNodeModules, workNodeModules, "dir");
            }
            catch {
                await promises_1.default.cp(cacheNodeModules, workNodeModules, { recursive: true });
            }
        }
        // 3. Inject Config (via JSON)
        const configPath = path_1.default.join(workDir, 'src', 'UserConfig.json');
        const userConfig = {
            language: order.config.language || 'en',
            currency: order.config.currency || '$',
            startingBalance: order.config.startingBalance || 1000,
            defaultBet: 50,
            minBet: 10,
            maxBet: 1000,
            themeId: order.config.themeId || 'chicken_farm',
            isWatermarked: order.config.isWatermarked
        };
        await promises_1.default.writeFile(configPath, JSON.stringify(userConfig, null, 2), 'utf-8');
        // 4. Build
        const nodeModulesPath = path_1.default.join(workDir, 'node_modules');
        let needsInstall = true;
        try {
            await promises_1.default.access(nodeModulesPath, fs_1.constants.F_OK);
            needsInstall = false;
        }
        catch { }
        if (!needsInstall) {
            const devDepsOk = await hasAllDevDeps(nodeModulesPath, path_1.default.join(workDir, "package.json"));
            const binsOk = await hasBuildBins(nodeModulesPath, ["tsc", "vite"]);
            if (!devDepsOk || !binsOk)
                needsInstall = true;
        }
        if (needsInstall) {
            console.log(`[Builder] [Job ${order.id}] Installing dependencies...`);
            await execAsync(`npm install --no-audit --no-fund --include=dev`, { cwd: workDir });
        }
        console.log(`[Builder] [Job ${order.id}] Compiling...`);
        await execAsync(`npm run build`, { cwd: workDir });
        // 5. Move Result
        const distPath = path_1.default.join(workDir, 'dist', 'index.html');
        const safeCurrency = (order.config.currency || '$').replace(/[^a-zA-Z0-9]/g, '');
        const filename = isPreview
            ? `PREVIEW_${order.id}.html`
            : `Railroad_${order.config.themeId}_${(order.config.language || 'en').toUpperCase()}_${safeCurrency}.html`;
        const finalPath = path_1.default.join(PREVIEWS_DIR, filename);
        await promises_1.default.access(distPath, fs_1.constants.F_OK);
        await promises_1.default.copyFile(distPath, finalPath);
        return finalPath;
    }
    catch (e) {
        console.error(`[Builder] [Job ${order.id}] Failed:`, e);
        return null;
    }
    finally {
        // Always attempt cleanup to avoid orphaned temp dirs
        await promises_1.default.rm(workDir, { recursive: true, force: true }).catch(() => { });
    }
}
/**
 * Entry point for building playables with concurrency control.
 */
async function generatePlayable(order) {
    if (activeBuilds >= MAX_CONCURRENT_BUILDS) {
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
