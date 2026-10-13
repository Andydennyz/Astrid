import { query } from "./_generated/server";
import { v } from "convex/values";

type DashboardStats = {
  totalSubscribers: number;
  activeSubscribers: number;
  suspendedSubscribers: number;
  expiredSubscribers: number;
  onlineSubscribers: number;
  offlineSubscribers: number;
  pppoeCount: number;
  hotspotCount: number;
  monthlyRevenue: number;
  todayRevenue: number;
  pendingInvoices: number;
  overdueInvoices: number;
  outstandingAmount: number;
  openTickets: number;
  totalPackages: number;
  totalNetworkDevices: number;
  onlineDevices: number;
};

type RevenueDataPoint = {
  date: string;
  revenue: number;
  payments: number;
};

type RecentTransaction = {
  _id: string;
  subscriberName: string;
  amount: number;
  type: string;
  method: string;
  status: string;
  reference: string | undefined;
  createdAt: string;
};

export const getStats = query({
  args: {},
  handler: async (ctx): Promise<DashboardStats> => {
    const subscribers = await ctx.db.query("subscribers").collect();
    const active = subscribers.filter((s) => s.status === "active").length;
    const suspended = subscribers.filter((s) => s.status === "suspended").length;
    const expired = subscribers.filter((s) => s.status === "expired").length;
    const online = subscribers.filter((s) => s.isOnline).length;
    const pppoe = subscribers.filter((s) => s.connectionType === "pppoe").length;
    const hotspot = subscribers.filter((s) => s.connectionType === "hotspot").length;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).toISOString();

    const invoices = await ctx.db.query("invoices").collect();
    const monthlyRevenue = invoices
      .filter((i) => i.status === "paid" && i.paidDate && i.paidDate >= startOfMonth)
      .reduce((sum, i) => sum + i.amount, 0);

    const todayRevenue = invoices
      .filter((i) => i.status === "paid" && i.paidDate && i.paidDate >= startOfToday)
      .reduce((sum, i) => sum + i.amount, 0);

    const pendingInvoices = invoices.filter((i) => i.status === "pending").length;
    const overdueInvoices = invoices.filter((i) => i.status === "overdue").length;
    const outstandingAmount = invoices
      .filter((i) => i.status === "pending" || i.status === "overdue")
      .reduce((sum, i) => sum + i.amount, 0);

    const tickets = await ctx.db.query("tickets").collect();
    const openTickets = tickets.filter(
      (t) => t.status === "open" || t.status === "in_progress",
    ).length;

    const packages = await ctx.db.query("packages").collect();
    const devices = await ctx.db.query("network_devices").collect();
    const onlineDevices = devices.filter((d) => d.status === "online").length;

    return {
      totalSubscribers: subscribers.length,
      activeSubscribers: active,
      suspendedSubscribers: suspended,
      expiredSubscribers: expired,
      onlineSubscribers: online,
      offlineSubscribers: active - online,
      pppoeCount: pppoe,
      hotspotCount: hotspot,
      monthlyRevenue,
      todayRevenue,
      pendingInvoices,
      overdueInvoices,
      outstandingAmount,
      openTickets,
      totalPackages: packages.length,
      totalNetworkDevices: devices.length,
      onlineDevices,
    };
  },
});

export const getRevenueChart = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args): Promise<RevenueDataPoint[]> => {
    const daysBack = args.days ?? 30;
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - daysBack + 1);
    startDate.setHours(0, 0, 0, 0);

    // Build empty daily map
    const dailyData: Record<string, { revenue: number; payments: number }> = {};
    for (let i = 0; i < daysBack; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split("T")[0];
      dailyData[key] = { revenue: 0, payments: 0 };
    }

    // Paid invoices within range
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_status", (q) => q.eq("status", "paid"))
      .collect();

    for (const inv of invoices) {
      if (!inv.paidDate) continue;
      const key = inv.paidDate.split("T")[0];
      if (dailyData[key] !== undefined) {
        dailyData[key].revenue += inv.amount;
        dailyData[key].payments += 1;
      }
    }

    return Object.entries(dailyData).map(([date, data]) => ({
      date,
      revenue: data.revenue,
      payments: data.payments,
    }));
  },
});

export const getRecentTransactions = query({
  args: {},
  handler: async (ctx): Promise<RecentTransaction[]> => {
    const transactions = await ctx.db.query("transactions").order("desc").take(8);

    const result = await Promise.all(
      transactions.map(async (t) => {
        let subscriberName = "System";
        if (t.subscriberId) {
          const sub = await ctx.db.get(t.subscriberId);
          subscriberName = sub?.name ?? "Unknown";
        }
        return {
          _id: t._id,
          subscriberName,
          amount: t.amount,
          type: t.type,
          method: t.method,
          status: t.status,
          reference: t.reference,
          createdAt: t.createdAt,
        };
      }),
    );

    return result;
  },
});

export const getSubscriberBreakdown = query({
  args: {},
  handler: async (ctx) => {
    const subscribers = await ctx.db.query("subscribers").collect();
    return {
      active: subscribers.filter((s) => s.status === "active").length,
      suspended: subscribers.filter((s) => s.status === "suspended").length,
      expired: subscribers.filter((s) => s.status === "expired").length,
      pending: subscribers.filter((s) => s.status === "pending").length,
      total: subscribers.length,
    };
  },
});
