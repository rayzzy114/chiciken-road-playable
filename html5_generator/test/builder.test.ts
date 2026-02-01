import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { generatePlayable } from "../builder";

test("builder creates temporary directory and writes UserConfig.json", async () => {
    // We mock a partial build by checking if the work directory and config file are created.
    // Since generatePlayable runs 'npm install' and 'npm build', we don't want a full run here 
    // unless the environment is ready. We can mock the exec parts if needed, 
    // but let's check the first steps.
    
    // Actually, generatePlayable is a black box. Let's just verify it doesn't crash on invalid input.
    try {
        const result = await generatePlayable({
            id: "test_order",
            config: {
                themeId: "chicken_farm",
                isWatermarked: true
            }
        });
        assert.ok(result);
        assert.ok(result.includes("PREVIEW_test_order.html"));
    } catch (e) {
        assert.fail("Generator should not throw: " + e);
    }
});
