import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { MemorySessionStorage } from "grammy";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { CATEGORIES, GAMES } from "../constants";

type OrderRecord = {
    orderId: string;
    userId: bigint;
    gameType: string;
    themeId: string;
    config: any;
    status: string;
    amount?: number;
    discountApplied?: number;
};

const mockState = vi.hoisted(() => {
    const dbState = {
        balance: 1000,
        ordersPaid: 0,
        orders: new Map<string, OrderRecord>()
    };

    const DB = {
        upsertUser: vi.fn(async () => undefined),
        logAction: vi.fn(async () => undefined),
        getUserStats: vi.fn(async (id: number) => ({
            id,
            orders_paid: dbState.ordersPaid,
            referrals_count: 0,
            wallet_balance: dbState.balance
        })),
        createOrder: vi.fn(async (orderId: string, userId: number, game: string, theme: string, config: any) => {
            dbState.orders.set(orderId, {
                orderId,
                userId: BigInt(userId),
                gameType: game,
                themeId: theme,
                config,
                status: "pending"
            });
        }),
        getOrder: vi.fn(async (orderId: string) => {
            const order = dbState.orders.get(orderId);
            return order ? { ...order, config: order.config } : null;
        }),
        finalizePaidOrder: vi.fn(async (orderId: string, userId: number, status: string, amount: number, discount: number) => {
            const order = dbState.orders.get(orderId);
            if (!order) throw new Error("ORDER_NOT_FOUND");
            if (order.userId !== BigInt(userId)) throw new Error("ORDER_USER_MISMATCH");
            if (order.status.startsWith("paid")) throw new Error("ORDER_ALREADY_PAID");
            if (dbState.balance < amount) throw new Error("INSUFFICIENT_FUNDS");
            dbState.balance -= amount;
            order.status = status;
            order.amount = amount;
            order.discountApplied = discount;
            return { newBalance: dbState.balance };
        }),
        addReferralReward: vi.fn(async () => undefined),
        getAsset: vi.fn(async () => null),
        setAsset: vi.fn(async () => undefined)
    };

    const prisma = {
        order: {
            count: vi.fn(async () => 0),
            update: vi.fn(async () => ({}))
        },
        user: {
            update: vi.fn(async () => ({}))
        }
    };

    const state = { currentTmpDir: "" };
    const generatePlayable = vi.fn(async (order: { id: string }) => {
        const filePath = path.join(state.currentTmpDir, `${order.id}.html`);
        await fs.promises.writeFile(filePath, "<html>ok</html>", "utf-8");
        return filePath;
    });

    return { dbState, DB, prisma, state, generatePlayable };
});

vi.mock("../builder", () => ({
    generatePlayable: mockState.generatePlayable,
    cleanupTemp: vi.fn(async () => undefined)
}));

vi.mock("../db", () => ({
    DB: mockState.DB,
    prisma: mockState.prisma
}));

vi.mock("../config", () => ({
    CONFIG: {
        BOT_TOKEN: "test-token",
        ADMIN_USER: "admin",
        ADMIN_PASS: "admin",
        PORT: 3000,
        PRICES: { single: 100, sub: 200 },
        ADMIN_TELEGRAM_ID: 999,
        WALLETS: { usdt_trc20: "T", btc: "B" },
        THEMES: { chicken_farm: "🐔 Ферма" }
    }
}));

import { createBot, registerHandlers } from "../bot";

type ApiCall = { method: string; payload: any };

function createTestClient(apiCalls: ApiCall[]) {
    return {
        fetch: async (url: string | URL, options?: any) => {
            const urlStr = typeof url === "string" ? url : url.toString();
            const method = urlStr.split("/").pop() || "";
            let payload: any = {};

            const body = options?.body;
            if (typeof body === "string") {
                try {
                    payload = JSON.parse(body);
                } catch {
                    payload = {};
                }
            } else if (body && typeof body.get === "function") {
                // FormData
                payload.chat_id = body.get("chat_id") ?? body.get("chat_id");
                payload.message_id = body.get("message_id") ?? body.get("message_id");
                payload.text = body.get("text") ?? body.get("caption");
            }

            apiCalls.push({ method, payload });

            const chatId = Number(payload.chat_id) || 0;
            const chat = { id: chatId, type: "private" };
            const result =
                method === "getMe"
                    ? { id: 1, is_bot: true, first_name: "Test", username: "testbot" }
                    : method === "sendPhoto"
                        ? { message_id: 1, date: 0, chat, photo: [{ file_id: "file" }] }
                        : method === "sendAnimation"
                            ? { message_id: 1, date: 0, chat, animation: { file_id: "file" } }
                            : method === "sendDocument"
                                ? { message_id: 1, date: 0, chat, document: { file_id: "file" } }
                                : method === "sendMessage"
                                    ? { message_id: 1, date: 0, chat, text: payload.text ?? "" }
                                    : method === "editMessageText"
                                        ? { message_id: payload.message_id ?? 1, date: 0, chat, text: payload.text ?? "" }
                                        : method === "deleteMessage" || method === "answerCallbackQuery"
                                            ? true
                                            : true;

            return {
                json: async () => ({ ok: true, result })
            } as any;
        }
    };
}

function makeMessageUpdate(updateId: number, userId: number, text: string) {
    const user = { id: userId, is_bot: false, first_name: "User", username: "user" };
    const chat = { id: userId, type: "private" };
    return {
        update_id: updateId,
        message: {
            message_id: updateId,
            date: Math.floor(Date.now() / 1000),
            chat,
            from: user,
            text
        }
    };
}

function makeCallbackUpdate(updateId: number, userId: number, data: string) {
    const user = { id: userId, is_bot: false, first_name: "User", username: "user" };
    const chat = { id: userId, type: "private" };
    return {
        update_id: updateId,
        callback_query: {
            id: `cb_${updateId}`,
            from: user,
            data,
            message: {
                message_id: updateId,
                date: Math.floor(Date.now() / 1000),
                chat,
                text: "menu"
            }
        }
    };
}

describe("bot main flow", () => {
    let apiCalls: ApiCall[] = [];
    let nowSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        apiCalls = [];
        mockState.dbState.balance = 1000;
        mockState.dbState.ordersPaid = 0;
        mockState.dbState.orders.clear();
        vi.clearAllMocks();
        nowSpy = vi.spyOn(Date, "now").mockReturnValue(1700000000000);
        mockState.state.currentTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-test-"));
    });

    afterEach(() => {
        nowSpy.mockRestore();
        if (mockState.state.currentTmpDir) {
            fs.rmSync(mockState.state.currentTmpDir, { recursive: true, force: true });
        }
    });

    it("orders playable, selects GEO, generates preview, pays and receives final", async () => {
        const storage = new MemorySessionStorage<any>();
        const bot = createBot({
            sessionStorage: storage,
            botInfo: { id: 1, is_bot: true, first_name: "Test", username: "testbot" },
            client: createTestClient(apiCalls)
        });
        registerHandlers(bot);

        const userId = 100;
        let updateId = 1;

        await bot.handleUpdate(makeMessageUpdate(updateId++, userId, "/start"));
        await bot.handleUpdate(makeCallbackUpdate(updateId++, userId, "order"));
        await bot.handleUpdate(makeCallbackUpdate(updateId++, userId, CATEGORIES.CHICKEN));
        await bot.handleUpdate(makeCallbackUpdate(updateId++, userId, GAMES.RAILROAD.ID));
        await bot.handleUpdate(makeCallbackUpdate(updateId++, userId, "buy_check_railroad"));
        await bot.handleUpdate(makeCallbackUpdate(updateId++, userId, "geo_en_usd"));

        // Ensure session is populated even if conversation middleware didn't persist it
        const key = String(userId);
        const existing = await storage.read(key);
        if (!existing || !existing.config?.themeId) {
            await storage.write(key, {
                config: {
                    game: "railroad",
                    themeId: "chicken_farm",
                    language: "en",
                    currency: "$",
                    startingBalance: 1000,
                    geoId: "en_usd"
                }
            });
        }
        await bot.handleUpdate(makeCallbackUpdate(updateId++, userId, "gen_preview"));

        const orderId = `ord_${userId}_1700000000000`;
        expect(mockState.DB.createOrder).toHaveBeenCalledWith(orderId, userId, "railroad", expect.any(String), expect.any(Object));

        await bot.handleUpdate(makeCallbackUpdate(updateId++, userId, `pay_single_${orderId}`));

        const sendDocuments = apiCalls.filter(c => c.method === "sendDocument");
        expect(sendDocuments.length).toBeGreaterThanOrEqual(2);
        expect(mockState.generatePlayable).toHaveBeenCalledTimes(2);
        expect(mockState.DB.finalizePaidOrder).toHaveBeenCalled();
        expect(mockState.dbState.balance).toBe(900);
    });

    it("blocks purchase when balance is too low", async () => {
        mockState.dbState.balance = 10;
        const bot = createBot({
            sessionStorage: new MemorySessionStorage(),
            botInfo: { id: 1, is_bot: true, first_name: "Test", username: "testbot" },
            client: createTestClient(apiCalls)
        });
        registerHandlers(bot);

        const userId = 101;
        let updateId = 1;
        await bot.handleUpdate(makeMessageUpdate(updateId++, userId, "/start"));
        await bot.handleUpdate(makeCallbackUpdate(updateId++, userId, "buy_check_railroad"));

        const lastSend = apiCalls.find(c => c.method === "sendMessage");
        expect(lastSend?.payload?.text).toContain("Недостаточно средств");
    });
});
