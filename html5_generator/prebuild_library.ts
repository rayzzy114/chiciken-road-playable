import fs from 'fs/promises';
import path from 'path';
import { generatePlayable } from './builder';
import { GEOS, GAMES } from './constants';

const LIBRARY_DIR = path.resolve(__dirname, 'library');

async function runPrebuild() {
    console.log("🚀 Starting Pre-build Library process...");
    
    // Ensure library folder exists
    await fs.mkdir(LIBRARY_DIR, { recursive: true });

    // For now, we only have Railroad template
    const games = [GAMES.RAILROAD];

    for (const game of games) {
        const gameDir = path.join(LIBRARY_DIR, game.ID);
        await fs.mkdir(gameDir, { recursive: true });

        for (const geo of GEOS) {
            console.log(`\n📦 Building [${game.ID}] for GEO [${geo.id}]...`);

            // 1. Build Preview (Watermarked)
            const previewPath = await generatePlayable({
                id: `lib_${game.ID}_${geo.id}_preview`,
                config: {
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
