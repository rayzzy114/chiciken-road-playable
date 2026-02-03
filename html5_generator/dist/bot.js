"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBot = createBot;
exports.registerHandlers = registerHandlers;
exports.start = start;
const grammy_1 = require("grammy");
const conversations_1 = require("@grammyjs/conversations");
const storage_file_1 = require("@grammyjs/storage-file");
const builder_1 = require("./builder");
const bot_helpers_1 = require("./bot_helpers");
const db_1 = require("./db");
const config_1 = require("./config");
const constants_1 = require("./constants");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const SESSIONS_DIR = path_1.default.resolve(process.cwd(), "sessions");
function ensureSessionsDir() {
    if (!fs_1.default.existsSync(SESSIONS_DIR)) {
        fs_1.default.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
}
function getSessionConfig(ctx) {
    try {
        if (!ctx.session)
            ctx.session = (0, bot_helpers_1.createInitialSession)();
    }
    catch {
        // Fallback for contexts without session key (e.g., in tests or edge updates)
        // @ts-ignore
        ctx.session = (0, bot_helpers_1.createInitialSession)();
    }
    if (!ctx.session.config)
        ctx.session.config = {};
    return ctx.session.config;
}
// --- BOT SETUP ---
function createBot(options) {
    const bot = new grammy_1.Bot(config_1.CONFIG.BOT_TOKEN, {
        botInfo: options?.botInfo,
        client: options?.client,
    });
    ensureSessionsDir();
    const storage = options?.sessionStorage ?? new storage_file_1.FileAdapter({ dirName: SESSIONS_DIR });
    bot.use((0, grammy_1.session)({
        initial: bot_helpers_1.createInitialSession,
        storage,
    }));
    bot.use((0, conversations_1.conversations)());
    return bot;
}
// --- KEYBOARDS ---
const mainMenuKeyboard = new grammy_1.InlineKeyboard()
    .text("🎮 Заказать плеебл", "order")
    .row()
    .text("👤 Профиль", "profile")
    .row()
    .text("🤝 Реферальная система", "ref_system")
    .row()
    .url("👨‍💻 Техподдержка", "https://t.me/rawberrry");
const mainMenuNav = new grammy_1.InlineKeyboard()
    .text("🏠 Главное меню", "main_menu");
const withBackToMenu = new grammy_1.InlineKeyboard()
    .text("🔙 Назад", "main_menu");
const persistentKeyboard = new grammy_1.Keyboard().text("🏠 Главное меню").resized();
// --- CONVERSATION LOGIC ---
async function orderWizard(conversation, ctx) {
    // 1. Theme (Auto-set)
    await conversation.external(async () => {
        const config = getSessionConfig(ctx);
        config.themeId = constants_1.GAMES.RAILROAD.THEME;
        if (ctx.from)
            await db_1.DB.logAction(ctx.from.id, 'auto_select_theme', config.themeId);
    });
    // 2. GEO Selection
    const geoKeyboard = new grammy_1.InlineKeyboard();
    constants_1.GEOS.forEach((g, index) => {
        geoKeyboard.text(g.name, `geo_${g.id}`);
        if (index % 2 !== 0)
            geoKeyboard.row();
    });
    geoKeyboard.row().text("📝 Заказать свое GEO", "geo_custom");
    await ctx.reply("🌐 <b>Выберите GEO и Валюту:</b>", {
        parse_mode: "HTML",
        reply_markup: geoKeyboard
    });
    const geoCtx = await conversation.waitForCallbackQuery(/^geo_/);
    await geoCtx.answerCallbackQuery();
    const geoData = geoCtx.callbackQuery.data.replace("geo_", "");
    if (geoData === "custom") {
        const pendingCount = await db_1.prisma.order.count({
            where: { userId: BigInt(ctx.from.id), status: "custom_pending" }
        });
        if (pendingCount >= 3) {
            await ctx.reply("⏳ <b>У вас уже есть 3 активных запроса.</b>\nПожалуйста, дождитесь ответа техподдержки.", { parse_mode: "HTML" });
            return;
        }
        await ctx.reply("💬 <b>Опишите нужное вам GEO (Язык, Валюта):</b>", { parse_mode: "HTML" });
        const customCtx = await conversation.waitFor(":text");
        const description = customCtx.msg.text;
        await conversation.external(async () => {
            const orderId = "custom_" + ctx.from?.id + "_" + Date.now();
            await db_1.DB.createOrder(orderId, ctx.from.id, getSessionConfig(ctx).game ?? "railroad", "custom", { description });
            await db_1.prisma.order.update({
                where: { orderId },
                data: { status: "custom_pending" }
            });
            if (ctx.from)
                await db_1.DB.logAction(ctx.from.id, 'request_custom_geo', description);
            // Notification logic (Admin panel will show this)
            console.log(`[Admin] New custom GEO request from ${ctx.from?.id}: ${description}`);
        });
        await ctx.reply("📩 <b>Ваш запрос отправлен админу!</b>\nМы свяжемся с вами в ближайшее время.", {
            parse_mode: "HTML",
            reply_markup: mainMenuNav
        });
        return;
    }
    const geoId = geoData;
    const selectedGeo = constants_1.GEOS.find(g => g.id === geoId);
    if (!selectedGeo)
        return;
    await conversation.external(async () => {
        const config = getSessionConfig(ctx);
        config.language = selectedGeo.lang;
        config.currency = selectedGeo.currency;
        config.startingBalance = 1000; // Standardized balance
        config.geoId = geoId;
        if (ctx.from)
            await db_1.DB.logAction(ctx.from.id, 'select_geo', geoId);
    });
    await ctx.reply("✅ <b>Настройки GEO применены!</b>", { parse_mode: "HTML" });
    // Show summary and button
    const summary = (0, bot_helpers_1.buildOrderSummary)(ctx.session.config);
    await ctx.reply(summary || "Готово", {
        parse_mode: "HTML",
        reply_markup: new grammy_1.InlineKeyboard()
            .text("🚀 СОЗДАТЬ ПРЕВЬЮ", "gen_preview")
            .row()
            .text("🏠 Главное меню", "main_menu")
    });
}
function registerHandlers(bot) {
    async function showMainMenu(ctx, deletePrevious = false) {
        if (deletePrevious) {
            try {
                await ctx.deleteMessage();
            }
            catch { }
        }
        const welcomePath = path_1.default.join(__dirname, "assets", "welcomer.png");
        const caption = "";
        const cachedId = await db_1.DB.getAsset(constants_1.ASSETS.WELCOME);
        const options = {
            caption,
            parse_mode: "HTML",
            reply_markup: mainMenuKeyboard
        };
        try {
            if (cachedId) {
                await ctx.replyWithPhoto(cachedId, options);
            }
            else if (fs_1.default.existsSync(welcomePath)) {
                const msg = await ctx.replyWithPhoto(new grammy_1.InputFile(welcomePath), options);
                if (msg.photo && msg.photo.length > 0) {
                    await db_1.DB.setAsset(constants_1.ASSETS.WELCOME, msg.photo[msg.photo.length - 1].file_id);
                }
            }
            else {
                await ctx.reply("🏠 Главное меню", {
                    parse_mode: options.parse_mode,
                    reply_markup: options.reply_markup
                });
            }
        }
        catch (e) {
            console.error("Error sending main menu:", e);
            await ctx.reply("🏠 Главное меню", {
                parse_mode: options.parse_mode,
                reply_markup: options.reply_markup
            });
        }
    }
    async function editOrReply(ctx, text, keyboard) {
        const msg = ctx.callbackQuery?.message;
        const isTextMessage = msg && 'text' in msg && msg.text;
        if (isTextMessage) {
            try {
                await ctx.editMessageText(text, {
                    parse_mode: "HTML",
                    reply_markup: keyboard
                });
                return;
            }
            catch (e) {
                // Fallthrough to delete-and-reply if edit fails (e.g. content identical)
            }
        }
        // If it's not a text message (e.g. photo/video) or edit failed
        try {
            await ctx.deleteMessage();
        }
        catch { }
        await ctx.reply(text, {
            parse_mode: "HTML",
            reply_markup: keyboard
        });
    }
    bot.use((0, conversations_1.createConversation)(orderWizard));
    // --- HANDLERS ---
    // Universal back handler for popups
    bot.callbackQuery("delete_this", async (ctx) => {
        await ctx.answerCallbackQuery();
        try {
            await ctx.deleteMessage();
        }
        catch { }
    });
    bot.command("start", async (ctx) => {
        if (!ctx.from)
            return;
        await db_1.DB.upsertUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
        await db_1.DB.logAction(ctx.from.id, "start_bot");
        if (ctx.match) {
            const refId = Number(ctx.match);
            if (Number.isFinite(refId)) {
                const ok = await db_1.DB.setReferrer(ctx.from.id, refId);
                if (ok)
                    await db_1.DB.logAction(ctx.from.id, "referral_join", "Ref: " + refId);
            }
        }
        // Initialize persistent keyboard and show menu
        await ctx.reply("🚀", { reply_markup: persistentKeyboard });
        await showMainMenu(ctx);
    });
    bot.callbackQuery("main_menu", async (ctx) => {
        if (!ctx.from)
            return;
        await ctx.answerCallbackQuery();
        await showMainMenu(ctx, true);
    });
    // Handle persistent keyboard button
    bot.hears("🏠 Главное меню", async (ctx) => {
        if (!ctx.from)
            return;
        // In this case, we don't necessarily delete the user's message "🏠 Главное меню",
        // but we want to show the menu.
        await showMainMenu(ctx);
    });
    // 1. Order -> Categories
    bot.callbackQuery("order", async (ctx) => {
        if (!ctx.from)
            return;
        await ctx.answerCallbackQuery();
        await db_1.DB.logAction(ctx.from.id, "start_order");
        await editOrReply(ctx, "Выберите категорию:", new grammy_1.InlineKeyboard()
            .text("🐔 Чикен", constants_1.CATEGORIES.CHICKEN)
            .text("🎱 Плинко", constants_1.CATEGORIES.PLINKO).row()
            .text("🎰 Слоты", constants_1.CATEGORIES.SLOTS)
            .text("🧩 Метчинг", constants_1.CATEGORIES.MATCHING).row()
            .text("🔙 Назад", "main_menu"));
    });
    // 2. Categories -> Game Lists
    // Category: Chicken
    bot.callbackQuery(constants_1.CATEGORIES.CHICKEN, async (ctx) => {
        if (!ctx.from)
            return;
        await ctx.answerCallbackQuery();
        await editOrReply(ctx, "Выберите игру:", new grammy_1.InlineKeyboard()
            .text("🚂 Chicken Railroad", constants_1.GAMES.RAILROAD.ID)
            .row()
            .text("🔙 Назад", "order"));
    });
    // Category: Plinko
    bot.callbackQuery(constants_1.CATEGORIES.PLINKO, async (ctx) => {
        if (!ctx.from)
            return;
        await ctx.answerCallbackQuery();
        await editOrReply(ctx, "Выберите игру:", new grammy_1.InlineKeyboard()
            .text("🎱 Classic Plinko", constants_1.GAMES.PLINKO.ID)
            .row()
            .text("🔙 Назад", "order"));
    });
    // Category: Slots
    bot.callbackQuery(constants_1.CATEGORIES.SLOTS, async (ctx) => {
        if (!ctx.from)
            return;
        await ctx.answerCallbackQuery();
        await editOrReply(ctx, "Выберите игру:", new grammy_1.InlineKeyboard()
            .text("⚡ Gates of Olympus", constants_1.GAMES.OLYMPUS.ID)
            .row()
            .text("🔙 Назад", "order"));
    });
    // Category: Matching
    bot.callbackQuery(constants_1.CATEGORIES.MATCHING, async (ctx) => {
        if (!ctx.from)
            return;
        await ctx.answerCallbackQuery();
        await editOrReply(ctx, "Выберите игру:", new grammy_1.InlineKeyboard()
            .text("🤏 Перетаска", constants_1.GAMES.DRAG.ID)
            .row()
            .text("💎 3 в ряд", constants_1.GAMES.MATCH3.ID)
            .row()
            .text("🔙 Назад", "order"));
    });
    // --- GAME HANDLERS ---
    // 3.1 Game -> Product Page (Chicken Railroad)
    bot.callbackQuery(constants_1.GAMES.RAILROAD.ID, async (ctx) => {
        if (!ctx.from)
            return;
        await ctx.answerCallbackQuery();
        await db_1.DB.logAction(ctx.from.id, "view_product", "railroad");
        const assetKey = constants_1.GAMES.RAILROAD.ASSET_KEY;
        const videoPath = path_1.default.join(__dirname, "assets", "chicken_railway_opt.mp4");
        const caption = "<b>🚂 Chicken Railroad</b>\n\n" +
            "Увлекательная игра, где нужно строить пути для курочки! " +
            "Отличный выбор для повышения вовлеченности.\n\n" +
            "Цена: $" + config_1.CONFIG.PRICES.single;
        const keyboard = new grammy_1.InlineKeyboard()
            .text("💳 Купить ($" + config_1.CONFIG.PRICES.single + ")", "buy_check_railroad")
            .row()
            .text("🔙 Назад", constants_1.CATEGORIES.CHICKEN);
        try {
            // Delete the previous menu message to avoid duplication/stacking
            try {
                await ctx.deleteMessage();
            }
            catch { }
            const cachedId = await db_1.DB.getAsset(assetKey);
            if (cachedId) {
                // Use cached File ID
                await ctx.replyWithAnimation(cachedId, {
                    caption: caption,
                    parse_mode: "HTML",
                    reply_markup: keyboard
                });
            }
            else if (fs_1.default.existsSync(videoPath)) {
                // Upload file
                const msg = await ctx.replyWithAnimation(new grammy_1.InputFile(videoPath), {
                    caption: caption,
                    parse_mode: "HTML",
                    reply_markup: keyboard
                });
                // Cache File ID for next time
                const fileId = msg.animation?.file_id || msg.document?.file_id;
                if (fileId) {
                    await db_1.DB.setAsset(assetKey, fileId);
                    console.log(`[Cache] Cached asset '${assetKey}': ${fileId}`);
                }
            }
            else {
                await ctx.reply(caption, {
                    parse_mode: "HTML",
                    reply_markup: keyboard
                });
            }
        }
        catch (e) {
            console.error("Error sending product page:", e);
            await editOrReply(ctx, caption + "\n(Ошибка загрузки превью)", keyboard);
        }
    });
    // 3.2 Placeholder Handlers for other games
    const placeholderGames = [
        { id: constants_1.GAMES.PLINKO.ID, name: "🎱 Classic Plinko", back: constants_1.CATEGORIES.PLINKO },
        { id: constants_1.GAMES.OLYMPUS.ID, name: "⚡ Gates of Olympus", back: constants_1.CATEGORIES.SLOTS },
        { id: constants_1.GAMES.DRAG.ID, name: "🤏 Перетаска", back: constants_1.CATEGORIES.MATCHING },
        { id: constants_1.GAMES.MATCH3.ID, name: "💎 3 в ряд", back: constants_1.CATEGORIES.MATCHING },
    ];
    for (const g of placeholderGames) {
        bot.callbackQuery(g.id, async (ctx) => {
            await ctx.answerCallbackQuery();
            await editOrReply(ctx, `<b>${g.name}</b>\n\nВ разработке! Скоро будет доступно. 🚧`, new grammy_1.InlineKeyboard().text("🔙 Назад", g.back));
        });
    }
    // 4. Buy Check -> Wizard
    bot.callbackQuery("buy_check_railroad", async (ctx) => {
        if (!ctx.from)
            return;
        await ctx.answerCallbackQuery();
        const s = await db_1.DB.getUserStats(ctx.from.id);
        const disc = (0, bot_helpers_1.getDiscount)(s.orders_paid);
        const minPrice = (0, bot_helpers_1.calcPrice)(config_1.CONFIG.PRICES.single, disc);
        if (s.wallet_balance < minPrice) {
            await ctx.reply(`Недостаточно средств на балансе.\nВаш баланс: $${s.wallet_balance}\nТребуется: $${minPrice}\n\nПожалуйста, пополните счет.`, {
                parse_mode: "HTML",
                reply_markup: new grammy_1.InlineKeyboard().text("🔙 Назад", "delete_this")
            });
            return;
        }
        // Proceed
        await db_1.DB.logAction(ctx.from.id, "select_game", "railroad");
        ctx.session.config = { game: "railroad" };
        await ctx.conversation.enter("orderWizard");
    });
    bot.callbackQuery("gen_preview", async (ctx) => {
        if (!ctx.from)
            return;
        await ctx.answerCallbackQuery();
        await db_1.DB.logAction(ctx.from.id, "gen_preview");
        const c = ctx.session.config;
        if (!c.themeId)
            return editOrReply(ctx, "Нет активной конфигурации.", withBackToMenu);
        const orderId = "ord_" + ctx.from.id + "_" + Date.now();
        await db_1.DB.createOrder(orderId, ctx.from.id, c.game ?? "railroad", c.themeId, c);
        await editOrReply(ctx, "Генерация превью...");
        // Try to fetch from library first
        const libPath = (0, bot_helpers_1.getLibraryPath)(c.game ?? "railroad", c.geoId ?? "en_usd", true);
        let generatedPath = null;
        if (libPath) {
            generatedPath = libPath;
            console.log(`[Library] Using pre-built preview: ${libPath}`);
        }
        else {
            generatedPath = await (0, builder_1.generatePlayable)({
                id: orderId,
                config: {
                    themeId: c.themeId,
                    language: c.language || "en",
                    currency: c.currency || bot_helpers_1.DEFAULT_CURRENCY,
                    startingBalance: c.startingBalance || bot_helpers_1.DEFAULT_STARTING_BALANCE,
                    isWatermarked: true
                }
            });
        }
        if (generatedPath) {
            const s = await db_1.DB.getUserStats(ctx.from.id);
            const disc = (0, bot_helpers_1.getDiscount)(s.orders_paid);
            const p1 = (0, bot_helpers_1.calcPrice)(config_1.CONFIG.PRICES.single, disc);
            const p2 = (0, bot_helpers_1.calcPrice)(config_1.CONFIG.PRICES.sub, disc);
            await ctx.replyWithDocument(new grammy_1.InputFile(generatedPath), {
                caption: "Превью (с водяным знаком)\nСкидка: " + disc + "%",
                parse_mode: "HTML",
                reply_markup: new grammy_1.InlineKeyboard()
                    .text("💳 Купить разово ($ " + p1 + ")", "pay_single_" + orderId)
                    .row()
                    .text("⭐ Подписка ($ " + p2 + ")", "pay_sub_" + orderId)
                    .row()
                    .text("🏠 Главное меню", "main_menu")
            });
        }
        else {
            await editOrReply(ctx, "Ошибка генерации файла.", withBackToMenu);
        }
    });
    bot.callbackQuery(/^pay_/, async (ctx) => {
        if (!ctx.from)
            return;
        await ctx.answerCallbackQuery();
        const parsed = (0, bot_helpers_1.parsePayCallback)(ctx.callbackQuery.data);
        if (!parsed)
            return editOrReply(ctx, "Некорректная ссылка оплаты.", withBackToMenu);
        const order = await db_1.DB.getOrder(parsed.orderId);
        if (!order)
            return editOrReply(ctx, "Заказ не найден.", withBackToMenu);
        if (order.userId !== BigInt(ctx.from.id))
            return editOrReply(ctx, "Заказ не найден.", withBackToMenu);
        await db_1.DB.logAction(ctx.from.id, "pay_click", parsed.type);
        let alreadyPaid = false;
        if (order.status.startsWith("paid")) {
            alreadyPaid = true;
        }
        if (!alreadyPaid) {
            const s = await db_1.DB.getUserStats(ctx.from.id);
            const disc = (0, bot_helpers_1.getDiscount)(s.orders_paid);
            const amount = (0, bot_helpers_1.calcPrice)(parsed.type === "sub" ? config_1.CONFIG.PRICES.sub : config_1.CONFIG.PRICES.single, disc);
            if (s.wallet_balance < amount) {
                return editOrReply(ctx, `Недостаточно средств на балансе.\nВаш баланс: $${s.wallet_balance}\nТребуется: $${amount}\n\nПожалуйста, пополните счет.`, withBackToMenu);
            }
            let finalized = false;
            try {
                await db_1.DB.finalizePaidOrder(parsed.orderId, ctx.from.id, "paid_" + parsed.type, amount, disc);
                finalized = true;
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : "UNKNOWN_ERROR";
                if (msg === "ORDER_ALREADY_PAID") {
                    alreadyPaid = true;
                }
                else if (msg === "INSUFFICIENT_FUNDS") {
                    return editOrReply(ctx, `Недостаточно средств на балансе.\nВаш баланс: $${s.wallet_balance}\nТребуется: $${amount}\n\nПожалуйста, пополните счет.`, withBackToMenu);
                }
                else if (msg === "ORDER_NOT_FOUND" || msg === "ORDER_USER_MISMATCH") {
                    return editOrReply(ctx, "Заказ не найден.", withBackToMenu);
                }
                else {
                    console.error("Payment finalize error:", e);
                    return editOrReply(ctx, "Ошибка обработки оплаты.", withBackToMenu);
                }
            }
            if (finalized) {
                await db_1.DB.addReferralReward(ctx.from.id, amount);
                await db_1.DB.logAction(ctx.from.id, "pay_success", "$" + amount);
            }
        }
        await editOrReply(ctx, alreadyPaid ? "Оплата уже подтверждена. Собираю финальный файл..." : "Оплата прошла! Собираю финальный файл...");
        // Try to fetch from library first
        const libPath = (0, bot_helpers_1.getLibraryPath)(order.gameType, order.config.geoId ?? "en_usd", false);
        let finalPath = null;
        if (libPath) {
            finalPath = libPath;
            console.log(`[Library] Delivering pre-built final: ${libPath}`);
        }
        else {
            finalPath = await (0, builder_1.generatePlayable)({
                id: parsed.orderId + "_final",
                config: {
                    ...order.config,
                    isWatermarked: false
                }
            });
        }
        if (finalPath) {
            await ctx.replyWithDocument(new grammy_1.InputFile(finalPath), {
                caption: "Ваш файл без водяного знака готов! 🚀",
                parse_mode: "HTML",
                reply_markup: mainMenuNav
            });
        }
        else {
            await editOrReply(ctx, "Ошибка сборки.", withBackToMenu);
        }
    });
    bot.callbackQuery("profile", async (ctx) => {
        if (!ctx.from)
            return;
        await ctx.answerCallbackQuery();
        const s = await db_1.DB.getUserStats(ctx.from.id);
        const me = await bot.api.getMe();
        const msgText = (0, bot_helpers_1.buildProfileMessage)(ctx.from.id, s.orders_paid, s.wallet_balance, me.username ?? "bot");
        const profilePath = path_1.default.join(__dirname, "assets", "profile.png");
        const cacheKey = constants_1.ASSETS.PROFILE;
        const keyboard = new grammy_1.InlineKeyboard()
            .text("💰 Пополнить баланс", "top_up_balance")
            .row()
            .text("🏠 Главное меню", "main_menu");
        try {
            // Delete the menu message to avoid cluttering
            try {
                await ctx.deleteMessage();
            }
            catch { }
            const cachedId = await db_1.DB.getAsset(cacheKey);
            if (cachedId) {
                await ctx.replyWithPhoto(cachedId, {
                    caption: msgText,
                    parse_mode: "HTML",
                    reply_markup: keyboard
                });
            }
            else if (fs_1.default.existsSync(profilePath)) {
                const msg = await ctx.replyWithPhoto(new grammy_1.InputFile(profilePath), {
                    caption: msgText,
                    parse_mode: "HTML",
                    reply_markup: keyboard
                });
                if (msg.photo && msg.photo.length > 0) {
                    await db_1.DB.setAsset(cacheKey, msg.photo[msg.photo.length - 1].file_id);
                }
            }
            else {
                await ctx.reply(msgText, { parse_mode: "HTML", reply_markup: keyboard });
            }
        }
        catch (e) {
            console.error("Error sending profile:", e);
            await ctx.reply(msgText, { parse_mode: "HTML", reply_markup: keyboard });
        }
    });
    bot.callbackQuery("top_up_balance", async (ctx) => {
        if (!ctx.from)
            return;
        await ctx.answerCallbackQuery();
        const msg = "<b>Пополнение баланса</b>\n\n" +
            "Для пополнения баланса переведите средства на один из кошельков ниже:\n\n" +
            "🔹 <b>USDT TRC-20:</b>\n<code>" + config_1.CONFIG.WALLETS.usdt_trc20 + "</code>\n\n" +
            "🔸 <b>BTC:</b>\n<code>" + config_1.CONFIG.WALLETS.btc + "</code>\n\n" +
            "После оплаты нажмите кнопку <b>«Я оплатил»</b>. Мы проверим транзакцию и начислим баланс.";
        await editOrReply(ctx, msg, new grammy_1.InlineKeyboard()
            .text("✅ Я оплатил", "i_paid")
            .row()
            .text("🔙 Назад", "profile"));
    });
    bot.callbackQuery("i_paid", async (ctx) => {
        if (!ctx.from)
            return;
        await ctx.answerCallbackQuery();
        await db_1.DB.logAction(ctx.from.id, "click_i_paid");
        // Notify user
        await editOrReply(ctx, "<b>Заявка отправлена!</b>\n\nАдминистратор скоро проверит платеж и зачислит средства на ваш баланс. Обычно это занимает от 5 до 30 минут.", new grammy_1.InlineKeyboard().text("🏠 Главное меню", "main_menu"));
        // Notify admin
        const adminMsg = "🔔 <b>Новое уведомление об оплате!</b>\n\n" +
            "<b>От:</b> " + (ctx.from.first_name || "Без имени") + " (@" + (ctx.from.username || "нет") + ")\n" +
            "<b>ID:</b> <code>" + ctx.from.id + "</code>\n\n" +
            "Проверьте входящие транзакции.";
        try {
            await bot.api.sendMessage(config_1.CONFIG.ADMIN_TELEGRAM_ID, adminMsg, { parse_mode: "HTML" });
        }
        catch (e) {
            console.error("Failed to notify admin:", e);
        }
    });
    // --- ADMIN COMMANDS ---
    bot.command("addbalance", async (ctx) => {
        if (!ctx.from || ctx.from.id !== config_1.CONFIG.ADMIN_TELEGRAM_ID)
            return;
        const args = ctx.match.split(" ");
        if (args.length < 2) {
            return ctx.reply("Использование: /addbalance <userId> <amount>");
        }
        const targetUserId = BigInt(args[0]);
        const amount = parseFloat(args[1]);
        if (isNaN(amount))
            return ctx.reply("Сумма должна быть числом.");
        try {
            await db_1.prisma.user.update({
                where: { id: targetUserId },
                data: { walletBalance: { increment: amount } }
            });
            await db_1.DB.logAction(targetUserId, "admin_add_balance", `Added $${amount}`);
            await ctx.reply(`✅ Баланс пользователя ${targetUserId} пополнен на $${amount}`);
            // Notify user
            try {
                await bot.api.sendMessage(Number(targetUserId), `💰 Ваш баланс пополнен на <b>$${amount}</b>!`, { parse_mode: "HTML" });
            }
            catch { }
        }
        catch (e) {
            await ctx.reply("Ошибка: пользователь не найден или ошибка БД.");
        }
    });
    bot.callbackQuery("ref_system", async (ctx) => {
        if (!ctx.from)
            return;
        await ctx.answerCallbackQuery();
        const s = await db_1.DB.getUserStats(ctx.from.id);
        const me = await bot.api.getMe();
        const link = "t.me/" + (me.username ?? "bot") + "?start=" + ctx.from.id;
        const msg = "Реферальная система:\n" +
            "Ваша ссылка: " + link + "\n" +
            "Приглашено: " + s.referrals_count + "\n" +
            "Баланс: $" + s.wallet_balance;
        await editOrReply(ctx, msg, mainMenuNav);
    });
    bot.catch((err) => console.error(err));
}
async function start() {
    await (0, builder_1.cleanupTemp)();
    const bot = createBot();
    registerHandlers(bot);
    void bot.start();
    console.log("Bot started.");
}
if (require.main === module) {
    void start();
}
