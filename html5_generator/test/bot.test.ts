import { describe, it, expect } from "vitest";
import {
    buildOrderSummary,
    buildProfileMessage,
    calcPrice,
    createInitialSession,
    getDiscount,
    parseBalanceInput,
    parsePayCallback,
    sanitizeCurrencyInput,
} from "../bot_helpers";
import { GAMES, CATEGORIES } from "../constants";

describe("bot_helpers", () => {
    it("constants are defined correctly", () => {
        expect(GAMES.RAILROAD.ID).toBe("game_railroad");
        expect(CATEGORIES.CHICKEN).toBe("cat_chicken");
    });

    it("createInitialSession returns empty config", () => {
        const session = createInitialSession();
        expect(session).toEqual({ config: {} });
    });

    it("sanitizeCurrencyInput trims and clamps length", () => {
        expect(sanitizeCurrencyInput("  USD  ")).toBe("USD");
        expect(sanitizeCurrencyInput("EUROLONG")).toBe("EUROL");
        expect(sanitizeCurrencyInput("   ")).toBe("$");
    });

    it("parseBalanceInput parses numbers and falls back", () => {
        expect(parseBalanceInput("1000")).toBe(1000);
        expect(parseBalanceInput("Balance: 2500")).toBe(2500);
        expect(parseBalanceInput("0")).toBe(1000);
        expect(parseBalanceInput("nope")).toBe(1000);
    });

    it("getDiscount applies thresholds", () => {
        expect(getDiscount(0)).toBe(0);
        expect(getDiscount(2)).toBe(0);
        expect(getDiscount(3)).toBe(10);
        expect(getDiscount(10)).toBe(20);
    });

    it("calcPrice applies discount and floors", () => {
        expect(calcPrice(100, 0)).toBe(100);
        expect(calcPrice(100, 10)).toBe(90);
        expect(calcPrice(99, 10)).toBe(89);
    });

    it("buildOrderSummary uses defaults and formats output with BOLD tags", () => {
        expect(buildOrderSummary({})).toBeNull();
        const summary = buildOrderSummary({ themeId: "cyber_city" });
        expect(summary).toBeTruthy();
        expect(summary ?? "").toMatch(/<b>Стиль:<\/b> cyber_city/);
        expect(summary ?? "").toMatch(/<b>Язык:<\/b> en/);
        expect(summary ?? "").toMatch(/<b>Баланс:<\/b> 1000 \$/);
    });

    it("buildProfileMessage formats output with BOLD tags", () => {
        const msg = buildProfileMessage(42, 3, 15, "mybot");
        expect(msg).toMatch(/<b>ID:<\/b> 42/);
        expect(msg).toMatch(/<b>Заказы:<\/b> 3/);
        expect(msg).toMatch(/<b>Баланс:<\/b> \$15/);
        expect(msg).toMatch(/<b>Реф-ссылка:<\/b> t\.me\/mybot\?start=42/);
    });

    it("parsePayCallback parses valid payloads", () => {
        expect(parsePayCallback("pay_single_ord_1")).toEqual({ type: "single", orderId: "ord_1" });
        expect(parsePayCallback("pay_sub_abc_def")).toEqual({ type: "sub", orderId: "abc_def" });
        expect(parsePayCallback("pay_other_1")).toBeNull();
        expect(parsePayCallback("pay_single_")).toBeNull();
        expect(parsePayCallback("invalid")).toBeNull();
    });
});
