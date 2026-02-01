import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { generatePlayable } from "../builder";

test("End-to-End Build: Language and Currency Injection", async () => {
    const testOrderId = "e2e_test_" + Date.now();
    const testConfig = {
        themeId: "chicken_farm",
        language: "pt",
        currency: "₸",
        startingBalance: 777,
        isWatermarked: false
    };

    console.log("[E2E Test] Starting build with Language: pt, Currency: ₸");

    const resultPath = await generatePlayable({
        id: testOrderId,
        config: testConfig
    });

    // 1. Verify file exists
    assert.ok(resultPath, "Build should return a file path");
    const fileExists = await fs.access(resultPath).then(() => true).catch(() => false);
    assert.ok(fileExists, "Resulting HTML file should exist on disk");

    // 2. Verify content of the single HTML file
    // Since vite-plugin-singlefile inlines everything, our config should be inside the script tag
    const htmlContent = await fs.readFile(resultPath, "utf-8");

    // Check for injected values
    // Vite minification pulls these out into constants
    assert.ok(htmlContent.includes('"pt"') || htmlContent.includes("'pt'"), "HTML should contain injected language 'pt'");
    assert.ok(htmlContent.includes('"₸"') || htmlContent.includes("'₸'"), "HTML should contain injected currency '₸'");
    assert.ok(htmlContent.includes('777'), "HTML should contain injected balance 777");
    assert.ok(htmlContent.includes('false'), "HTML should contain isWatermarked value");

    console.log("[E2E Test] Build successful and verified!");

    // Cleanup
    // await fs.unlink(resultPath);
});
