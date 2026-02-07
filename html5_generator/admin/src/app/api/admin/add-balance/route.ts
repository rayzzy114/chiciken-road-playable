import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const { userId, amount } = await req.json();
    const rawUserId = String(userId ?? "").trim();
    if (!/^\d+$/.test(rawUserId)) {
      return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
    }

    const addAmount = Number(amount);
    if (!Number.isFinite(addAmount) || addAmount <= 0 || addAmount > 1_000_000) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const targetId = BigInt(rawUserId);

    await prisma.user.update({
      where: { id: targetId },
      data: { walletBalance: { increment: addAmount } },
    });

    await prisma.log.create({
      data: {
        userId: targetId,
        action: "admin_panel_add_balance",
        details: `Added $${addAmount} via Next.js Admin`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("Error adding balance", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
