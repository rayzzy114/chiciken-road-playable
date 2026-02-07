import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isPlayableCategory, normalizeDiscountPercent } from "@/lib/playable-categories";

export async function GET() {
  const rows = (await prisma.$queryRaw`SELECT category, percent FROM category_discounts`) as Array<{
    category: string;
    percent: number;
  }>;
  return NextResponse.json(
    rows.map((row) => ({
      category: row.category,
      percent: normalizeDiscountPercent(row.percent),
    })),
  );
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const category = String(payload?.category ?? "").trim();
    const percent = normalizeDiscountPercent(payload?.percent);

    if (!isPlayableCategory(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    await prisma.$executeRaw`
      INSERT INTO category_discounts (category, percent)
      VALUES (${category}, ${percent})
      ON CONFLICT(category) DO UPDATE SET percent = excluded.percent
    `;
    const rows = (await prisma.$queryRaw`
      SELECT category, percent FROM category_discounts WHERE category = ${category}
    `) as Array<{ category: string; percent: number }>;
    const updated = rows[0] ?? { category, percent };

    return NextResponse.json({
      success: true,
      category: updated.category,
      percent: normalizeDiscountPercent(updated.percent),
    });
  } catch (error) {
    console.error("Failed to update category discount", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
