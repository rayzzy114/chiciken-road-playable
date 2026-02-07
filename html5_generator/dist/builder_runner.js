import { cleanupTemp, generatePlayable } from "./builder.js";
async function readStdin() {
    return new Promise((resolve, reject) => {
        let data = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => {
            data += chunk;
        });
        process.stdin.on("end", () => resolve(data));
        process.stdin.on("error", reject);
    });
}
function isRecord(input) {
    return !!input && typeof input === "object" && !Array.isArray(input);
}
function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
async function handleRequest(request) {
    if (request.action === "cleanup") {
        await cleanupTemp();
        return { ok: true };
    }
    if (!request.id || !isRecord(request.config)) {
        return { ok: false, error: "INVALID_GENERATE_REQUEST" };
    }
    const path = await generatePlayable({
        id: request.id,
        config: request.config,
    });
    return {
        ok: true,
        path,
    };
}
async function main() {
    const restoreConsole = (() => {
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;
        console.log = (...args) => {
            process.stderr.write(`${args.map((v) => String(v)).join(" ")}\n`);
        };
        console.warn = (...args) => {
            process.stderr.write(`${args.map((v) => String(v)).join(" ")}\n`);
        };
        console.error = (...args) => {
            process.stderr.write(`${args.map((v) => String(v)).join(" ")}\n`);
        };
        return () => {
            console.log = originalLog;
            console.warn = originalWarn;
            console.error = originalError;
        };
    })();
    try {
        const raw = await readStdin();
        const parsed = JSON.parse(raw);
        if (!isRecord(parsed) || typeof parsed.action !== "string") {
            const invalid = { ok: false, error: "INVALID_REQUEST" };
            process.stdout.write(JSON.stringify(invalid));
            return;
        }
        const request = parsed;
        const response = await handleRequest(request);
        process.stdout.write(JSON.stringify(response));
    }
    catch (error) {
        const failed = { ok: false, error: toErrorMessage(error) };
        process.stdout.write(JSON.stringify(failed));
        process.exitCode = 1;
    }
    finally {
        restoreConsole();
    }
}
void main();
