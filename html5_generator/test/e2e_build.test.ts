import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import { generatePlayable } from "../src/builder";

describe("builder e2e", () => {
    it("injects language and currency into output", async () => {
        const testOrderId = "e2e_test_" + Date.now();
        const testConfig = {
            themeId: "chicken_farm",
            language: "pt",
            currency: "в‚ё",
            startingBalance: 777,
            isWatermarked: false
        };

        const resultPath = await generatePlayable({
            id: testOrderId,
            config: testConfig
        });

        expect(resultPath).toBeTruthy();
        const fileExists = await fs.access(resultPath as string).then(() => true).catch(() => false);
        expect(fileExists).toBe(true);

        const htmlContent = await fs.readFile(resultPath as string, "utf-8");
        expect(htmlContent.includes('"pt"') || htmlContent.includes("'pt'")).toBe(true);
        expect(htmlContent.includes('"в‚ё"') || htmlContent.includes("'в‚ё'")).toBe(true);
        expect(htmlContent.includes("777")).toBe(true);
        expect(htmlContent.includes("false")).toBe(true);
    }, 300_000);
});

