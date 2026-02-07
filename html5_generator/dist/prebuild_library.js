import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { generatePlayable } from './builder.js';
import { GEOS, GAMES } from './constants.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LIBRARY_DIR = path.resolve(__dirname, '..', 'library');
async function runPrebuild() {
    console.log("🚀 Starting Pre-build Library process...");
    // Ensure library folder exists
    await fs.mkdir(LIBRARY_DIR, { recursive: true });
    const games = [GAMES.RAILROAD, GAMES.OLYMPUS, GAMES.DRAG, GAMES.MATCH3];
    for (const game of games) {
        const gameDir = path.join(LIBRARY_DIR, game.ID);
        await fs.mkdir(gameDir, { recursive: true });
        for (const geo of GEOS) {
            console.log(`\n📦 Building [${game.ID}] for GEO [${geo.id}]...`);
            // 1. Build Preview (Watermarked)
            const previewPath = await generatePlayable({
                id: `lib_${game.ID}_${geo.id}_preview`,
                config: {
                    game: game.GAME_KEY,
                    themeId: game.THEME,
                    language: geo.lang,
                    currency: geo.currency,
                    startingBalance: 1000,
                    isWatermarked: true
                }
            });
            if (previewPath) {
                const finalDest = path.join(gameDir, `${geo.id}_preview.html`);
                await fs.copyFile(previewPath, finalDest);
                console.log(`✅ Saved Preview: ${finalDest}`);
            }
            // 2. Build Final (Clean)
            const finalPath = await generatePlayable({
                id: `lib_${game.ID}_${geo.id}_final`,
                config: {
                    game: game.GAME_KEY,
                    themeId: game.THEME,
                    language: geo.lang,
                    currency: geo.currency,
                    startingBalance: 1000,
                    isWatermarked: false
                }
            });
            if (finalPath) {
                const finalDest = path.join(gameDir, `${geo.id}_final.html`);
                await fs.copyFile(finalPath, finalDest);
                console.log(`✅ Saved Final: ${finalDest}`);
            }
        }
    }
    console.log("\n✨ All library builds completed!");
}
runPrebuild().catch(console.error);
