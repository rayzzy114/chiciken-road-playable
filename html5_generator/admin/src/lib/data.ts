import { prisma, serialize } from "./prisma";

export async function getAdminStats() {
  const usersCount = await prisma.user.count();
  const revenueAgg = await prisma.order.aggregate({
    _sum: { amount: true },
    where: { status: { startsWith: "paid" } },
  });
  const paidOrdersCount = await prisma.order.count({
    where: { status: { startsWith: "paid" } },
  });

  const conversion =
    usersCount > 0
      ? ((paidOrdersCount / usersCount) * 100).toFixed(2)
      : "0.00";

  return {
    users: usersCount,
    revenue: revenueAgg._sum.amount || 0,
    orders: paidOrdersCount,
    conversion,
  };
}

export async function getRecentOrders(limit = 20) {
  const orders = await prisma.order.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          username: true,
          firstName: true,
        },
      },
    },
  });
  return serialize(orders);
}

export async function getLatestUsers(limit = 10) {
  const users = await prisma.user.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          orders: {
            where: { status: { startsWith: "paid" } },
          },
        },
      },
    },
  });

  return serialize(
    users.map((u) => ({
      ...u,
      paid_orders: u._count.orders,
    }))
  );
}

export async function getRecentLogs(limit = 50) {
  const logs = await prisma.log.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          username: true,
          firstName: true,
        },
      },
    },
  });
  return serialize(logs);
}
