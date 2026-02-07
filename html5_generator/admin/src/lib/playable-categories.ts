export const PLAYABLE_CATEGORIES = [
  { key: "cat_chicken", label: "🐔 Чикен" },
  { key: "cat_slots", label: "🎰 Слоты" },
  { key: "cat_matching", label: "🧩 Метчинг" },
  { key: "cat_plinko", label: "🎱 Плинко" },
] as const;

export type PlayableCategoryKey = (typeof PLAYABLE_CATEGORIES)[number]["key"];

export function isPlayableCategory(value: string): value is PlayableCategoryKey {
  return PLAYABLE_CATEGORIES.some((item) => item.key === value);
}

export function normalizeDiscountPercent(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(90, Math.trunc(numeric)));
}
