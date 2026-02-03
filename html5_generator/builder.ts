import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { OrderConfig } from './bot_helpers';

const execAsync = util.promisify(exec);

const TEMPLATE_DIR = path.join(__dirname, 'templates', 'railroad');
const PREVIEWS_DIR = path.join(__dirname, 'previews');
const TEMP_DIR = path.join(__dirname, 'temp');
const DEPS_CACHE_DIR = path.join(TEMP_DIR, "_deps_cache");

let depsCachePromise: Promise<string> | null = null;

async function hasAllDevDeps(nodeModulesDir: string, packageJsonPath: string): Promise<boolean> {
    try {
        const raw = await fs.readFile(packageJsonPath, "utf-8");
        const pkg = JSON.parse(raw) as { devDependencies?: Record<string, string> };
        const devDeps = Object.keys(pkg.devDependencies ?? {});
        if (devDeps.length === 0) return true;
        for (const dep of devDeps) {
            const depPath = path.join(nodeModulesDir, ...dep.split("/"));
            const depManifest = path.join(depPath, "package.json");
            try {
                await fs.access(depManifest, fsConstants.F_OK);
            } catch {
                return false;
            }
        }
        return true;
    } catch {
        return false;
    }
}

async function hasBuildBins(nodeModulesDir: string, bins: string[]): Promise<boolean> {
    try {
        for (const bin of bins) {
            const binPath = path.join(nodeModulesDir, ".bin", bin);
            await fs.access(binPath, fsConstants.F_OK);
        }
        return true;
    } catch {
        return false;
    }
}

async function ensureDepsCache(): Promise<string> {
    if (depsCachePromise) return depsCachePromise;
    depsCachePromise = (async () => {
        await fs.mkdir(DEPS_CACHE_DIR, { recursive: true });
        const cachePackageJson = path.join(DEPS_CACHE_DIR, "package.json");
        const templatePackageJson = path.join(TEMPLATE_DIR, "package.json");
        const templatePkg = await fs.readFile(templatePackageJson, "utf-8");
        await fs.writeFile(cachePackageJson, templatePkg, "utf-8");

        const cacheNodeModules = path.join(DEPS_CACHE_DIR, "node_modules");
        let needsInstall = true;
        try {
            await fs.access(cacheNodeModules, fsConstants.F_OK);
            needsInstall = false;
        } catch {}

        if (!needsInstall) {
            const devDepsOk = await hasAllDevDeps(cacheNodeModules, cachePackageJson);
            const binsOk = await hasBuildBins(cacheNodeModules, ["tsc", "vite"]);
            if (!devDepsOk || !binsOk) needsInstall = true;
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
const buildQueue: (() => void)[] = [];

/**
 * Cleans up the entire temp directory on startup.
 */
export async function cleanupTemp() {
    try {
        if (await fs.access(TEMP_DIR).then(() => true).catch(() => false)) {
            console.log(`[Builder] Cleaning up old temp files in ${TEMP_DIR}...`);
            await fs.rm(TEMP_DIR, { recursive: true, force: true });
        }
        await fs.mkdir(TEMP_DIR, { recursive: true });
    } catch (e) {
        console.error("[Builder] Cleanup error:", e);
    }
}

// Ensure previews folder exists
(async () => {
    try {
        await fs.mkdir(PREVIEWS_DIR, { recursive: true });
    } catch (e) {}
})();

interface Order {
    id: string;
    config: OrderConfig & { isWatermarked: boolean };
}

/**
 * Internal worker that performs the actual build.
 */
async function performBuild(order: Order): Promise<string | null> {
    const isPreview = order.config.isWatermarked;
    const modeLabel = isPreview ? "PREVIEW" : "FINAL";
    console.log(`[Builder] [Job ${order.id}] Processing ${modeLabel}...`);

    if (process.env.BUILDER_FAST_TEST === "1") {
        const safeCurrency = (order.config.currency || "$").replace(/[^a-zA-Z0-9]/g, "");
        const filename = isPreview
            ? `PREVIEW_${order.id}.html`
            : `Railroad_${order.config.themeId}_${(order.config.language || "en").toUpperCase()}_${safeCurrency}.html`;
        const finalPath = path.join(PREVIEWS_DIR, filename);
        const payload = {
            language: order.config.language || "en",
            currency: order.config.currency || "$",
            startingBalance: order.config.startingBalance || 1000,
            themeId: order.config.themeId || "chicken_farm",
            isWatermarked: order.config.isWatermarked
        };
        await fs.mkdir(PREVIEWS_DIR, { recursive: true });
        await fs.writeFile(
            finalPath,
            `<!doctype html><html><head><meta charset="utf-8"></head><body><script>window.__USER_CONFIG__=${JSON.stringify(payload)}</script></body></html>`,
            "utf-8"
        );
        return finalPath;
    }
    
    // 1. Create Temp Work Directory
    const workDir = path.join(TEMP_DIR, order.id);
    
    try {
        await fs.mkdir(workDir, { recursive: true });
        
        // 2. Copy Template (skip node_modules to keep builds fast)
        await fs.cp(TEMPLATE_DIR, workDir, {
            recursive: true,
            filter: (src) => !src.includes(`${path.sep}node_modules`)
        });

        // If template deps are already installed, reuse them via symlink to skip install
        const templateNodeModules = path.join(TEMPLATE_DIR, "node_modules");
        const workNodeModules = path.join(workDir, "node_modules");
        const templatePackageJson = path.join(TEMPLATE_DIR, "package.json");
        const hasTemplateDeps = await fs
            .access(templateNodeModules, fsConstants.F_OK)
            .then(() => true)
            .catch(() => false);
        const canReuseTemplateDeps = hasTemplateDeps
            ? (await hasAllDevDeps(templateNodeModules, templatePackageJson)) &&
              (await hasBuildBins(templateNodeModules, ["tsc", "vite"]))
            : false;

        let linkedNodeModules = false;
        if (canReuseTemplateDeps) {
            try {
                await fs.symlink(templateNodeModules, workNodeModules, "dir");
                linkedNodeModules = true;
            } catch {
                // Fallback: copy if symlink isn't permitted
                await fs.cp(templateNodeModules, workNodeModules, { recursive: true });
                linkedNodeModules = true;
            }
        }

        if (!linkedNodeModules) {
            const cacheNodeModules = await ensureDepsCache();
            try {
                await fs.symlink(cacheNodeModules, workNodeModules, "dir");
            } catch {
                await fs.cp(cacheNodeModules, workNodeModules, { recursive: true });
            }
        }

        // 3. Inject Config (via JSON)
        const configPath = path.join(workDir, 'src', 'UserConfig.json');
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
        
        await fs.writeFile(configPath, JSON.stringify(userConfig, null, 2), 'utf-8');
        
        // 4. Build
        const nodeModulesPath = path.join(workDir, 'node_modules');
        let needsInstall = true;
        try {
            await fs.access(nodeModulesPath, fsConstants.F_OK);
            needsInstall = false;
        } catch {}

        if (!needsInstall) {
            const devDepsOk = await hasAllDevDeps(nodeModulesPath, path.join(workDir, "package.json"));
            const binsOk = await hasBuildBins(nodeModulesPath, ["tsc", "vite"]);
            if (!devDepsOk || !binsOk) needsInstall = true;
        }

        if (needsInstall) {
            console.log(`[Builder] [Job ${order.id}] Installing dependencies...`);
            await execAsync(`npm install --no-audit --no-fund --include=dev`, { cwd: workDir }); 
        }
        
        console.log(`[Builder] [Job ${order.id}] Compiling...`);
        await execAsync(`npm run build`, { cwd: workDir });
        
        // 5. Move Result
        const distPath = path.join(workDir, 'dist', 'index.html');
        const safeCurrency = (order.config.currency || '$').replace(/[^a-zA-Z0-9]/g, '');
        const filename = isPreview 
            ? `PREVIEW_${order.id}.html`
            : `Railroad_${order.config.themeId}_${(order.config.language || 'en').toUpperCase()}_${safeCurrency}.html`;
            
        const finalPath = path.join(PREVIEWS_DIR, filename);
        
        await fs.access(distPath, fsConstants.F_OK);
        await fs.copyFile(distPath, finalPath);
        
        return finalPath;
    } catch (e) {
        console.error(`[Builder] [Job ${order.id}] Failed:`, e);
        return null;
    } finally {
        // Always attempt cleanup to avoid orphaned temp dirs
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
}

/**
 * Entry point for building playables with concurrency control.
 */
export async function generatePlayable(order: Order): Promise<string | null> {
    if (activeBuilds >= MAX_CONCURRENT_BUILDS) {
        console.log(`[Builder] Queueing job ${order.id}... (${buildQueue.length} in queue)`);
        await new Promise<void>(resolve => buildQueue.push(resolve));
    }

    activeBuilds++;
    try {
        return await performBuild(order);
    } finally {
        activeBuilds--;
        const next = buildQueue.shift();
        if (next) next();
    }
}
