import dotenv from "dotenv";

dotenv.config();

const getEnv = (key: string, defaultVal?: string): string => {
    const val = process.env[key] || defaultVal;
    if (!val) {
        throw new Error(`Missing environment variable: ${key}`);
    }
    return val;
};

const getEnvNumber = (key: string, defaultVal?: string): number => {
    const raw = getEnv(key, defaultVal);
    const num = Number.parseInt(raw, 10);
    if (!Number.isFinite(num)) {
        throw new Error(`Invalid numeric environment variable: ${key}`);
    }
    return num;
};

export const CONFIG = {
    BOT_TOKEN: getEnv("BOT_TOKEN"),
    ADMIN_USER: getEnv("ADMIN_USER"),
    ADMIN_PASS: getEnv("ADMIN_PASS"),
    PORT: getEnvNumber("PORT", "3000"),

    PRICES: {
        single: 349,
        sub: 659,
    },

    ADMIN_TELEGRAM_ID: getEnvNumber("ADMIN_TELEGRAM_ID", "1146462744"),

    WALLETS: {
        usdt_trc20: "TCxtQLvqh9ppYPXuJMoaLNYyWFWZx6JZYW",
        btc: "bc1qe4gjhyndedl57hlw8qep5cctkxmxazxx02fx89",
    },

    CRYPTO_PAY_API_TOKEN: process.env.CRYPTO_PAY_API_TOKEN?.trim() || "",
    CRYPTO_PAY_API_BASE: process.env.CRYPTO_PAY_API_BASE?.trim() || "https://pay.crypt.bot/api",
    CRYPTO_PAY_FIAT: process.env.CRYPTO_PAY_FIAT?.trim() || "USD",
    CRYPTO_PAY_ACCEPTED_ASSETS:
        process.env.CRYPTO_PAY_ACCEPTED_ASSETS?.trim() || "USDT,TON,BTC,ETH,LTC,BNB,TRX,USDC",

    THEMES: {
        chicken_farm: "Ферма (Классика)",
    },
};
