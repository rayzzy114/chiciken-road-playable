import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const checks: Array<{ file: string; patterns: RegExp[] }> = [
    {
        file: path.join("templates", "railroad", "src", "Game.ts"),
        patterns: [/width:\s*1080\b/, /height:\s*1920\b/],
    },
    {
        file: path.join("templates", "matching", "src", "config.js"),
        patterns: [/width:\s*1080\b/, /height:\s*1920\b/],
    },
    {
        file: path.join("templates", "3_v_ryad", "src", "main.js"),
        patterns: [/const\s+DESIGN_W\s*=\s*1080\b/, /const\s+DESIGN_H\s*=\s*1920\b/],
    },
    {
        file: path.join("templates", "gate_of_olympus", "dev", "scripts", "game.js"),
        patterns: [/const\s+DESIGN_WIDTH\s*=\s*1080\b/, /const\s+DESIGN_HEIGHT\s*=\s*1920\b/],
    },
    {
        file: path.join("templates", "gate_of_olympus", "dev", "styles", "main.css"),
        patterns: [/--design-width:\s*1080\b/, /--design-height:\s*1920\b/],
    },
];

describe("template resolution contract", () => {
    for (const check of checks) {
        it(`enforces 1080x1920 markers in ${check.file}`, async () => {
            const fullPath = path.join(ROOT_DIR, check.file);
            const content = await fs.readFile(fullPath, "utf-8");
            for (const pattern of check.patterns) {
                expect(pattern.test(content)).toBe(true);
            }
        });
    }
});
