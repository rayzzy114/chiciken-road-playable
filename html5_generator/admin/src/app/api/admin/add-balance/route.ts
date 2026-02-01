import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { userId, amount } = await req.json();
    const targetId = BigInt(userId);
    const addAmount = parseFloat(amount);

    if (isNaN(addAmount)) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

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
    console.error("Error adding balance", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
