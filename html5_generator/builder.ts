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
    
    // 1. Create Temp Work Directory
    const workDir = path.join(TEMP_DIR, order.id);
    
    try {
        await fs.mkdir(workDir, { recursive: true });
        
        // 2. Copy Template
        await fs.cp(TEMPLATE_DIR, workDir, { recursive: true });

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

        if (needsInstall) {
            console.log(`[Builder] [Job ${order.id}] Installing dependencies...`);
            await execAsync(`npm install`, { cwd: workDir }); 
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
        
        // Cleanup temp
        await fs.rm(workDir, { recursive: true, force: true });
        
        return finalPath;
    } catch (e) {
        console.error(`[Builder] [Job ${order.id}] Failed:`, e);
        return null;
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
