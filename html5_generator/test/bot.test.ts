import test from "node:test";
import assert from "node:assert/strict";
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

test("constants are defined correctly", () => {
    assert.equal(GAMES.RAILROAD.ID, "game_railroad");
    assert.equal(CATEGORIES.CHICKEN, "cat_chicken");
});

test("createInitialSession returns empty config", () => {
    const session = createInitialSession();
    assert.deepEqual(session, { config: {} });
});

test("sanitizeCurrencyInput trims and clamps length", () => {
    assert.equal(sanitizeCurrencyInput("  USD  "), "USD");
    assert.equal(sanitizeCurrencyInput("EUROLONG"), "EUROL");
    assert.equal(sanitizeCurrencyInput("   "), "$");
});

test("parseBalanceInput parses numbers and falls back", () => {
    assert.equal(parseBalanceInput("1000"), 1000);
    assert.equal(parseBalanceInput("Balance: 2500"), 2500);
    assert.equal(parseBalanceInput("0"), 1000);
    assert.equal(parseBalanceInput("nope"), 1000);
});

test("getDiscount applies thresholds", () => {
    assert.equal(getDiscount(0), 0);
    assert.equal(getDiscount(2), 0);
    assert.equal(getDiscount(3), 10);
    assert.equal(getDiscount(10), 20);
});

test("calcPrice applies discount and floors", () => {
    assert.equal(calcPrice(100, 0), 100);
    assert.equal(calcPrice(100, 10), 90);
    assert.equal(calcPrice(99, 10), 89);
});

test("buildOrderSummary uses defaults and formats output with BOLD tags", () => {
    assert.equal(buildOrderSummary({}), null);
    const summary = buildOrderSummary({ themeId: "cyber_city" });
    assert.ok(summary);
    assert.match(summary ?? "", /<b>Стиль:<\/b> cyber_city/);
    assert.match(summary ?? "", /<b>Язык:<\/b> en/);
    assert.match(summary ?? "", /<b>Баланс:<\/b> 1000 \$/);
});

test("buildProfileMessage formats output with BOLD tags", () => {
    const msg = buildProfileMessage(42, 3, 15, "mybot");
    assert.match(msg, /<b>ID:<\/b> 42/);
    assert.match(msg, /<b>Заказы:<\/b> 3/);
    assert.match(msg, /<b>Баланс:<\/b> \$15/);
    assert.match(msg, /<b>Реф-ссылка:<\/b> t\.me\/mybot\?start=42/);
});

test("parsePayCallback parses valid payloads", () => {
    assert.deepEqual(parsePayCallback("pay_single_ord_1"), { type: "single", orderId: "ord_1" });
    assert.deepEqual(parsePayCallback("pay_sub_abc_def"), { type: "sub", orderId: "abc_def" });
    assert.equal(parsePayCallback("pay_other_1"), null);
    assert.equal(parsePayCallback("pay_single_"), null);
    assert.equal(parsePayCallback("invalid"), null);
});
