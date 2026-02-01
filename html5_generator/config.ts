import dotenv from 'dotenv';
dotenv.config();

const getEnv = (key: string, defaultVal?: string): string => {
    const val = process.env[key] || defaultVal;
    if (!val) {
        throw new Error(`Missing environment variable: ${key}`);
    }
    return val;
};

export const CONFIG = {
    BOT_TOKEN: getEnv('BOT_TOKEN'),
    ADMIN_USER: getEnv('ADMIN_USER', 'admin'),
    ADMIN_PASS: getEnv('ADMIN_PASS', 'admin'),
    PORT: parseInt(getEnv('PORT', '3000')),
    
    PRICES: {
        single: 349,
        sub: 659
    },
    
    THEMES: {
        chicken_farm: "🐔 Ферма (Классика)"
    }
};
