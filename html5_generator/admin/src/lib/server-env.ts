import fs from "node:fs";
import path from "node:path";

let fallbackEnv: Record<string, string> | null = null;

function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function loadFallbackEnv(): Record<string, string> {
  if (fallbackEnv) return fallbackEnv;
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const content = fs.readFileSync(candidate, "utf-8");
      fallbackEnv = parseDotEnv(content);
      return fallbackEnv;
    } catch {}
  }
  fallbackEnv = {};
  return fallbackEnv;
}

export function getServerEnv(name: string): string | undefined {
  const direct = process.env[name];
  if (direct && direct.trim()) return direct.trim();
  const fallback = loadFallbackEnv()[name];
  return fallback && fallback.trim() ? fallback.trim() : undefined;
}
