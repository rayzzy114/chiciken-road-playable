const TelegramBot = require('node-telegram-bot-api');
const { generatePlayable } = require('./builder');
const fs = require('fs');
const path = require('path');

// --- CONFIG ---
const TOKEN = '8023383039:AAEyaShP55vdqihm1ITviVU9zMvxGvQNHuE';
const ADMIN_IDS = []; // Add your ID here to bypass payment if needed
const PRICES = {
    single: 349,
    subscription: 659
};

// --- INIT ---
const bot = new TelegramBot(TOKEN, { polling: true });
console.log('🤖 HTML5 Generator Bot is starting...');

// --- STATE MANAGEMENT ---
// In-memory store. In production, use Redis or MongoDB.
// Structure: { chatId: { step, config: {...} } }
const userSessions = new Map();

// --- CONTENT ---
const GAMES = {
    railroad: { name: "🚂 Chicken Railroad", description: "Crash/Tower run mechanic. High retention." }
};

const THEMES = {
    chicken_farm: { name: "🐔 Farm Theme", id: "chicken_farm" },
    cyber_city: { name: "🤖 Cyberpunk", id: "cyber_city" }
};

const STEPS = {
    IDLE: 'IDLE',
    WAITING_CURRENCY: 'WAITING_CURRENCY',
    WAITING_BALANCE: 'WAITING_BALANCE'
};

// --- HANDLERS ---

bot.onText(///start/, (msg) => {
    const chatId = msg.chat.id;
    userSessions.set(chatId, { step: STEPS.IDLE, config: {} });
    
    bot.sendMessage(chatId, 
        `👋 *Welcome to Playable Factory!*\n\n` +
        `Create high-converting HTML5 playable ads in seconds.\n` +
        `✅ No coding required\n✅ Anti-theft Watermark Protection\n✅ Optimized for FB/Unity/Google\n\n` +
        `👇 *Select a game engine to start:*`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: GAMES.railroad.name, callback_data: 'game_railroad' }],
                    [{ text: "🧩 Match-3 (Coming Soon)", callback_data: 'ignore' }]
                ]
            }
        }
    );
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const session = userSessions.get(chatId) || { step: STEPS.IDLE, config: {} };

    // 1. SELECT GAME -> SHOW THEMES
    if (data === 'game_railroad') {
        session.config.game = 'railroad';
        userSessions.set(chatId, session);
        
        await bot.editMessageText(`🚂 *Railroad Engine Selected*\n\nChoose a visual style (Skin):`, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: THEMES.chicken_farm.name, callback_data: 'theme_chicken_farm' }],
                    [{ text: THEMES.cyber_city.name + " (Premium)", callback_data: 'theme_cyber_city' }]
                ]
            }
        });
    }

    // 2. SELECT THEME -> SELECT LANGUAGE
    else if (data.startsWith('theme_')) {
        const themeId = data.replace('theme_', '');
        session.config.themeId = themeId;
        userSessions.set(chatId, session);

        await bot.editMessageText(`🎨 *Theme Selected:* ${THEMES[themeId]?.name || themeId}\n\n🌐 Choose interface language:`, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "🇷🇺 RU", callback_data: 'lang_ru' },
                        { text: "🇺🇸 EN", callback_data: 'lang_en' }
                    ],
                    [
                        { text: "🇧🇷 PT", callback_data: 'lang_pt' },
                        { text: "🇪🇸 ES", callback_data: 'lang_es' }
                    ]
                ]
            }
        });
    }

    // 3. SELECT LANG -> ASK CURRENCY
    else if (data.startsWith('lang_')) {
        const lang = data.replace('lang_', '');
        session.config.language = lang;
        session.step = STEPS.WAITING_CURRENCY;
        userSessions.set(chatId, session);

        await bot.sendMessage(chatId, 
            `🌐 *Language set to ${lang.toUpperCase()}*\n\n` +
            `💱 **Enter the Currency Symbol** you want to display.\n` +
            `Examples: $, €, ₽, R$, ₸\n\n` +
            `_Type it in the chat:_`,
            { parse_mode: 'Markdown' }
        );
    }

    // 5. GENERATE PREVIEW
    else if (data === 'gen_preview') {
        await bot.sendMessage(chatId, "⏳ *Generating Preview...*\n_Injecting Watermark Protection..._", { parse_mode: 'Markdown' });
        
        // Build with Watermark
        session.config.isWatermarked = true;
        
        // In a real app, we queue this job. Here we await (might block slightly)
        try {
            const filePath = generatePlayable({ id: chatId.toString(), config: session.config });
            
            if (filePath) {
                // In production, upload to S3/VPS and send LINK. 
                // Here we send file but name it PREVIEW.
                await bot.sendDocument(chatId, filePath, {
                    caption: `🔒 *PREVIEW MODE*\n\nThis file is watermarked and gameplay is limited.\n\n👇 **To get the CLEAN file, please purchase:**`,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: `💳 Buy Single ($${PRICES.single})`, callback_data: 'pay_single' }],
                            [{ text: `💎 Monthly Sub ($${PRICES.subscription})`, callback_data: 'pay_sub' }]
                        ]
                    }
                });
            } else {
                bot.sendMessage(chatId, "❌ Error generating preview. Please try again.");
            }
        } catch (e) {
            console.error(e);
            bot.sendMessage(chatId, "❌ System error.");
        }
    }

    // 6. PAYMENT MOCK -> FINAL DELIVERY
    else if (data.startsWith('pay_')) {
        // Here you would integrate Stripe/Crypto
        // We mock a successful payment
        await bot.sendMessage(chatId, "🔄 *Processing Payment...*");
        
        setTimeout(async () => {
            await bot.sendMessage(chatId, "✅ *Payment Successful!* Removing watermarks...");
            
            // Re-build without watermark
            session.config.isWatermarked = false;
            const filePath = generatePlayable({ id: chatId.toString(), config: session.config });
            
            if (filePath) {
                await bot.sendDocument(chatId, filePath, {
                    caption: `🚀 *Here is your Playable Ad!*\n\nReady for upload to Facebook/Unity/Google.\n\n_Thank you for your business!_`
                });
            } else {
                bot.sendMessage(chatId, "❌ Error generating final file. Contact support.");
            }
        }, 1500);
    }
    
    // Cleanup callback spinner
    try {
        bot.answerCallbackQuery(query.id);
    } catch(e) {}
});

// --- TEXT INPUT HANDLERS ---

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const session = userSessions.get(chatId);

    if (!session || !text || text.startsWith('/')) return;

    // 4. HANDLE CURRENCY INPUT
    if (session.step === STEPS.WAITING_CURRENCY) {
        session.config.currency = text.trim().substring(0, 5); // Limit length
        session.step = STEPS.WAITING_BALANCE;
        userSessions.set(chatId, session);

        bot.sendMessage(chatId, 
            `💱 Currency set to: **${session.config.currency}**\n\n` +
            `💰 **Enter Starting Balance** (Number only)\n` +
            `Example: 1000, 5000, 50`,
            { parse_mode: 'Markdown' }
        );
    }

    // 5. HANDLE BALANCE INPUT -> SHOW SUMMARY
    else if (session.step === STEPS.WAITING_BALANCE) {
        const balance = parseInt(text.replace(/[^0-9]/g, ''));
        if (isNaN(balance) || balance <= 0) {
            return bot.sendMessage(chatId, "❌ Please enter a valid number (e.g. 1000).");
        }

        session.config.startingBalance = balance;
        session.step = STEPS.IDLE; // Done collecting info
        userSessions.set(chatId, session);

        // Show Summary
        const c = session.config;
        const themeName = THEMES[c.themeId]?.name;
        
        bot.sendMessage(chatId, 
            `📝 *Order Summary:*\n\n` +
            `🎮 Game: Railroad\n` +
            `🎨 Theme: ${themeName}\n` +
            `🌐 Lang: ${c.language.toUpperCase()}\n` +
            `💱 Currency: ${c.currency}\n` +
            `💰 Balance: ${c.startingBalance}\n\n` +
            `_Ready to build?_`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔨 GENERATE PREVIEW", callback_data: 'gen_preview' }],
                        [{ text: "❌ Start Over", callback_data: 'game_railroad' }] // Simple reset
                    ]
                }
            }
        );
    }
});

console.log("Bot is ready!");
