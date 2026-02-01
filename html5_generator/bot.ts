import { Bot, Context, session, SessionFlavor, InlineKeyboard, Keyboard, InputFile } from "grammy";
import { type Conversation, type ConversationFlavor, conversations, createConversation } from "@grammyjs/conversations";
import { FileAdapter } from "@grammyjs/storage-file";
import { generatePlayable, cleanupTemp } from "./builder";
import {
    DEFAULT_CURRENCY,
    DEFAULT_STARTING_BALANCE,
    createInitialSession,
    sanitizeCurrencyInput,
    parseBalanceInput,
    getDiscount,
    calcPrice,
    buildOrderSummary,
    buildProfileMessage,
    parsePayCallback,
    getLibraryPath,
    type OrderConfig,
    type SessionData,
} from "./bot_helpers";
import { DB, prisma } from "./db";
import { CONFIG } from "./config";
import { GAMES, CATEGORIES, ASSETS, GEOS } from "./constants";
import fs from "fs";
import express from "express";
import basicAuth from "basic-auth";
import path from "path";

type BaseContext = Context & SessionFlavor<SessionData>;
type MyContext = ConversationFlavor<BaseContext>;
type MyConversationContext = BaseContext;
type MyConversation = Conversation<MyContext, MyConversationContext>;

const SESSIONS_DIR = path.resolve(process.cwd(), "sessions");

function ensureSessionsDir() {
    if (!fs.existsSync(SESSIONS_DIR)) {
        fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
}

function getSessionConfig(ctx: MyConversationContext): OrderConfig {
    if (!ctx.session.config) ctx.session.config = {};
    return ctx.session.config;
}

// --- ADMIN SERVER (SIMPLE) ---
export function createAdminApp() {
    const app = express();
    app.set("view engine", "ejs");
    app.set("views", path.join(__dirname, "views"));

    app.use((req, res, next) => {
        const user = basicAuth(req);
        if (!user || user.name !== CONFIG.ADMIN_USER || user.pass !== CONFIG.ADMIN_PASS) {
            res.set("WWW-Authenticate", 'Basic realm="Admin Area"');
            return res.status(401).send();
        }
        next();
    });

    app.get("/admin", async (req, res) => {
        const stats = await DB.getAdminStats();
        const logs = await DB.getLastLogs(50);
        // Pagination: default page 1, limit 50
        const page = Number(req.query.page) || 1;
        const users = await DB.getAllUsers(page, 50);
        const orders = await DB.getAllOrders();
        res.render("admin", DB.serialize({ stats, logs, users, orders, page }));
    });

    app.post("/admin/add-balance", express.urlencoded({ extended: true }), async (req, res) => {
        const { userId, amount } = req.body;
        const targetId = BigInt(userId);
        const addAmount = parseFloat(amount);

        if (!isNaN(addAmount)) {
            try {
                await prisma.user.update({
                    where: { id: targetId },
                    data: { walletBalance: { increment: addAmount } }
                });
                await DB.logAction(targetId, "admin_panel_add_balance", `Added $${addAmount}`);
                
                // Notify user via bot
                const bot = new Bot<MyContext>(CONFIG.BOT_TOKEN);
                try {
                    await bot.api.sendMessage(Number(targetId), `💰 Ваш баланс пополнен на <b>$${addAmount}</b> через админ-панель!`, { parse_mode: "HTML" });
                } catch (e) { console.error("Could not notify user", e); }
            } catch (e) { console.error("Error updating balance", e); }
        }
        res.redirect("/admin");
    });

    app.get("/", (req, res) => {
        res.redirect("/admin");
    });

    return app;
}

export function startAdminServer(app = createAdminApp()) {
    return app.listen(CONFIG.PORT, () => {
        console.log("Admin Panel started on port " + CONFIG.PORT);
    });
}

// --- BOT SETUP ---
export function createBot() {
    const bot = new Bot<MyContext>(CONFIG.BOT_TOKEN);
    ensureSessionsDir();

    bot.use(session<SessionData, Context>({
        initial: createInitialSession,
        storage: new FileAdapter({ dirName: SESSIONS_DIR }),
    }));

    bot.use(conversations());
    return bot;
}

// --- KEYBOARDS ---
const mainMenuKeyboard = new InlineKeyboard()
    .text("🎮 Заказать плеебл", "order")
    .row()
    .text("👤 Профиль", "profile")
    .row()
    .text("🤝 Реферальная система", "ref_system")
    .row()
    .url("👨‍💻 Техподдержка", "https://t.me/rawberrry");

const mainMenuNav = new InlineKeyboard()
    .text("🏠 Главное меню", "main_menu");

const withBackToMenu = new InlineKeyboard()
    .text("🔙 Назад", "main_menu");

const persistentKeyboard = new Keyboard().text("🏠 Главное меню").resized();

// --- CONVERSATION LOGIC ---
async function orderWizard(conversation: MyConversation, ctx: MyConversationContext) {
    // 1. Theme (Auto-set)
    await conversation.external(async () => {
        const config = getSessionConfig(ctx);
        config.themeId = GAMES.RAILROAD.THEME; 
        if (ctx.from) await DB.logAction(ctx.from.id, 'auto_select_theme', config.themeId);
    });

    // 2. GEO Selection
    const geoKeyboard = new InlineKeyboard();
    GEOS.forEach((g, index) => {
        geoKeyboard.text(g.name, `geo_${g.id}`);
        if (index % 2 !== 0) geoKeyboard.row();
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
        const stats = await DB.getUserStats(ctx.from!.id);
        const pendingCount = await prisma.order.count({
            where: { userId: BigInt(ctx.from!.id), status: "custom_pending" }
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
            await DB.createOrder(orderId, ctx.from!.id, getSessionConfig(ctx).game ?? "railroad", "custom", { description });
            await prisma.order.update({
                where: { orderId },
                data: { status: "custom_pending" }
            });
            if (ctx.from) await DB.logAction(ctx.from.id, 'request_custom_geo', description);
            
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
    const selectedGeo = GEOS.find(g => g.id === geoId);

    if (!selectedGeo) return;

    await conversation.external(async () => {
        const config = getSessionConfig(ctx);
        config.language = selectedGeo.lang;
        config.currency = selectedGeo.currency;
        config.startingBalance = 1000; // Standardized balance
        config.geoId = geoId;
        if (ctx.from) await DB.logAction(ctx.from.id, 'select_geo', geoId);
    });

    await ctx.reply("✅ <b>Настройки GEO применены!</b>", { parse_mode: "HTML" });
    
    // Show summary and button
    const summary = buildOrderSummary(ctx.session.config);
    await ctx.reply(summary || "Готово", {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
            .text("🚀 СОЗДАТЬ ПРЕВЬЮ", "gen_preview")
            .row()
            .text("🏠 Главное меню", "main_menu")
    });
}

function registerHandlers(bot: Bot<MyContext>) {
    async function showMainMenu(ctx: Context, deletePrevious = false) {
        if (deletePrevious) {
            try { await ctx.deleteMessage(); } catch {}
        }

        const welcomePath = path.join(__dirname, "assets", "welcomer.png");
        const caption = ""; 
        const cachedId = await DB.getAsset(ASSETS.WELCOME);

        const options = {
            caption,
            parse_mode: "HTML" as const,
            reply_markup: mainMenuKeyboard
        };

        try {
            if (cachedId) {
                await ctx.replyWithPhoto(cachedId, options);
            } else if (fs.existsSync(welcomePath)) {
                const msg = await ctx.replyWithPhoto(new InputFile(welcomePath), options);
                if (msg.photo && msg.photo.length > 0) {
                    await DB.setAsset(ASSETS.WELCOME, msg.photo[msg.photo.length - 1].file_id);
                }
            } else {
                await ctx.reply("🏠 Главное меню", { 
                    parse_mode: options.parse_mode, 
                    reply_markup: options.reply_markup 
                });
            }
        } catch (e) {
            console.error("Error sending main menu:", e);
            await ctx.reply("🏠 Главное меню", { 
                parse_mode: options.parse_mode, 
                reply_markup: options.reply_markup 
            });
        }
    }

    async function editOrReply(ctx: MyContext, text: string, keyboard?: InlineKeyboard) {
        const msg = ctx.callbackQuery?.message;
        const isTextMessage = msg && 'text' in msg && msg.text;

        if (isTextMessage) {
            try {
                await ctx.editMessageText(text, {
                    parse_mode: "HTML",
                    reply_markup: keyboard
                });
                return;
            } catch (e) {
                // Fallthrough to delete-and-reply if edit fails (e.g. content identical)
            }
        }

        // If it's not a text message (e.g. photo/video) or edit failed
        try { await ctx.deleteMessage(); } catch {}
        await ctx.reply(text, {
            parse_mode: "HTML",
            reply_markup: keyboard
        });
    }

    bot.use(createConversation(orderWizard));

    // --- HANDLERS ---
    // Universal back handler for popups
    bot.callbackQuery("delete_this", async (ctx) => {
        await ctx.answerCallbackQuery();
        try { await ctx.deleteMessage(); } catch {}
    });

    bot.command("start", async (ctx) => {
        if (!ctx.from) return;

        await DB.upsertUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
        await DB.logAction(ctx.from.id, "start_bot");

        if (ctx.match) {
            const refId = Number(ctx.match);
            if (Number.isFinite(refId)) {
                const ok = await DB.setReferrer(ctx.from.id, refId);
                if (ok) await DB.logAction(ctx.from.id, "referral_join", "Ref: " + refId);
            }
        }

        // Initialize persistent keyboard and show menu
        await ctx.reply("🚀", { reply_markup: persistentKeyboard });
        await showMainMenu(ctx);
    });

    bot.callbackQuery("main_menu", async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();
        await showMainMenu(ctx, true);
    });

    // Handle persistent keyboard button
    bot.hears("🏠 Главное меню", async (ctx) => {
        if (!ctx.from) return;
        // In this case, we don't necessarily delete the user's message "🏠 Главное меню",
        // but we want to show the menu.
        await showMainMenu(ctx);
    });

    // 1. Order -> Categories
    bot.callbackQuery("order", async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();
        await DB.logAction(ctx.from.id, "start_order");
        await editOrReply(ctx, "Выберите категорию:", new InlineKeyboard()
            .text("🐔 Чикен", CATEGORIES.CHICKEN)
            .text("🎱 Плинко", CATEGORIES.PLINKO).row()
            .text("🎰 Слоты", CATEGORIES.SLOTS)
            .text("🧩 Метчинг", CATEGORIES.MATCHING).row()
            .text("🔙 Назад", "main_menu"));
    });

    // 2. Categories -> Game Lists
    
    // Category: Chicken
    bot.callbackQuery(CATEGORIES.CHICKEN, async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();
        await editOrReply(ctx, "Выберите игру:", new InlineKeyboard()
            .text("🚂 Chicken Railroad", GAMES.RAILROAD.ID)
            .row()
            .text("🔙 Назад", "order"));
    });

    // Category: Plinko
    bot.callbackQuery(CATEGORIES.PLINKO, async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();
        await editOrReply(ctx, "Выберите игру:", new InlineKeyboard()
            .text("🎱 Classic Plinko", GAMES.PLINKO.ID)
            .row()
            .text("🔙 Назад", "order"));
    });

    // Category: Slots
    bot.callbackQuery(CATEGORIES.SLOTS, async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();
        await editOrReply(ctx, "Выберите игру:", new InlineKeyboard()
            .text("⚡ Gates of Olympus", GAMES.OLYMPUS.ID)
            .row()
            .text("🔙 Назад", "order"));
    });

    // Category: Matching
    bot.callbackQuery(CATEGORIES.MATCHING, async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();
        await editOrReply(ctx, "Выберите игру:", new InlineKeyboard()
            .text("🤏 Перетаска", GAMES.DRAG.ID)
            .row()
            .text("💎 3 в ряд", GAMES.MATCH3.ID)
            .row()
            .text("🔙 Назад", "order"));
    });

    // --- GAME HANDLERS ---

    // 3.1 Game -> Product Page (Chicken Railroad)
    bot.callbackQuery(GAMES.RAILROAD.ID, async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();
        await DB.logAction(ctx.from.id, "view_product", "railroad");

        const assetKey = GAMES.RAILROAD.ASSET_KEY;
        const videoPath = path.join(__dirname, "assets", "chicken_railway_opt.mp4");
        const caption =
            "<b>🚂 Chicken Railroad</b>\n\n" +
            "Увлекательная игра, где нужно строить пути для курочки! " +
            "Отличный выбор для повышения вовлеченности.\n\n" +
            "Цена: $" + CONFIG.PRICES.single;

        const keyboard = new InlineKeyboard()
            .text("💳 Купить ($" + CONFIG.PRICES.single + ")", "buy_check_railroad")
            .row()
            .text("🔙 Назад", CATEGORIES.CHICKEN);

        try {
            // Delete the previous menu message to avoid duplication/stacking
            try { await ctx.deleteMessage(); } catch {}

            const cachedId = await DB.getAsset(assetKey);
            if (cachedId) {
                // Use cached File ID
                await ctx.replyWithAnimation(cachedId, {
                    caption: caption,
                    parse_mode: "HTML",
                    reply_markup: keyboard
                });
            } else if (fs.existsSync(videoPath)) {
                // Upload file
                const msg = await ctx.replyWithAnimation(new InputFile(videoPath), {
                    caption: caption,
                    parse_mode: "HTML",
                    reply_markup: keyboard
                });
                // Cache File ID for next time
                const fileId = msg.animation?.file_id || msg.document?.file_id;
                if (fileId) {
                    await DB.setAsset(assetKey, fileId);
                    console.log(`[Cache] Cached asset '${assetKey}': ${fileId}`);
                }
            } else {
                await ctx.reply(caption, {
                     parse_mode: "HTML",
                     reply_markup: keyboard
                });
            }
        } catch (e) {
            console.error("Error sending product page:", e);
            await editOrReply(ctx, caption + "\n(Ошибка загрузки превью)", keyboard);
        }
    });

    // 3.2 Placeholder Handlers for other games
    const placeholderGames = [
        { id: GAMES.PLINKO.ID, name: "🎱 Classic Plinko", back: CATEGORIES.PLINKO },
        { id: GAMES.OLYMPUS.ID, name: "⚡ Gates of Olympus", back: CATEGORIES.SLOTS },
        { id: GAMES.DRAG.ID, name: "🤏 Перетаска", back: CATEGORIES.MATCHING },
        { id: GAMES.MATCH3.ID, name: "💎 3 в ряд", back: CATEGORIES.MATCHING },
    ];

    for (const g of placeholderGames) {
        bot.callbackQuery(g.id, async (ctx) => {
            await ctx.answerCallbackQuery();
            await editOrReply(ctx, `<b>${g.name}</b>\n\nВ разработке! Скоро будет доступно. 🚧`, new InlineKeyboard().text("🔙 Назад", g.back));
        });
    }

    // 4. Buy Check -> Wizard
    bot.callbackQuery("buy_check_railroad", async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();

        const s = await DB.getUserStats(ctx.from.id);
        const price = CONFIG.PRICES.single;

        if (s.wallet_balance < price) {
            await ctx.reply(
                `Недостаточно средств на балансе.\nВаш баланс: $${s.wallet_balance}\nТребуется: $${price}\n\nПожалуйста, пополните счет.`,
                {
                    parse_mode: "HTML",
                    reply_markup: new InlineKeyboard().text("🔙 Назад", "delete_this")
                }
            );
            return;
        }

        // Proceed
        await DB.logAction(ctx.from.id, "select_game", "railroad");
        ctx.session.config = { game: "railroad" };
        await ctx.conversation.enter("orderWizard");
    });

    bot.callbackQuery("gen_preview", async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();
        await DB.logAction(ctx.from.id, "gen_preview");

        const c = ctx.session.config;
        if (!c.themeId) return editOrReply(ctx, "Нет активной конфигурации.", withBackToMenu);

        const orderId = "ord_" + ctx.from.id + "_" + Date.now();
        await DB.createOrder(orderId, ctx.from.id, c.game ?? "railroad", c.themeId, c);

        await editOrReply(ctx, "Генерация превью...");

        // Try to fetch from library first
        const libPath = getLibraryPath(c.game ?? "railroad", c.geoId ?? "en_usd", true);
        let generatedPath: string | null = null;

        if (libPath) {
            generatedPath = libPath;
            console.log(`[Library] Using pre-built preview: ${libPath}`);
        } else {
            generatedPath = await generatePlayable({
                id: orderId,
                config: {
                    themeId: c.themeId,
                    language: c.language || "en",
                    currency: c.currency || DEFAULT_CURRENCY,
                    startingBalance: c.startingBalance || DEFAULT_STARTING_BALANCE,
                    isWatermarked: true
                }
            });
        }

        if (generatedPath) {
            const s = await DB.getUserStats(ctx.from.id);
            const disc = getDiscount(s.orders_paid);
            const p1 = calcPrice(CONFIG.PRICES.single, disc);
            const p2 = calcPrice(CONFIG.PRICES.sub, disc);

            await ctx.replyWithDocument(new InputFile(generatedPath), {
                caption: "Превью (с водяным знаком)\nСкидка: " + disc + "%",
                parse_mode: "HTML",
                reply_markup: new InlineKeyboard()
                    .text("💳 Купить разово ($ " + p1 + ")", "pay_single_" + orderId)
                    .row()
                    .text("⭐ Подписка ($ " + p2 + ")", "pay_sub_" + orderId)
                    .row()
                    .text("🏠 Главное меню", "main_menu")
            });
        } else {
            await editOrReply(ctx, "Ошибка генерации файла.", withBackToMenu);
        }
    });

    bot.callbackQuery(/^pay_/, async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();
        const parsed = parsePayCallback(ctx.callbackQuery.data);
        if (!parsed) return editOrReply(ctx, "Некорректная ссылка оплаты.", withBackToMenu);

        await DB.logAction(ctx.from.id, "pay_click", parsed.type);

        const s = await DB.getUserStats(ctx.from.id);
        const disc = getDiscount(s.orders_paid);
        const amount = calcPrice(parsed.type === "sub" ? CONFIG.PRICES.sub : CONFIG.PRICES.single, disc);

        await editOrReply(ctx, "Оплата прошла! Собираю финальный файл...");

        await DB.markPaid(parsed.orderId, "paid_" + parsed.type, amount, disc);
        await DB.addReferralReward(ctx.from.id, amount);
        await DB.logAction(ctx.from.id, "pay_success", "$" + amount);

        const order = await DB.getOrder(parsed.orderId);
        if (!order) return editOrReply(ctx, "Заказ не найден.", withBackToMenu);

        // Try to fetch from library first
        const libPath = getLibraryPath(order.gameType, order.config.geoId ?? "en_usd", false);
        let finalPath: string | null = null;

        if (libPath) {
            finalPath = libPath;
            console.log(`[Library] Delivering pre-built final: ${libPath}`);
        } else {
            finalPath = await generatePlayable({
                id: parsed.orderId + "_final",
                config: {
                    ...order.config,
                    isWatermarked: false
                }
            });
        }

        if (finalPath) {
            await ctx.replyWithDocument(new InputFile(finalPath), {
                caption: "Ваш файл без водяного знака готов! 🚀",
                parse_mode: "HTML",
                reply_markup: mainMenuNav
            });
        } else {
            await editOrReply(ctx, "Ошибка сборки.", withBackToMenu);
        }
    });

    bot.callbackQuery("profile", async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();
        const s = await DB.getUserStats(ctx.from.id);
        const me = await bot.api.getMe();
        const msgText = buildProfileMessage(ctx.from.id, s.orders_paid, s.wallet_balance, me.username ?? "bot");

        const profilePath = path.join(__dirname, "assets", "profile.png");
        const cacheKey = ASSETS.PROFILE;

        const keyboard = new InlineKeyboard()
            .text("💰 Пополнить баланс", "top_up_balance")
            .row()
            .text("🏠 Главное меню", "main_menu");

        try {
            // Delete the menu message to avoid cluttering
            try { await ctx.deleteMessage(); } catch {}

            const cachedId = await DB.getAsset(cacheKey);

            if (cachedId) {
                await ctx.replyWithPhoto(cachedId, {
                    caption: msgText,
                    parse_mode: "HTML",
                    reply_markup: keyboard
                });
            } else if (fs.existsSync(profilePath)) {
                const msg = await ctx.replyWithPhoto(new InputFile(profilePath), {
                    caption: msgText,
                    parse_mode: "HTML",
                    reply_markup: keyboard
                });
                if (msg.photo && msg.photo.length > 0) {
                    await DB.setAsset(cacheKey, msg.photo[msg.photo.length - 1].file_id);
                }
            } else {
                await ctx.reply(msgText, { parse_mode: "HTML", reply_markup: keyboard });
            }
        } catch (e) {
            console.error("Error sending profile:", e);
            await ctx.reply(msgText, { parse_mode: "HTML", reply_markup: keyboard });
        }
    });

    bot.callbackQuery("top_up_balance", async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();
        
        const msg = "<b>Пополнение баланса</b>\n\n" +
            "Для пополнения баланса переведите средства на один из кошельков ниже:\n\n" +
            "🔹 <b>USDT TRC-20:</b>\n<code>" + CONFIG.WALLETS.usdt_trc20 + "</code>\n\n" +
            "🔸 <b>BTC:</b>\n<code>" + CONFIG.WALLETS.btc + "</code>\n\n" +
            "После оплаты нажмите кнопку <b>«Я оплатил»</b>. Мы проверим транзакцию и начислим баланс.";
        
        await editOrReply(ctx, msg, new InlineKeyboard()
            .text("✅ Я оплатил", "i_paid")
            .row()
            .text("🔙 Назад", "profile"));
    });

    bot.callbackQuery("i_paid", async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();
        
        await DB.logAction(ctx.from.id, "click_i_paid");
        
        // Notify user
        await editOrReply(ctx, "<b>Заявка отправлена!</b>\n\nАдминистратор скоро проверит платеж и зачислит средства на ваш баланс. Обычно это занимает от 5 до 30 минут.", new InlineKeyboard().text("🏠 Главное меню", "main_menu"));
        
        // Notify admin
        const adminMsg = "🔔 <b>Новое уведомление об оплате!</b>\n\n" +
            "<b>От:</b> " + (ctx.from.first_name || "Без имени") + " (@" + (ctx.from.username || "нет") + ")\n" +
            "<b>ID:</b> <code>" + ctx.from.id + "</code>\n\n" +
            "Проверьте входящие транзакции.";
        
        try {
            await bot.api.sendMessage(CONFIG.ADMIN_TELEGRAM_ID, adminMsg, { parse_mode: "HTML" });
        } catch (e) {
            console.error("Failed to notify admin:", e);
        }
    });

    // --- ADMIN COMMANDS ---
    bot.command("addbalance", async (ctx) => {
        if (!ctx.from || ctx.from.id !== CONFIG.ADMIN_TELEGRAM_ID) return;
        
        const args = ctx.match.split(" ");
        if (args.length < 2) {
            return ctx.reply("Использование: /addbalance <userId> <amount>");
        }
        
        const targetUserId = BigInt(args[0]);
        const amount = parseFloat(args[1]);
        
        if (isNaN(amount)) return ctx.reply("Сумма должна быть числом.");
        
        try {
            await prisma.user.update({
                where: { id: targetUserId },
                data: { walletBalance: { increment: amount } }
            });
            
            await DB.logAction(targetUserId, "admin_add_balance", `Added $${amount}`);
            await ctx.reply(`✅ Баланс пользователя ${targetUserId} пополнен на $${amount}`);
            
            // Notify user
            try {
                await bot.api.sendMessage(Number(targetUserId), `💰 Ваш баланс пополнен на <b>$${amount}</b>!`, { parse_mode: "HTML" });
            } catch {}
        } catch (e) {
            await ctx.reply("Ошибка: пользователь не найден или ошибка БД.");
        }
    });

    bot.callbackQuery("ref_system", async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();
        const s = await DB.getUserStats(ctx.from.id);
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

export async function start() {
    await cleanupTemp();
    const app = createAdminApp();
    startAdminServer(app);
    const bot = createBot();
    registerHandlers(bot);
    void bot.start();
    console.log("Bot started.");
}

if (require.main === module) {
    void start();
}
