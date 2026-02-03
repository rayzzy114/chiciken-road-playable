import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export const DB = {
    /**
     * Safely serializes objects containing BigInt (e.g. Prisma models) 
     * to objects with strings for JSON/EJS compatibility.
     */
    serialize: (data: any) => {
        return JSON.parse(JSON.stringify(data, (_, v) => 
            typeof v === 'bigint' ? v.toString() : v
        ));
    },

    // --- USERS ---
    upsertUser: async (id: number, username?: string, first_name?: string) => {
        await prisma.user.upsert({
            where: { id: BigInt(id) },
            update: { username, firstName: first_name },
            create: { id: BigInt(id), username, firstName: first_name }
        });
    },

    setReferrer: async (userId: number, referrerId: number) => {
        if (userId === referrerId) return false;
        
        const user = await prisma.user.findUnique({ where: { id: BigInt(userId) } });
        
        // Only set if not already set
        if (user && !user.referrerId) {
            // Check if referrer exists
            const refExists = await prisma.user.findUnique({ where: { id: BigInt(referrerId) } });
            if (refExists) {
                await prisma.user.update({
                    where: { id: BigInt(userId) },
                    data: { referrerId: BigInt(referrerId) }
                });
                return true;
            }
        }
        return false;
    },

    getUserStats: async (id: number) => {
        const userId = BigInt(id);
        const user = await prisma.user.findUnique({ where: { id: userId } });
        
        // Count paid orders
        const ordersCount = await prisma.order.count({
            where: { userId, status: { startsWith: 'paid' } }
        });
        
        // Count referrals
        const referralsCount = await prisma.user.count({
            where: { referrerId: userId }
        });

        return {
            ...(user ?? {}),
            orders_paid: ordersCount,
            referrals_count: referralsCount,
            wallet_balance: user?.walletBalance || 0
        };
    },

    addReferralReward: async (userId: number, amount: number) => {
        const user = await prisma.user.findUnique({ 
            where: { id: BigInt(userId) },
            select: { referrerId: true }
        });

        if (user?.referrerId) {
            const reward = amount * 0.22;
            await prisma.user.update({
                where: { id: user.referrerId },
                data: { walletBalance: { increment: reward } }
            });
            
            // Log for admin
            await DB.logAction(Number(user.referrerId), 'referral_reward', `Received $${reward} from user ${userId}`);
        }
    },

    // --- ORDERS ---
    createOrder: async (orderId: string, userId: number, game: string, theme: string, config: any) => {
        await prisma.order.create({
            data: {
                orderId,
                userId: BigInt(userId),
                gameType: game,
                themeId: theme,
                configJson: JSON.stringify(config)
            }
        });
    },

    markPaid: async (orderId: string, status: string, amount: number, discount: number) => {
        await prisma.order.update({
            where: { orderId },
            data: { status, amount, discountApplied: discount }
        });
    },

    finalizePaidOrder: async (
        orderId: string,
        userId: number,
        status: string,
        amount: number,
        discount: number
    ) => {
        return prisma.$transaction(async (tx) => {
            const order = await tx.order.findUnique({
                where: { orderId },
                select: { userId: true, status: true }
            });
            if (!order) throw new Error("ORDER_NOT_FOUND");
            if (order.userId !== BigInt(userId)) throw new Error("ORDER_USER_MISMATCH");
            if (order.status.startsWith("paid")) throw new Error("ORDER_ALREADY_PAID");

            const user = await tx.user.findUnique({
                where: { id: BigInt(userId) },
                select: { walletBalance: true }
            });
            if (!user) throw new Error("USER_NOT_FOUND");
            if (user.walletBalance < amount) throw new Error("INSUFFICIENT_FUNDS");

            await tx.user.update({
                where: { id: BigInt(userId) },
                data: { walletBalance: { decrement: amount } }
            });

            await tx.order.update({
                where: { orderId },
                data: { status, amount, discountApplied: discount }
            });

            return { newBalance: user.walletBalance - amount };
        });
    },

    getOrder: async (orderId: string) => {
        const order = await prisma.order.findUnique({ where: { orderId } });
        return order ? { ...order, config: JSON.parse(order.configJson) } : null;
    },

    // --- LOGS ---
    logAction: async (userId: number | bigint, action: string, details: string = '') => {
        try {
            await prisma.log.create({
                data: {
                    userId: BigInt(userId),
                    action,
                    details
                }
            });
        } catch(e) { console.error("Log error", e); }
    },

    // --- ASSETS ---
    getAsset: async (key: string) => {
        const entry = await prisma.assetCache.findUnique({ where: { key } });
        return entry?.fileId;
    },

    setAsset: async (key: string, fileId: string) => {
        await prisma.assetCache.upsert({
            where: { key },
            update: { fileId },
            create: { key, fileId }
        });
    },

    // --- ADMIN ---
    getAdminStats: async () => {
        const users = await prisma.user.count();
        const revenueAgg = await prisma.order.aggregate({
            _sum: { amount: true },
            where: { status: { startsWith: 'paid' } }
        });
        const paidOrders = await prisma.order.count({ where: { status: { startsWith: 'paid' } } });
        
        const conversion = users > 0 ? ((paidOrders / users) * 100).toFixed(2) : 0;

        return {
            users,
            revenue: revenueAgg._sum.amount || 0,
            orders: paidOrders,
            conversion
        };
    },

    getLastLogs: async (limit = 50) => {
        return prisma.log.findMany({
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { username: true, firstName: true } } }
        });
    },

    getAllUsers: async (page = 1, pageSize = 50) => {
        const skip = (page - 1) * pageSize;
        const users = await prisma.user.findMany({
            skip,
            take: pageSize,
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { orders: { where: { status: { startsWith: 'paid' } } } }
                }
            }
        });
        
        // Map to flat structure for view
        return users.map(u => ({
            ...u,
            paid_orders: u._count.orders
        }));
    },

    getAllOrders: async () => {
        return prisma.order.findMany({
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { username: true } } }
        });
    }
};
