import { describe, it, expect } from "vitest";

describe("telegram api integration", () => {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token) {
    it.skip("skipped: TELEGRAM_BOT_TOKEN or BOT_TOKEN not set", () => {});
    return;
  }

  it("can call getMe (and optionally send a message)", async () => {
    process.env.BOT_TOKEN = token;
    const { createBot } = await import("../src/bot");
    const bot = createBot();

    const me = await bot.api.getMe();
    expect(me.is_bot).toBe(true);

    if (chatId) {
      await bot.api.sendMessage(Number(chatId), "integration smoke test");
    }
  });
});
