import { describe, it, expect } from "vitest";
import { generatePlayable } from "../src/builder";

describe("builder", () => {
    it("creates a preview file for a basic order", async () => {
        const result = await generatePlayable({
            id: "test_order",
            config: {
                themeId: "chicken_farm",
                isWatermarked: true
            }
        });
        expect(result).toBeTruthy();
        expect(result ?? "").toContain("PREVIEW_test_order.html");
    }, 300_000);
});
