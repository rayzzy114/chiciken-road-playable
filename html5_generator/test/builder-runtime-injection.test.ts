import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import { generatePlayable } from "../src/builder";

describe("builder runtime injection", () => {
    it("injects dimension contract and preview watermark logic", async () => {
        const id = `runtime_injection_${Date.now()}`;
        const resultPath = await generatePlayable({
            id,
            config: {
                game: "matching",
                themeId: "money_drag",
                language: "en",
                currency: "$",
                startingBalance: 1000,
                isWatermarked: true,
            },
        });

        expect(resultPath).toBeTruthy();
        const html = await fs.readFile(resultPath as string, "utf-8");
        expect(html.includes("window.__PLAYABLE_DIMENSIONS__={width:1080,height:1920}")).toBe(true);
        expect(html.includes("PREVIEW MODE\\nPURCHASE TO UNLOCK")).toBe(true);
        expect(html.includes('"isWatermarked":true')).toBe(true);
    }, 300_000);

    it("injects final-mode cleanup for watermark elements", async () => {
        const id = `runtime_injection_final_${Date.now()}`;
        const resultPath = await generatePlayable({
            id,
            config: {
                game: "olympus",
                themeId: "gate_of_olympus",
                language: "en",
                currency: "$",
                startingBalance: 1000,
                isWatermarked: false,
            },
        });

        expect(resultPath).toBeTruthy();
        const html = await fs.readFile(resultPath as string, "utf-8");
        expect(html.includes("function removeWatermarks()")).toBe(true);
        expect(html.includes('"isWatermarked":false')).toBe(true);
    }, 300_000);
});
