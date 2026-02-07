import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import util from "node:util";

const execFileAsync = util.promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const OLYMPUS_DIR = path.join(ROOT_DIR, "templates", "gate_of_olympus");
const RELEASE_HTML = path.join(OLYMPUS_DIR, "release", "index.html");

describe("gate_of_olympus release build", () => {
    it("produces syntactically valid inlined single-file html", async () => {
        await execFileAsync("node", ["build-release.js"], {
            cwd: OLYMPUS_DIR,
            timeout: 120_000,
            maxBuffer: 20 * 1024 * 1024,
        });

        const html = await fs.readFile(RELEASE_HTML, "utf-8");

        // No local asset paths should remain in release output.
        expect(html.includes("assets/")).toBe(false);
        expect(/<script[^>]+src=["']https?:\/\//i.test(html)).toBe(false);

        // Guard against replacement corruption around "$" literals.
        expect(html.includes(": '$';")).toBe(true);
        expect(html.includes("</body>\n</html>\n;")).toBe(false);

        // Validate JS payload by compiling script blocks.
        const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
        const scripts: string[] = [];
        let match: RegExpExecArray | null;
        while ((match = scriptRegex.exec(html)) !== null) {
            scripts.push(match[1] ?? "");
        }

        for (const code of scripts) {
            // eslint-disable-next-line no-new-func
            expect(() => new Function(code)).not.toThrow();
        }
    }, 180_000);
});
