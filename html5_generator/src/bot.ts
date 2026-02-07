import { Bot, Context, session, SessionFlavor, InlineKeyboard, Keyboard, InputFile, type StorageAdapter } from "grammy";
import { type Conversation, type ConversationFlavor, conversations, createConversation } from "@grammyjs/conversations";
import { FileAdapter } from "@grammyjs/storage-file";
import { generatePlayable, cleanupTemp } from "./builder.js";
import {
    DEFAULT_CURRENCY,
    DEFAULT_STARTING_BALANCE,
    createInitialSession,
    getDiscount,
    calcPrice,
    buildOrderSummary,
    buildProfileMessage,
    parsePayCallback,
    getLibraryPath,
    type OrderConfig,
    type SessionData,
} from "./bot_helpers.js";
import { DB, prisma } from "./db.js";
import { CONFIG } from "./config.js";
import { createCryptoPayInvoice, getCryptoPayInvoice, isCryptoPayEnabled } from "./crypto_pay.js";
import { GAMES, CATEGORIES, ASSETS, GEOS } from "./constants.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type BaseContext = Context & SessionFlavor<SessionData>;
type MyContext = ConversationFlavor<BaseContext>;
type MyConversationContext = BaseContext;
type MyConversation = Conversation<MyContext, MyConversationContext>;

const SESSIONS_DIR = path.resolve(process.cwd(), "sessions");
const BOT_ASSETS_DIR = path.resolve(process.cwd(), "assets");
const ORDER_WIZARD_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_CUSTOM_GEO_DESCRIPTION = 400;
const MAX_CTA_URL_LENGTH = 500;
const ORDER_STATUS_CANCELLED = "cancelled";
const CANCELLED_ORDER_TEXT = "Оплата по этому заказу отменена. Заказ закрыт. Создайте новый заказ.";

function escapeHtml(input: string): string {
    return input
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function ensureSessionsDir() {
    if (!fs.existsSync(SESSIONS_DIR)) {
        fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
}

function getSessionConfig(ctx: BaseContext): OrderConfig {
    try {
        if (!ctx.session) ctx.session = createInitialSession();
    } catch {
        // Fallback for contexts without session key (e.g., in tests or edge updates)
        // @ts-ignore
        ctx.session = createInitialSession();
    }
    if (!ctx.session.config) ctx.session.config = {};
    return ctx.session.config;
}

type OrderableGame = {
    id: string;
    key: string;
    theme: string;
    title: string;
    category: string;
    buyCallback: string;
    description: string;
};

const ORDERABLE_GAMES: OrderableGame[] = [
    {
        id: GAMES.RAILROAD.ID,
        key: GAMES.RAILROAD.GAME_KEY,
        theme: GAMES.RAILROAD.THEME,
        title: "Chicken Railroad",
        category: CATEGORIES.CHICKEN,
        buyCallback: "buy_check_railroad",
        description: "Готовый однофайловый шаблон с железнодорожным игровым циклом.",
    },
    {
        id: GAMES.OLYMPUS.ID,
        key: GAMES.OLYMPUS.GAME_KEY,
        theme: GAMES.OLYMPUS.THEME,
        title: "Gates of Olympus",
        category: CATEGORIES.SLOTS,
        buyCallback: "buy_check_olympus",
        description: "Слот-шаблон с анимированным Zeus и сильным финальным экраном.",
    },
    {
        id: GAMES.DRAG.ID,
        key: GAMES.DRAG.GAME_KEY,
        theme: GAMES.DRAG.THEME,
        title: "Money Matching",
        category: CATEGORIES.MATCHING,
        buyCallback: "buy_check_matching",
        description: "Шаблон drag-and-drop matching с чистым CTA-флоу.",
    },
    {
        id: GAMES.MATCH3.ID,
        key: GAMES.MATCH3.GAME_KEY,
        theme: GAMES.MATCH3.THEME,
        title: "3 v Ryad",
        category: CATEGORIES.MATCHING,
        buyCallback: "buy_check_match3",
        description: "Быстрый шаблон match-3, оптимизированный под однофайловую выдачу.",
    },
];

const ORDERABLE_BY_BUY_CALLBACK = new Map(ORDERABLE_GAMES.map((g) => [g.buyCallback, g]));
const ORDERABLE_BY_GAME_KEY = new Map(ORDERABLE_GAMES.map((g) => [g.key, g]));

const GAME_PREVIEW_PHOTOS: Partial<Record<string, string[]>> = {
    [GAMES.RAILROAD.GAME_KEY]: [
        path.resolve(process.cwd(), "assets", "product_previews", "railroad_preview.png"),
    ],
    [GAMES.OLYMPUS.GAME_KEY]: [
        path.resolve(process.cwd(), "assets", "product_previews", "olympus_preview.png"),
        path.resolve(process.cwd(), "templates", "gate_of_olympus", "bb16c47b-a4dc-48b5-9175-59a961b1122d.jpg"),
        path.resolve(process.cwd(), "templates", "gate_of_olympus", "dev", "assets", "bb16c47b-a4dc-48b5-9175-59a961b1122d.jpg"),
    ],
    [GAMES.DRAG.GAME_KEY]: [
        path.resolve(process.cwd(), "assets", "product_previews", "matching_preview.png"),
        path.resolve(process.cwd(), "templates", "matching", "assets", "ChatGPT Image Dec 19, 2025, 02_59_23 PM.png"),
    ],
    [GAMES.MATCH3.GAME_KEY]: [
        path.resolve(process.cwd(), "assets", "product_previews", "match3_preview.png"),
        path.resolve(process.cwd(), "templates", "3_v_ryad", "public", "assets", "background.jpg"),
        path.resolve(process.cwd(), "templates", "3_v_ryad", "dist", "assets", "background.jpg"),
    ],
};

function findExistingPreviewPath(gameKey: string): string | null {
    const candidates = GAME_PREVIEW_PHOTOS[gameKey] ?? [];
    for (const filePath of candidates) {
        if (fs.existsSync(filePath)) return filePath;
    }
    return null;
}

function getDefaultBalanceForGame(gameKey: string | undefined): number {
    if (gameKey === GAMES.DRAG.GAME_KEY || gameKey === GAMES.MATCH3.GAME_KEY) {
        return 0;
    }
    return 1000;
}

function getThemeForGame(gameKey: string | undefined): string {
    const found = ORDERABLE_GAMES.find((g) => g.key === gameKey);
    return found?.theme ?? GAMES.RAILROAD.THEME;
}

function clampDiscount(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(90, Math.trunc(value)));
}

function formatPriceCaption(basePrice: number, discount: number): string {
    const normalized = clampDiscount(discount);
    if (normalized <= 0) return `Цена: $${basePrice}`;
    const discounted = calcPrice(basePrice, normalized);
    return `Цена: <s>$${basePrice}</s> <b>$${discounted}</b> (-${normalized}%)`;
}

function canUseLibraryArtifact(clickUrl: string | undefined): boolean {
    // Library artifacts are static and cannot safely guarantee per-order CTA redirects.
    return !normalizeCtaUrl(clickUrl ?? "");
}

function normalizeCtaUrl(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed || trimmed.length > MAX_CTA_URL_LENGTH) return null;

    const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;

    try {
        const parsed = new URL(withProtocol);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
        return parsed.toString();
    } catch {
        return null;
    }
}

function buildCryptoInvoiceKeyboard(orderId: string, payUrl: string) {
    return new InlineKeyboard()
        .url("Оплатить в Crypto Bot", payUrl)
        .row()
        .text("Проверить оплату", `crypto_check_${orderId}`)
        .row()
        .text("Отменить оплату", `payment_cancel_${orderId}`)
        .row()
        .text("Главное меню", "main_menu");
}

// --- BOT SETUP ---
export function createBot(options?: { sessionStorage?: StorageAdapter<SessionData>; botInfo?: unknown; client?: unknown }) {
    const bot = new Bot<MyContext>(CONFIG.BOT_TOKEN, {
        botInfo: options?.botInfo as any,
        client: options?.client as any,
    });
    ensureSessionsDir();

    const storage = options?.sessionStorage ?? new FileAdapter({ dirName: SESSIONS_DIR });
    bot.use(session<SessionData, Context>({
        initial: createInitialSession,
        storage,
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
        config.game = config.game ?? GAMES.RAILROAD.GAME_KEY;
        config.themeId = getThemeForGame(config.game);
        if (!Number.isFinite(config.startingBalance ?? NaN)) {
            config.startingBalance = getDefaultBalanceForGame(config.game);
        }
        if (ctx.from) await DB.logAction(ctx.from.id, 'auto_select_theme', config.themeId);
    });

    // 2. GEO Selection
    const geoKeyboard = new InlineKeyboard();
    GEOS.forEach((g, index) => {
        geoKeyboard.text(g.name, `geo_${g.id}`);
        if (index % 2 !== 0) geoKeyboard.row();
    });
    geoKeyboard.row().text("📝 Заказать своё GEO", "geo_custom");
    geoKeyboard.row().text("Отмена", "main_menu");

    await ctx.reply("🌍 <b>Выберите GEO и валюту:</b>", {
        parse_mode: "HTML",
        reply_markup: geoKeyboard
    });

    const geoCtx = await conversation.waitForCallbackQuery([/^geo_/, "main_menu"], {
        maxMilliseconds: ORDER_WIZARD_TIMEOUT_MS,
        otherwise: async (waitCtx) => {
            if (waitCtx.callbackQuery) {
                await waitCtx.answerCallbackQuery({
                    text: "Выберите GEO кнопками или нажмите Отмена.",
                    show_alert: false,
                }).catch(() => {});
            }
        },
    });
    await geoCtx.answerCallbackQuery();
    const geoPayload = geoCtx.callbackQuery.data;
    if (geoPayload === "main_menu") {
        await ctx.reply("Заказ отменён. Возвращаю в главное меню.", {
            reply_markup: mainMenuNav,
        });
        return;
    }
    const geoData = geoPayload.replace("geo_", "");

    if (geoData === "custom") {
        const pendingCount = await prisma.order.count({
            where: { userId: BigInt(ctx.from!.id), status: "custom_pending" }
        });

        if (pendingCount >= 3) {
            await ctx.reply("⏳ <b>У вас уже есть 3 активных запроса.</b>\nПожалуйста, дождитесь ответа техподдержки.", { parse_mode: "HTML" });
            return;
        }

        await ctx.reply("💬 <b>Опишите нужное вам GEO (язык, валюта):</b>", { parse_mode: "HTML" });
        const customCtx = await conversation.waitFor(":text", {
            maxMilliseconds: ORDER_WIZARD_TIMEOUT_MS,
            otherwise: async (waitCtx) => {
                if (waitCtx.callbackQuery) {
                    await waitCtx.answerCallbackQuery({
                        text: "Отправьте описание вашего GEO текстовым сообщением.",
                        show_alert: false,
                    }).catch(() => {});
                }
            },
        });
        const rawDescription = customCtx.msg.text ?? "";
        const description = rawDescription.trim().replace(/\s+/g, " ").slice(0, MAX_CUSTOM_GEO_DESCRIPTION);
        if (!description) {
            await ctx.reply("Запрос на кастомный GEO пустой. Начните заново из меню.", {
                reply_markup: mainMenuNav,
            });
            return;
        }

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
        config.startingBalance = getDefaultBalanceForGame(config.game);
        config.geoId = geoId;
        if (ctx.from) await DB.logAction(ctx.from.id, 'select_geo', geoId);
    });

    await ctx.reply("✅ <b>Настройки GEO применены!</b>", { parse_mode: "HTML" });

    await ctx.reply(
        "🔗 <b>Отправьте CTA-ссылку для редиректа</b>\nПример: <code>https://example.com</code>",
        { parse_mode: "HTML" },
    );

    let ctaUrl: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        const ctaCtx = await conversation.waitFor(":text", {
            maxMilliseconds: ORDER_WIZARD_TIMEOUT_MS,
            otherwise: async (waitCtx) => {
                if (waitCtx.callbackQuery) {
                    await waitCtx.answerCallbackQuery({
                        text: "Отправьте CTA-ссылку текстом.",
                        show_alert: false,
                    }).catch(() => {});
                }
            },
        });

        ctaUrl = normalizeCtaUrl(ctaCtx.msg.text ?? "");
        if (ctaUrl) break;

        await ctx.reply(
            "Некорректная ссылка. Отправьте валидный http/https URL, например https://example.com",
            { parse_mode: "HTML" },
        );
    }

    if (!ctaUrl) {
        await ctx.reply("CTA-ссылка не задана. Начните заказ заново из главного меню.", {
            reply_markup: mainMenuNav,
        });
        return;
    }

    await conversation.external(async () => {
        const config = getSessionConfig(ctx);
        config.clickUrl = ctaUrl as string;
        if (ctx.from) await DB.logAction(ctx.from.id, "set_click_url", ctaUrl as string);
    });
    getSessionConfig(ctx).clickUrl = ctaUrl as string;

    await ctx.reply("✅ <b>CTA-ссылка сохранена</b>", { parse_mode: "HTML" });
    
    // Show summary and button
    const summary = buildOrderSummary(getSessionConfig(ctx));
    await ctx.reply(summary || "<b>Проверьте настройки заказа и создайте превью.</b>", {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
            .text("🚀 СОЗДАТЬ ПРЕВЬЮ", "gen_preview")
            .row()
            .text("🏠 Главное меню", "main_menu")
    });
}

export function registerHandlers(bot: Bot<MyContext>) {
    let botUsernameCache: string | null = null;

    async function getBotUsername() {
        if (botUsernameCache) return botUsernameCache;
        const me = await bot.api.getMe();
        botUsernameCache = me.username ?? "bot";
        return botUsernameCache;
    }

    function buildCancelledOrderKeyboard() {
        return new InlineKeyboard()
            .text("🎮 Новый заказ", "order")
            .row()
            .text("🏠 Главное меню", "main_menu");
    }

    function buildCancelPaymentKeyboard(orderId: string) {
        return new InlineKeyboard()
            .text("Отменить оплату", `payment_cancel_${orderId}`)
            .row()
            .text("Главное меню", "main_menu");
    }

    function isOrderCancelled(order: { status: string } | null): boolean {
        return order?.status === ORDER_STATUS_CANCELLED;
    }

    async function getEffectiveDiscountForGame(userId: number, gameKey: string | undefined) {
        const stats = await DB.getUserStats(userId);
        const loyaltyDiscount = getDiscount(stats.orders_paid);
        const category = ORDERABLE_BY_GAME_KEY.get(gameKey ?? "")?.category;
        const categoryDiscount = category ? await DB.getCategoryDiscount(category) : 0;
        const discount = Math.max(loyaltyDiscount, categoryDiscount);

        return {
            stats,
            loyaltyDiscount,
            categoryDiscount,
            discount,
        };
    }

    async function showMainMenu(ctx: Context, deletePrevious = false) {
        if (deletePrevious) {
            try { await ctx.deleteMessage(); } catch {}
        }

        const welcomePath = path.join(BOT_ASSETS_DIR, "welcomer.png");
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

    bot.use(createConversation(orderWizard, {
        id: "orderWizard",
        maxMillisecondsToWait: ORDER_WIZARD_TIMEOUT_MS,
    }));

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

        const previewCacheKey = `product_preview_v2_${GAMES.RAILROAD.GAME_KEY}`;
        const previewPath = findExistingPreviewPath(GAMES.RAILROAD.GAME_KEY);
        const pricing = await getEffectiveDiscountForGame(ctx.from.id, GAMES.RAILROAD.GAME_KEY);
        const singlePrice = calcPrice(CONFIG.PRICES.single, pricing.discount);
        const caption =
            "<b>🚂 Chicken Railroad</b>\n\n" +
            "Увлекательная игра, где нужно строить пути для курочки! " +
            "Отличный выбор для повышения вовлеченности.\n\n" +
            formatPriceCaption(CONFIG.PRICES.single, pricing.discount);

        const keyboard = new InlineKeyboard()
            .text("💳 Купить ($" + singlePrice + ")", "buy_check_railroad")
            .row()
            .text("🔙 Назад", CATEGORIES.CHICKEN);

        try {
            // Delete the previous menu message to avoid duplication/stacking
            try { await ctx.deleteMessage(); } catch {}

            const cachedId = await DB.getAsset(previewCacheKey);
            if (cachedId) {
                await ctx.replyWithPhoto(cachedId, {
                    caption: caption,
                    parse_mode: "HTML",
                    reply_markup: keyboard
                });
            } else if (previewPath) {
                const msg = await ctx.replyWithPhoto(new InputFile(previewPath), {
                    caption: caption,
                    parse_mode: "HTML",
                    reply_markup: keyboard
                });
                const fileId = msg.photo?.[msg.photo.length - 1]?.file_id;
                if (fileId) {
                    await DB.setAsset(previewCacheKey, fileId);
                    console.log(`[Cache] Cached asset '${previewCacheKey}': ${fileId}`);
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

    async function showProductPhotoCard(ctx: MyContext, game: OrderableGame) {
        const pricing = await getEffectiveDiscountForGame(ctx.from!.id, game.key);
        const singlePrice = calcPrice(CONFIG.PRICES.single, pricing.discount);
        const caption = `<b>${game.title}</b>\n\n${game.description}\n\n${formatPriceCaption(CONFIG.PRICES.single, pricing.discount)}`;
        const keyboard = new InlineKeyboard()
            .text(`💳 Купить ($${singlePrice})`, game.buyCallback)
            .row()
            .text("🔙 Назад", game.category);
        const cacheKey = `product_preview_v2_${game.key}`;
        const previewPath = findExistingPreviewPath(game.key);

        try {
            try { await ctx.deleteMessage(); } catch {}

            const cachedId = await DB.getAsset(cacheKey);
            if (cachedId) {
                await ctx.replyWithPhoto(cachedId, {
                    caption,
                    parse_mode: "HTML",
                    reply_markup: keyboard,
                });
                return;
            }

            if (previewPath) {
                const msg = await ctx.replyWithPhoto(new InputFile(previewPath), {
                    caption,
                    parse_mode: "HTML",
                    reply_markup: keyboard,
                });
                const fileId = msg.photo?.[msg.photo.length - 1]?.file_id;
                if (fileId) {
                    await DB.setAsset(cacheKey, fileId);
                }
                return;
            }
        } catch (e) {
            console.error(`Error sending photo preview for ${game.key}:`, e);
        }

        await ctx.reply(caption, {
            parse_mode: "HTML",
            reply_markup: keyboard,
        });
    }

    // 3.2 Product pages for ready templates
    for (const g of ORDERABLE_GAMES.filter((game) => game.id !== GAMES.RAILROAD.ID)) {
        bot.callbackQuery(g.id, async (ctx) => {
            if (!ctx.from) return;
            await ctx.answerCallbackQuery();
            await DB.logAction(ctx.from.id, "view_product", g.key);
            await showProductPhotoCard(ctx, g);
        });
    }

    // 3.3 Placeholder for not-ready templates
    bot.callbackQuery(GAMES.PLINKO.ID, async (ctx) => {
        await ctx.answerCallbackQuery();
        await editOrReply(
            ctx,
            `<b>🎱 Classic Plinko</b>\n\nВ разработке! Скоро будет доступно. 🚧`,
            new InlineKeyboard().text("🔙 Назад", CATEGORIES.PLINKO),
        );
    });

    // 4. Buy Check -> Wizard
    bot.callbackQuery(/^buy_check_/, async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();
        const callback = ctx.callbackQuery.data;
        const game = ORDERABLE_BY_BUY_CALLBACK.get(callback);
        if (!game) return editOrReply(ctx, "Некорректный выбор игры.", withBackToMenu);

        const pricing = await getEffectiveDiscountForGame(ctx.from.id, game.key);
        const minPrice = calcPrice(CONFIG.PRICES.single, pricing.discount);
        const cryptoEnabled = isCryptoPayEnabled();

        if (!cryptoEnabled && pricing.stats.wallet_balance < minPrice) {
            await ctx.reply(
                `Недостаточно средств на балансе.\nВаш баланс: $${pricing.stats.wallet_balance}\nТребуется: $${minPrice}\n\nПожалуйста, пополните счёт.`,
                {
                    parse_mode: "HTML",
                    reply_markup: new InlineKeyboard().text("🔙 Назад", "delete_this")
                }
            );
            return;
        }

        await DB.logAction(ctx.from.id, "select_game", game.key);
        ctx.session.config = {
            game: game.key,
            themeId: game.theme,
            startingBalance: getDefaultBalanceForGame(game.key),
        };
        await ctx.conversation.enter("orderWizard");
    });

    bot.callbackQuery("gen_preview", async (ctx) => {
        if (!ctx.from) return;
        if (ctx.session.previewInProgress) {
            await ctx.answerCallbackQuery({
                text: "Генерация уже выполняется. Подождите.",
                show_alert: false,
            }).catch(() => {});
            return;
        }

        ctx.session.previewInProgress = true;
        await ctx.answerCallbackQuery();
        let orderId: string | null = null;
        try {
            await DB.logAction(ctx.from.id, "gen_preview");

            const c = getSessionConfig(ctx);
            if (!c.themeId) return editOrReply(ctx, "Нет активной конфигурации.", withBackToMenu);
            let validClickUrl = normalizeCtaUrl(c.clickUrl ?? "");
            if (!validClickUrl) {
                const lastClickLog = await DB.getLastLogByAction(ctx.from.id, "set_click_url");
                const restoredClickUrl = normalizeCtaUrl(lastClickLog?.details ?? "");
                if (restoredClickUrl) {
                    c.clickUrl = restoredClickUrl;
                    validClickUrl = restoredClickUrl;
                    await DB.logAction(ctx.from.id, "restore_click_url", restoredClickUrl);
                }
            }
            if (!validClickUrl) {
                return editOrReply(ctx, "Нужна CTA-ссылка. Начните заказ заново и укажите корректную ссылку.", withBackToMenu);
            }
            c.clickUrl = validClickUrl;

            orderId = "ord_" + ctx.from.id + "_" + Date.now();
            await DB.createOrder(orderId, ctx.from.id, c.game ?? "railroad", c.themeId, c);

            await editOrReply(ctx, "Генерация превью...");

            // Use library only when order has no per-user click URL.
            const libPath = canUseLibraryArtifact(c.clickUrl)
                ? getLibraryPath(c.game ?? "railroad", c.geoId ?? "en_usd", true)
                : null;
            let generatedPath: string | null = null;

            if (libPath) {
                generatedPath = libPath;
                console.log(`[Library] Using pre-built preview: ${libPath}`);
            } else {
                generatedPath = await generatePlayable({
                    id: orderId,
                    config: {
                        game: c.game ?? GAMES.RAILROAD.GAME_KEY,
                        themeId: c.themeId,
                        language: c.language || "en",
                        currency: c.currency || DEFAULT_CURRENCY,
                        startingBalance: c.startingBalance ?? DEFAULT_STARTING_BALANCE,
                        clickUrl: c.clickUrl,
                        isWatermarked: true
                    }
                });
            }

            if (generatedPath) {
                const pricing = await getEffectiveDiscountForGame(ctx.from.id, c.game ?? GAMES.RAILROAD.GAME_KEY);
                const p1 = calcPrice(CONFIG.PRICES.single, pricing.discount);
                const p2 = calcPrice(CONFIG.PRICES.sub, pricing.discount);
                const singleLine = pricing.discount > 0
                    ? `Разово: <s>$${CONFIG.PRICES.single}</s> <b>$${p1}</b>`
                    : `Разово: $${p1}`;
                const subLine = pricing.discount > 0
                    ? `Подписка: <s>$${CONFIG.PRICES.sub}</s> <b>$${p2}</b>`
                    : `Подписка: $${p2}`;
                const discountCaption = pricing.discount > 0
                    ? `Скидка: ${pricing.discount}%`
                    : "Скидка: 0%";

                await ctx.replyWithDocument(new InputFile(generatedPath), {
                    caption: `Превью (с водяным знаком)\n${discountCaption}\n${singleLine}\n${subLine}`,
                    parse_mode: "HTML",
                    reply_markup: new InlineKeyboard()
                        .text("💳 Купить разово ($ " + p1 + ")", "pay_single_" + orderId)
                        .row()
                        .text("⭐ Подписка ($ " + p2 + ")", "pay_sub_" + orderId)
                        .row()
                        .text("Оплатить напрямую (BTC/USDT)", "manual_pay_menu_" + orderId)
                        .row()
                        .text("🏠 Главное меню", "main_menu")
                });
            } else {
                await DB.setOrderStatus(orderId, "preview_failed").catch(() => {});
                await editOrReply(ctx, "Ошибка генерации файла.", withBackToMenu);
            }
        } catch (e) {
            console.error("Preview generation error:", e);
            if (orderId) {
                await DB.setOrderStatus(orderId, "preview_failed").catch(() => {});
            }
            await editOrReply(ctx, "Ошибка генерации превью. Попробуйте снова через минуту.", withBackToMenu);
        } finally {
            ctx.session.previewInProgress = false;
        }
    });

    async function buildFinalOrderPath(orderId: string, order: any): Promise<string | null> {
        const libPath = canUseLibraryArtifact(order.config.clickUrl)
            ? getLibraryPath(order.gameType, order.config.geoId ?? "en_usd", false)
            : null;
        if (libPath) {
            console.log(`[Library] Delivering pre-built final: ${libPath}`);
            return libPath;
        }

        return generatePlayable({
            id: orderId + "_final",
            config: {
                ...order.config,
                isWatermarked: false
            }
        });
    }

    async function deliverFinalOrder(ctx: MyContext, orderId: string, order: any, statusText: string) {
        await editOrReply(ctx, statusText);
        const finalPath = await buildFinalOrderPath(orderId, order);

        if (finalPath) {
            await ctx.replyWithDocument(new InputFile(finalPath), {
                caption: "Ваш файл без водяного знака готов! 🚀",
                parse_mode: "HTML",
                reply_markup: mainMenuNav
            });
            return;
        }

        await editOrReply(ctx, "Ошибка сборки.", withBackToMenu);
    }

    function getStoredCryptoPayment(order: any): {
        invoiceId: number;
        amount: number;
        discount: number;
        type: "single" | "sub";
        payUrl: string;
    } | null {
        const config = order?.config;
        if (!config || typeof config !== "object" || Array.isArray(config)) return null;
        const payment = (config as Record<string, unknown>).payment;
        if (!payment || typeof payment !== "object" || Array.isArray(payment)) return null;

        const data = payment as Record<string, unknown>;
        if (data.provider !== "crypto_pay") return null;

        const invoiceId = Number(data.invoiceId);
        const amount = Number(data.amount);
        const discount = Number(data.discount);
        const type: "single" | "sub" | null =
            data.type === "sub" ? "sub" : data.type === "single" ? "single" : null;
        const payUrl = typeof data.payUrl === "string" ? data.payUrl : "";

        if (!type || !Number.isFinite(invoiceId) || invoiceId <= 0) return null;
        if (!Number.isFinite(amount) || amount <= 0) return null;
        if (!Number.isFinite(discount) || discount < 0) return null;

        return {
            invoiceId,
            amount,
            discount,
            type,
            payUrl,
        };
    }

    async function getDiscountedAmount(userId: number, paymentType: "single" | "sub", gameKey?: string) {
        const pricing = await getEffectiveDiscountForGame(userId, gameKey);
        const discount = pricing.discount;
        const amount = calcPrice(paymentType === "sub" ? CONFIG.PRICES.sub : CONFIG.PRICES.single, discount);
        return { amount, discount };
    }

    bot.callbackQuery(/^payment_cancel_/, async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();

        const orderId = ctx.callbackQuery.data.replace("payment_cancel_", "");
        if (!orderId) return editOrReply(ctx, "Некорректная ссылка оплаты.", withBackToMenu);

        const order = await DB.getOrder(orderId);
        if (!order || order.userId !== BigInt(ctx.from.id)) {
            return editOrReply(ctx, "Заказ не найден.", withBackToMenu);
        }

        if (order.status.startsWith("paid")) {
            return editOrReply(ctx, "Оплата уже подтверждена. Отмена недоступна.", mainMenuNav);
        }

        if (isOrderCancelled(order)) {
            return editOrReply(ctx, CANCELLED_ORDER_TEXT, buildCancelledOrderKeyboard());
        }

        await DB.setOrderStatus(orderId, ORDER_STATUS_CANCELLED);
        if (ctx.session.pendingManualPayment?.orderId === orderId) {
            delete ctx.session.pendingManualPayment;
        }
        await DB.logAction(ctx.from.id, "payment_cancelled_by_user", orderId);

        await editOrReply(
            ctx,
            "Оплата отменена, заказ переведён в статус cancelled.",
            buildCancelledOrderKeyboard(),
        );
    });

    bot.callbackQuery(/^manual_pay_menu_/, async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();

        const orderId = ctx.callbackQuery.data.replace("manual_pay_menu_", "");
        if (!orderId) return editOrReply(ctx, "Некорректная ссылка оплаты.", withBackToMenu);

        const order = await DB.getOrder(orderId);
        if (!order || order.userId !== BigInt(ctx.from.id)) {
            return editOrReply(ctx, "Заказ не найден.", withBackToMenu);
        }
        if (isOrderCancelled(order)) {
            return editOrReply(ctx, CANCELLED_ORDER_TEXT, buildCancelledOrderKeyboard());
        }

        const single = await getDiscountedAmount(ctx.from.id, "single", order.gameType);
        const sub = await getDiscountedAmount(ctx.from.id, "sub", order.gameType);

        await DB.logAction(ctx.from.id, "manual_pay_menu_open", orderId);

        await editOrReply(
            ctx,
            "Выберите тип прямой оплаты. После перевода отправьте TX hash или скриншот для ручной проверки.",
            new InlineKeyboard()
                .text(`Разово $${single.amount}`, `manual_pay_single_${orderId}`)
                .row()
                .text(`Подписка $${sub.amount}`, `manual_pay_sub_${orderId}`)
                .row()
                .text("Главное меню", "main_menu"),
        );
    });

    bot.callbackQuery(/^manual_pay_(single|sub)_/, async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();

        const match = ctx.callbackQuery.data.match(/^manual_pay_(single|sub)_(.+)$/);
        if (!match) return editOrReply(ctx, "Некорректная ссылка оплаты.", withBackToMenu);
        const paymentType = match[1] as "single" | "sub";
        const orderId = match[2];

        const order = await DB.getOrder(orderId);
        if (!order || order.userId !== BigInt(ctx.from.id)) {
            return editOrReply(ctx, "Заказ не найден.", withBackToMenu);
        }
        if (isOrderCancelled(order)) {
            return editOrReply(ctx, CANCELLED_ORDER_TEXT, buildCancelledOrderKeyboard());
        }

        const { amount, discount } = await getDiscountedAmount(ctx.from.id, paymentType, order.gameType);
        await DB.updateOrderConfig(orderId, {
            manualPayment: {
                provider: "direct_wallet",
                type: paymentType,
                amount,
                discount,
                state: "awaiting_transfer",
                updatedAt: new Date().toISOString(),
            },
        });
        await DB.setOrderStatus(orderId, "manual_transfer_pending");
        await DB.logAction(ctx.from.id, "manual_payment_requested", `${orderId}:${paymentType}:$${amount}`);

        const message =
            `<b>Прямая оплата заказа ${orderId}</b>\n\n` +
            `<b>Сумма:</b> $${amount}\n` +
            `<b>USDT TRC-20:</b>\n<code>${CONFIG.WALLETS.usdt_trc20}</code>\n\n` +
            `<b>BTC:</b>\n<code>${CONFIG.WALLETS.btc}</code>\n\n` +
            `После перевода нажмите <b>Я оплатил</b> и отправьте TX hash или скриншот.`;

        await editOrReply(
            ctx,
            message,
            new InlineKeyboard()
                .text("Я оплатил", `manual_paid_${paymentType}_${orderId}`)
                .row()
                .text("Назад", `manual_pay_menu_${orderId}`)
                .row()
                .text("Главное меню", "main_menu"),
        );
    });

    bot.callbackQuery(/^manual_paid_(single|sub)_/, async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();

        const match = ctx.callbackQuery.data.match(/^manual_paid_(single|sub)_(.+)$/);
        if (!match) return editOrReply(ctx, "Некорректная ссылка оплаты.", withBackToMenu);
        const paymentType = match[1] as "single" | "sub";
        const orderId = match[2];

        const order = await DB.getOrder(orderId);
        if (!order || order.userId !== BigInt(ctx.from.id)) {
            return editOrReply(ctx, "Заказ не найден.", withBackToMenu);
        }
        if (isOrderCancelled(order)) {
            return editOrReply(ctx, CANCELLED_ORDER_TEXT, buildCancelledOrderKeyboard());
        }

        const { amount } = await getDiscountedAmount(ctx.from.id, paymentType, order.gameType);
        ctx.session.pendingManualPayment = { orderId, paymentType, amount };
        await DB.setOrderStatus(orderId, "manual_proof_requested");
        await DB.logAction(ctx.from.id, "manual_payment_waiting_proof", `${orderId}:${paymentType}:$${amount}`);

        await editOrReply(
            ctx,
            "Отправьте TX hash текстом или скриншот фото/документом.\nЧтобы отменить, отправьте /cancel.",
            new InlineKeyboard().text("Главное меню", "main_menu"),
        );
    });

    bot.on("message", async (ctx, next) => {
        if (!ctx.from) return next();
        const pending = ctx.session.pendingManualPayment;
        if (!pending) return next();

        const message = ctx.msg;
        if (!message) return next();

        const text = "text" in message && typeof message.text === "string" ? message.text.trim() : "";
        const hasPhoto = "photo" in message && Array.isArray(message.photo) && message.photo.length > 0;
        const hasDocument = "document" in message && !!message.document;

        if (text.toLowerCase() === "/cancel") {
            delete ctx.session.pendingManualPayment;
            await DB.logAction(ctx.from.id, "manual_payment_proof_cancelled", pending.orderId);
            await ctx.reply("Запрос на ручную оплату отменён.", { reply_markup: mainMenuNav });
            return;
        }

        if (!text && !hasPhoto && !hasDocument) {
            await ctx.reply("Отправьте TX hash (текст) или скриншот (фото/документ).");
            return;
        }

        const order = await DB.getOrder(pending.orderId);
        if (!order || order.userId !== BigInt(ctx.from.id)) {
            delete ctx.session.pendingManualPayment;
            await ctx.reply("Заказ не найден. Начните заново из главного меню.", { reply_markup: mainMenuNav });
            return;
        }
        if (isOrderCancelled(order)) {
            delete ctx.session.pendingManualPayment;
            await ctx.reply(CANCELLED_ORDER_TEXT, { reply_markup: buildCancelledOrderKeyboard() });
            return;
        }

        const proofType = text ? "text" : hasPhoto ? "photo" : "document";
        const proofText = text ? text.slice(0, 1000) : "";

        await DB.updateOrderConfig(pending.orderId, {
            manualPayment: {
                provider: "direct_wallet",
                type: pending.paymentType,
                amount: pending.amount,
                state: "pending_admin_review",
                proofType,
                proofText: proofText || undefined,
                proofMessageId: message.message_id,
                submittedAt: new Date().toISOString(),
            },
        });
        await DB.setOrderStatus(pending.orderId, `manual_review_${pending.paymentType}`);
        await DB.logAction(ctx.from.id, "manual_payment_proof_submitted", `${pending.orderId}:${pending.paymentType}:$${pending.amount}`);

        const safeFirstName = escapeHtml(ctx.from.first_name || "Без имени");
        const safeUsername = escapeHtml(ctx.from.username || "нет");
        const safeProof = proofText ? escapeHtml(proofText) : "(смотрите пересланное сообщение)";

        const adminMessage =
            "<b>Получено подтверждение ручной оплаты</b>\n\n" +
            `<b>Заказ:</b> <code>${escapeHtml(pending.orderId)}</code>\n` +
            `<b>Пользователь:</b> ${safeFirstName} (@${safeUsername})\n` +
            `<b>ID пользователя:</b> <code>${ctx.from.id}</code>\n` +
            `<b>Тип:</b> ${pending.paymentType}\n` +
            `<b>Сумма:</b> $${pending.amount}\n` +
            `<b>Доказательство:</b> ${safeProof}\n\n` +
            `Или используйте /grantorder ${escapeHtml(pending.orderId)} для ручной выдачи.`;

        try {
            await bot.api.sendMessage(CONFIG.ADMIN_TELEGRAM_ID, adminMessage, {
                parse_mode: "HTML",
                reply_markup: new InlineKeyboard()
                    .text("✅ Одобрить", `admin_manual_approve_${pending.orderId}`)
                    .row()
                    .text("❌ Отклонить", `admin_manual_reject_${pending.orderId}`),
            });
            if (ctx.chat) {
                await bot.api.forwardMessage(CONFIG.ADMIN_TELEGRAM_ID, ctx.chat.id, message.message_id);
            }
        } catch (e) {
            console.error("Failed to notify admin about manual payment proof:", e);
        }

        await ctx.reply("Подтверждение отправлено админу. После проверки вы получите готовый файл.", {
            reply_markup: mainMenuNav,
        });
        delete ctx.session.pendingManualPayment;
    });

    bot.callbackQuery(/^crypto_check_/, async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();

        const orderId = ctx.callbackQuery.data.replace("crypto_check_", "");
        if (!orderId) return editOrReply(ctx, "Некорректная ссылка проверки оплаты.", withBackToMenu);

        const order = await DB.getOrder(orderId);
        if (!order) return editOrReply(ctx, "Заказ не найден.", withBackToMenu);
        if (order.userId !== BigInt(ctx.from.id)) return editOrReply(ctx, "Заказ не найден.", withBackToMenu);
        if (isOrderCancelled(order)) {
            return editOrReply(ctx, CANCELLED_ORDER_TEXT, buildCancelledOrderKeyboard());
        }

        const payment = getStoredCryptoPayment(order);
        if (!payment) {
            return editOrReply(
                ctx,
                "Инвойс не найден. Отмените оплату и создайте новый заказ.",
                buildCancelPaymentKeyboard(orderId),
            );
        }

        if (order.status.startsWith("paid")) {
            await deliverFinalOrder(ctx, orderId, order, "Оплата уже подтверждена. Собираю финальный файл...");
            return;
        }

        await DB.logAction(ctx.from.id, "crypto_pay_check", `${orderId}:${payment.invoiceId}`);

        try {
            const invoice = await getCryptoPayInvoice(payment.invoiceId);
            if (!invoice) {
                return editOrReply(
                    ctx,
                    "Инвойс не найден в Crypto Pay. Отмените оплату и создайте новый заказ.",
                    buildCancelPaymentKeyboard(orderId),
                );
            }

            const status = invoice.status.toLowerCase();
            if (status !== "paid") {
                const keyboard = invoice.payUrl
                    ? buildCryptoInvoiceKeyboard(orderId, invoice.payUrl)
                    : buildCancelPaymentKeyboard(orderId);
                return editOrReply(ctx, `Статус оплаты: ${invoice.status}. Завершите оплату и нажмите проверку снова.`, keyboard);
            }

            let alreadyPaid = false;
            try {
                await DB.finalizeExternalPaidOrder(orderId, ctx.from.id, "paid_" + payment.type, payment.amount, payment.discount);
                await DB.addReferralReward(ctx.from.id, payment.amount);
                await DB.logAction(ctx.from.id, "pay_success_crypto", "$" + payment.amount);
            } catch (e) {
                const msg = e instanceof Error ? e.message : "UNKNOWN_ERROR";
                if (msg === "ORDER_ALREADY_PAID") {
                    alreadyPaid = true;
                } else if (msg === "ORDER_NOT_FOUND" || msg === "ORDER_USER_MISMATCH") {
                    return editOrReply(ctx, "Заказ не найден.", withBackToMenu);
                } else {
                    console.error("Crypto payment finalize error:", e);
                    return editOrReply(ctx, "Ошибка обработки оплаты.", withBackToMenu);
                }
            }

            const freshOrder = await DB.getOrder(orderId);
            if (!freshOrder) return editOrReply(ctx, "Заказ не найден.", withBackToMenu);

            await deliverFinalOrder(
                ctx,
                orderId,
                freshOrder,
                alreadyPaid
                    ? "Оплата уже подтверждена. Собираю финальный файл..."
                    : "Оплата прошла! Собираю финальный файл...",
            );
        } catch (e) {
            console.error("Crypto payment check error:", e);
            await editOrReply(ctx, "Не удалось проверить оплату. Попробуйте ещё раз.", withBackToMenu);
        }
    });

    bot.callbackQuery(/^pay_/, async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();
        const parsed = parsePayCallback(ctx.callbackQuery.data);
        if (!parsed) return editOrReply(ctx, "Некорректная ссылка оплаты.", withBackToMenu);

        const order = await DB.getOrder(parsed.orderId);
        if (!order) return editOrReply(ctx, "Заказ не найден.", withBackToMenu);
        if (order.userId !== BigInt(ctx.from.id)) return editOrReply(ctx, "Заказ не найден.", withBackToMenu);
        if (isOrderCancelled(order)) {
            return editOrReply(ctx, CANCELLED_ORDER_TEXT, buildCancelledOrderKeyboard());
        }

        await DB.logAction(ctx.from.id, "pay_click", parsed.type);

        if (isCryptoPayEnabled()) {
            if (order.status.startsWith("paid")) {
                await deliverFinalOrder(ctx, parsed.orderId, order, "Оплата уже подтверждена. Собираю финальный файл...");
                return;
            }

            const { amount, discount: disc } = await getDiscountedAmount(ctx.from.id, parsed.type, order.gameType);

            try {
                const invoice = await createCryptoPayInvoice({
                    amountUsd: amount,
                    description: `Оплата заказа ${order.orderId} (${parsed.type})`,
                    payload: `${parsed.orderId}:${ctx.from.id}:${parsed.type}`,
                    expiresInSeconds: 3600,
                });

                await DB.updateOrderConfig(parsed.orderId, {
                    payment: {
                        provider: "crypto_pay",
                        invoiceId: invoice.invoiceId,
                        payUrl: invoice.payUrl,
                        type: parsed.type,
                        amount,
                        discount: disc,
                        createdAt: new Date().toISOString(),
                    },
                });

                await DB.logAction(ctx.from.id, "crypto_invoice_created", `${parsed.orderId}:${invoice.invoiceId}:$${amount}`);

                await editOrReply(
                    ctx,
                    `Инвойс создан на $${amount}. Оплатите и нажмите «Проверить оплату».`,
                    buildCryptoInvoiceKeyboard(parsed.orderId, invoice.payUrl),
                );
            } catch (e) {
                console.error("Crypto invoice create error:", e);
                await editOrReply(
                    ctx,
                    "Не удалось создать инвойс Crypto Pay. Проверьте токен/настройки и попробуйте снова.",
                    withBackToMenu,
                );
            }
            return;
        }

        let alreadyPaid = false;
        if (order.status.startsWith("paid")) {
            alreadyPaid = true;
        }

        if (!alreadyPaid) {
            const pricing = await getEffectiveDiscountForGame(ctx.from.id, order.gameType);
            const disc = pricing.discount;
            const amount = calcPrice(parsed.type === "sub" ? CONFIG.PRICES.sub : CONFIG.PRICES.single, disc);

            if (pricing.stats.wallet_balance < amount) {
                return editOrReply(
                    ctx,
                    `Недостаточно средств на балансе.\nВаш баланс: $${pricing.stats.wallet_balance}\nТребуется: $${amount}\n\nПожалуйста, пополните счёт.`,
                    withBackToMenu
                );
            }

            let finalized = false;
            try {
                await DB.finalizePaidOrder(parsed.orderId, ctx.from.id, "paid_" + parsed.type, amount, disc);
                finalized = true;
            } catch (e) {
                const msg = e instanceof Error ? e.message : "UNKNOWN_ERROR";
                if (msg === "ORDER_ALREADY_PAID") {
                    alreadyPaid = true;
                } else if (msg === "INSUFFICIENT_FUNDS") {
                    return editOrReply(
                        ctx,
                        `Недостаточно средств на балансе.\nВаш баланс: $${pricing.stats.wallet_balance}\nТребуется: $${amount}\n\nПожалуйста, пополните счёт.`,
                        withBackToMenu
                    );
                } else if (msg === "ORDER_NOT_FOUND" || msg === "ORDER_USER_MISMATCH") {
                    return editOrReply(ctx, "Заказ не найден.", withBackToMenu);
                } else {
                    console.error("Payment finalize error:", e);
                    return editOrReply(ctx, "Ошибка обработки оплаты.", withBackToMenu);
                }
            }

            if (finalized) {
                await DB.addReferralReward(ctx.from.id, amount);
                await DB.logAction(ctx.from.id, "pay_success", "$" + amount);
            }
        }

        await deliverFinalOrder(
            ctx,
            parsed.orderId,
            order,
            alreadyPaid
                ? "Оплата уже подтверждена. Собираю финальный файл..."
                : "Оплата прошла! Собираю финальный файл...",
        );
    });

    bot.callbackQuery("profile", async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();
        const s = await DB.getUserStats(ctx.from.id);
        const botUsername = await getBotUsername();
        const msgText = buildProfileMessage(ctx.from.id, s.orders_paid, s.wallet_balance, botUsername);

        const profilePath = path.join(BOT_ASSETS_DIR, "profile.png");
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
            "После оплаты нажмите кнопку <b>«Я оплатил»</b>. Мы проверим транзакцию и зачислим баланс.";

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
        await editOrReply(ctx, "<b>Заявка отправлена!</b>\n\nАдминистратор скоро проверит платёж и зачислит средства на ваш баланс. Обычно это занимает от 5 до 30 минут.", new InlineKeyboard().text("🏠 Главное меню", "main_menu"));
        
        // Notify admin
        const safeFirstName = escapeHtml(ctx.from.first_name || "Без имени");
        const safeUsername = escapeHtml(ctx.from.username || "нет");
        const adminMsg = "🔔 <b>Новое уведомление об оплате!</b>\n\n" +
            "<b>От:</b> " + safeFirstName + " (@" + safeUsername + ")\n" +
            "<b>ID:</b> <code>" + ctx.from.id + "</code>\n\n" +
            "Проверьте входящие транзакции.";
        
        try {
            await bot.api.sendMessage(CONFIG.ADMIN_TELEGRAM_ID, adminMsg, { parse_mode: "HTML" });
        } catch (e) {
            console.error("Failed to notify admin:", e);
        }
    });

    async function approveManualOrder(orderId: string) {
        const order = await DB.getOrder(orderId);
        if (!order) return { ok: false, message: "Заказ не найден." };

        const cfg = order.config && typeof order.config === "object" ? (order.config as Record<string, unknown>) : {};
        const manualPayment =
            cfg.manualPayment && typeof cfg.manualPayment === "object" && !Array.isArray(cfg.manualPayment)
                ? (cfg.manualPayment as Record<string, unknown>)
                : null;

        const paymentType =
            manualPayment?.type === "sub" ? "sub" : manualPayment?.type === "single" ? "single" : "single";
        const amount = Number(manualPayment?.amount ?? 0);
        const discount = Number(manualPayment?.discount ?? 0);
        const normalizedAmount = Number.isFinite(amount) && amount >= 0 ? amount : 0;
        const normalizedDiscount = Number.isFinite(discount) && discount >= 0 ? discount : 0;

        if (!order.status.startsWith("paid")) {
            await DB.markPaid(orderId, "paid_manual_" + paymentType, normalizedAmount, normalizedDiscount);
            await DB.updateOrderConfig(orderId, {
                manualPayment: {
                    ...(manualPayment ?? {}),
                    state: "approved",
                    approvedAt: new Date().toISOString(),
                },
            });
            await DB.logAction(order.userId, "admin_manual_payment_approved", `${orderId}:$${normalizedAmount}`);
            if (normalizedAmount > 0) {
                await DB.addReferralReward(Number(order.userId), normalizedAmount);
            }
        }

        const freshOrder = await DB.getOrder(orderId);
        if (!freshOrder) return { ok: false, message: "Заказ не найден." };

        const finalPath = await buildFinalOrderPath(orderId, freshOrder);
        if (!finalPath) return { ok: false, message: "Ошибка сборки файла." };

        try {
            await bot.api.sendDocument(Number(order.userId), new InputFile(finalPath), {
                caption: "Ваш файл готов.",
                parse_mode: "HTML",
            });
            return { ok: true, message: `Заказ ${orderId} одобрен. Файл отправлен пользователю ${order.userId}.` };
        } catch (e) {
            console.error("Failed to send granted playable:", e);
            return { ok: false, message: "Не удалось отправить файл пользователю." };
        }
    }

    bot.callbackQuery(/^admin_manual_(approve|reject)_/, async (ctx) => {
        if (!ctx.from) return;
        if (ctx.from.id !== CONFIG.ADMIN_TELEGRAM_ID) {
            await ctx.answerCallbackQuery({ text: "Недостаточно прав.", show_alert: true });
            return;
        }

        const match = ctx.callbackQuery.data.match(/^admin_manual_(approve|reject)_(.+)$/);
        if (!match) {
            await ctx.answerCallbackQuery({ text: "Некорректная команда.", show_alert: true });
            return;
        }

        const action = match[1];
        const orderId = match[2];
        await ctx.answerCallbackQuery();

        if (action === "approve") {
            const result = await approveManualOrder(orderId);
            await editOrReply(ctx, result.message, mainMenuNav);
            return;
        }

        const order = await DB.getOrder(orderId);
        if (!order) return editOrReply(ctx, "Заказ не найден.", withBackToMenu);

        const cfg = order.config && typeof order.config === "object" ? (order.config as Record<string, unknown>) : {};
        const manualPayment =
            cfg.manualPayment && typeof cfg.manualPayment === "object" && !Array.isArray(cfg.manualPayment)
                ? (cfg.manualPayment as Record<string, unknown>)
                : null;

        await DB.updateOrderConfig(orderId, {
            manualPayment: {
                ...(manualPayment ?? {}),
                state: "rejected",
                rejectedAt: new Date().toISOString(),
            },
        });
        await DB.setOrderStatus(orderId, "manual_rejected");
        await DB.logAction(order.userId, "admin_manual_payment_rejected", orderId);

        try {
            await bot.api.sendMessage(
                Number(order.userId),
                `Оплата по заказу ${orderId} отклонена. Проверьте данные и отправьте новое подтверждение.`,
                { parse_mode: "HTML" },
            );
        } catch (e) {
            console.error("Failed to notify user about rejection:", e);
        }

        await editOrReply(ctx, `Заказ ${orderId} отклонён. Пользователь уведомлён.`, mainMenuNav);
    });

    // --- ADMIN COMMANDS ---
    bot.command("grantorder", async (ctx) => {
        if (!ctx.from || ctx.from.id !== CONFIG.ADMIN_TELEGRAM_ID) return;

        const orderId = String(ctx.match ?? "").trim();
        if (!orderId) return ctx.reply("Использование: /grantorder <orderId>");

        const result = await approveManualOrder(orderId);
        await ctx.reply(result.message);
    });

    bot.command("addbalance", async (ctx) => {
        if (!ctx.from || ctx.from.id !== CONFIG.ADMIN_TELEGRAM_ID) return;

        const [rawUserId = "", rawAmount = ""] = String(ctx.match ?? "").trim().split(/\s+/, 2);
        if (!rawUserId || !rawAmount) {
            return ctx.reply("Использование: /addbalance <userId> <amount>");
        }

        if (!/^\d+$/.test(rawUserId)) {
            return ctx.reply("Некорректный userId. Используйте числовой Telegram ID.");
        }

        const amount = Number(rawAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            return ctx.reply("Сумма должна быть положительным числом.");
        }

        const targetUserId = BigInt(rawUserId);

        try {
            await prisma.user.update({
                where: { id: targetUserId },
                data: { walletBalance: { increment: amount } }
            });

            await DB.logAction(targetUserId, "admin_add_balance", `Added $${amount}`);
            await ctx.reply(`Баланс пользователя ${targetUserId} увеличен на $${amount}`);

            // Notify user
            try {
                await bot.api.sendMessage(Number(targetUserId), `Ваш баланс пополнен на <b>$${amount}</b>.`, { parse_mode: "HTML" });
            } catch {}
        } catch (e) {
            await ctx.reply("Ошибка: пользователь не найден или не удалось обновить БД.");
        }
    });

    bot.callbackQuery("ref_system", async (ctx) => {
        if (!ctx.from) return;
        await ctx.answerCallbackQuery();
        const s = await DB.getUserStats(ctx.from.id);
        const botUsername = await getBotUsername();
        const link = "t.me/" + botUsername + "?start=" + ctx.from.id;
        const msg = "Реферальная система:\n" +
            "Ваша ссылка: " + link + "\n" +
            "Приглашено: " + s.referrals_count + "\n" +
            "Баланс: $" + s.wallet_balance;
        await editOrReply(ctx, msg, mainMenuNav);
    });

    bot.catch((err) => {
        const ctx = err.ctx as MyContext | undefined;
        const updateType = ctx?.update
            ? Object.keys(ctx.update).find((k) => k !== "update_id") ?? "unknown"
            : "unknown";
        const error = err.error instanceof Error ? err.error : new Error(String(err.error));

        console.error("[BotError]", {
            updateType,
            userId: ctx?.from?.id,
            callbackData: ctx?.callbackQuery?.data,
            message: error.message,
            stack: error.stack,
        });

        if (ctx?.from) {
            void DB.logAction(ctx.from.id, "bot_error", `${updateType}: ${error.message}`);
        }
    });
}

export async function start() {
    await cleanupTemp();
    const bot = createBot();
    registerHandlers(bot);
    void bot.start();
    console.log("Bot started.");
}

// ESM equivalent of require.main === module
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    void start();
}
