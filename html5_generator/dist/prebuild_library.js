"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const builder_1 = require("./builder");
const constants_1 = require("./constants");
const LIBRARY_DIR = path_1.default.resolve(__dirname, 'library');
async function runPrebuild() {
    console.log("🚀 Starting Pre-build Library process...");
    // Ensure library folder exists
    await promises_1.default.mkdir(LIBRARY_DIR, { recursive: true });
    // For now, we only have Railroad template
    const games = [constants_1.GAMES.RAILROAD];
    for (const game of games) {
        const gameDir = path_1.default.join(LIBRARY_DIR, game.ID);
        await promises_1.default.mkdir(gameDir, { recursive: true });
        for (const geo of constants_1.GEOS) {
            console.log(`\n📦 Building [${game.ID}] for GEO [${geo.id}]...`);
            // 1. Build Preview (Watermarked)
            const previewPath = await (0, builder_1.generatePlayable)({
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
                const finalDest = path_1.default.join(gameDir, `${geo.id}_preview.html`);
                await promises_1.default.copyFile(previewPath, finalDest);
                console.log(`✅ Saved Preview: ${finalDest}`);
            }
            // 2. Build Final (Clean)
            const finalPath = await (0, builder_1.generatePlayable)({
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
                const finalDest = path_1.default.join(gameDir, `${geo.id}_final.html`);
                await promises_1.default.copyFile(finalPath, finalDest);
                console.log(`✅ Saved Final: ${finalDest}`);
            }
        }
    }
    console.log("\n✨ All library builds completed!");
}
runPrebuild().catch(console.error);
