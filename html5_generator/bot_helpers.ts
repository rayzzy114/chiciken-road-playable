import path from "path";
import fs from "fs";

export interface OrderConfig {
    game?: string;
    themeId?: string;
    language?: string;
    currency?: string;
    startingBalance?: number;
    geoId?: string;
}

export interface SessionData {
    config: OrderConfig;
}

export const DEFAULT_STARTING_BALANCE = 1000;
export const DEFAULT_CURRENCY = "$";
export const MAX_CURRENCY_LENGTH = 5;

export function createInitialSession(): SessionData {
    return { config: {} };
}

export function sanitizeCurrencyInput(input: string, maxLen = MAX_CURRENCY_LENGTH): string {
    const trimmed = input.trim();
    if (!trimmed) return DEFAULT_CURRENCY;
    return trimmed.slice(0, maxLen);
}

export function parseBalanceInput(input: string, fallback = DEFAULT_STARTING_BALANCE): number {
    const numeric = parseInt(input.replace(/[^0-9]/g, ""), 10);
    if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
    return numeric;
}

export function getDiscount(count: number) {
    if (count >= 10) return 20;
    if (count >= 3) return 10;
    return 0;
}

export function calcPrice(base: number, disc: number) {
    return Math.floor(base * (1 - disc / 100));
}

export function buildOrderSummary(OrderConfig: OrderConfig): string | null {
    if (!OrderConfig.themeId) return null;
    const language = OrderConfig.language ?? "en";
    const balance = OrderConfig.startingBalance ?? DEFAULT_STARTING_BALANCE;
    const currency = OrderConfig.currency ?? DEFAULT_CURRENCY;
    return "<b>Заказ готов:</b>\n" +
        "<b>Стиль:</b> " + OrderConfig.themeId + "\n" +
        "<b>Язык:</b> " + language + "\n" +
        "<b>Баланс:</b> " + balance + " " + currency;
}

export function buildProfileMessage(
    userId: number,
    ordersPaid: number,
    walletBalance: number,
    botUsername: string,
): string {
    return "<b>Профиль:</b>\n" +
        "<b>ID:</b> " + userId + "\n" +
        "<b>Заказы:</b> " + ordersPaid + "\n" +
        "<b>Баланс:</b> $" + walletBalance + "\n" +
        "<b>Реф-ссылка:</b> t.me/" + botUsername + "?start=" + userId;
}

export function getLibraryPath(gameId: string, geoId: string, isWatermarked: boolean): string | null {
    const libDir = path.resolve(__dirname, "library");
    const filename = `${geoId}_${isWatermarked ? "preview" : "final"}.html`;
    const fullPath = path.join(libDir, gameId, filename);
    
    if (fs.existsSync(fullPath)) {
        return fullPath;
    }
    return null;
}

export function parsePayCallback(data: string): { type: "single" | "sub"; orderId: string } | null {
    const parts = data.split("_");
    if (parts.length < 3) return null;
    const type = parts[1] as "single" | "sub";
    if (type !== "single" && type !== "sub") return null;
    const orderId = parts.slice(2).join("_");
    if (!orderId) return null;
    return { type, orderId };
}