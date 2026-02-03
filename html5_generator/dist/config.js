"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const getEnv = (key, defaultVal) => {
    const val = process.env[key] || defaultVal;
    if (!val) {
        throw new Error(`Missing environment variable: ${key}`);
    }
    return val;
};
exports.CONFIG = {
    BOT_TOKEN: getEnv('BOT_TOKEN'),
    ADMIN_USER: getEnv('ADMIN_USER', 'admin'),
    ADMIN_PASS: getEnv('ADMIN_PASS', 'admin'),
    PORT: parseInt(getEnv('PORT', '3000')),
    PRICES: {
        single: 349,
        sub: 659
    },
    ADMIN_TELEGRAM_ID: parseInt(getEnv('ADMIN_TELEGRAM_ID', '1146462744')), // Default to the owner
    WALLETS: {
        usdt_trc20: "TCxtQLvqh9ppYPXuJMoaLNYyWFWZx6JZYW",
        btc: "bc1qe4gjhyndedl57hlw8qep5cctkxmxazxx02fx89"
    },
    THEMES: {
        chicken_farm: "🐔 Ферма (Классика)"
    }
};
