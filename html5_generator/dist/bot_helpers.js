"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_CURRENCY_LENGTH = exports.DEFAULT_CURRENCY = exports.DEFAULT_STARTING_BALANCE = void 0;
exports.createInitialSession = createInitialSession;
exports.sanitizeCurrencyInput = sanitizeCurrencyInput;
exports.parseBalanceInput = parseBalanceInput;
exports.getDiscount = getDiscount;
exports.calcPrice = calcPrice;
exports.buildOrderSummary = buildOrderSummary;
exports.buildProfileMessage = buildProfileMessage;
exports.getLibraryPath = getLibraryPath;
exports.parsePayCallback = parsePayCallback;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
exports.DEFAULT_STARTING_BALANCE = 1000;
exports.DEFAULT_CURRENCY = "$";
exports.MAX_CURRENCY_LENGTH = 5;
function createInitialSession() {
    return { config: {} };
}
function sanitizeCurrencyInput(input, maxLen = exports.MAX_CURRENCY_LENGTH) {
    const trimmed = input.trim();
    if (!trimmed)
        return exports.DEFAULT_CURRENCY;
    return trimmed.slice(0, maxLen);
}
function parseBalanceInput(input, fallback = exports.DEFAULT_STARTING_BALANCE) {
    const numeric = parseInt(input.replace(/[^0-9]/g, ""), 10);
    if (!Number.isFinite(numeric) || numeric <= 0)
        return fallback;
    return numeric;
}
function getDiscount(count) {
    if (count >= 10)
        return 20;
    if (count >= 3)
        return 10;
    return 0;
}
function calcPrice(base, disc) {
    return Math.floor(base * (1 - disc / 100));
}
function buildOrderSummary(OrderConfig) {
    if (!OrderConfig.themeId)
        return null;
    const language = OrderConfig.language ?? "en";
    const balance = OrderConfig.startingBalance ?? exports.DEFAULT_STARTING_BALANCE;
    const currency = OrderConfig.currency ?? exports.DEFAULT_CURRENCY;
    return "<b>Заказ готов:</b>\n" +
        "<b>Стиль:</b> " + OrderConfig.themeId + "\n" +
        "<b>Язык:</b> " + language + "\n" +
        "<b>Баланс:</b> " + balance + " " + currency;
}
function buildProfileMessage(userId, ordersPaid, walletBalance, botUsername) {
    return "<b>Профиль:</b>\n" +
        "<b>ID:</b> " + userId + "\n" +
        "<b>Заказы:</b> " + ordersPaid + "\n" +
        "<b>Баланс:</b> $" + walletBalance + "\n" +
        "<b>Реф-ссылка:</b> t.me/" + botUsername + "?start=" + userId;
}
function getLibraryPath(gameId, geoId, isWatermarked) {
    const libDir = path_1.default.resolve(__dirname, "library");
    const filename = `${geoId}_${isWatermarked ? "preview" : "final"}.html`;
    const fullPath = path_1.default.join(libDir, gameId, filename);
    if (fs_1.default.existsSync(fullPath)) {
        return fullPath;
    }
    return null;
}
function parsePayCallback(data) {
    const parts = data.split("_");
    if (parts.length < 3)
        return null;
    const type = parts[1];
    if (type !== "single" && type !== "sub")
        return null;
    const orderId = parts.slice(2).join("_");
    if (!orderId)
        return null;
    return { type, orderId };
}
