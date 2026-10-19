import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireWorkspaceRole } from "./model/workspace";
import {
  getRadiusOnlineSubscriberIds,
  isSubscriberOnline,
} from "./model/subscriberPresence";

const readRoles = ["owner", "admin", "billing", "network", "read_only"] as const;
const dashboardStatsValidator = v.object({
  totalSubscribers: v.number(), activeSubscribers: v.number(), suspendedSubscribers: v.number(),
  expiredSubscribers: v.number(), onlineSubscribers: v.number(), offlineSubscribers: v.number(),
  pppoeCount: v.number(), hotspotCount: v.number(), monthlyRevenue: v.number(),
  todayRevenue: v.number(), pendingInvoices: v.number(), overdueInvoices: v.number(),
  outstandingAmount: v.number(), openTickets: v.number(), totalPackages: v.number(),
  totalNetworkDevices: v.number(), onlineDevices: v.number(),
});
const dailyRevenueValidator = v.object({ date: v.string(), revenue: v.number(), payments: v.number() });
const recentTransactionValidator = v.object({
  _id: v.id("transactions"), subscriberName: v.string(), amount: v.number(),
  type: v.string(), method: v.string(), status: v.string(),
  reference: v.union(v.string(), v.null()), createdAt: v.string(),
});

export const getStats = query({
  args: { workspaceId: v.id("workspaces") },
  returns: dashboardStatsValidator,
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const [
      subscribers,
      invoices,
      tickets,
      packages,
      devices,
      radiusOnlineSubscriberIds,
    ] = await Promise.all([
      ctx.db.query("subscribers").withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId)).take(8192),
      ctx.db.query("invoices").withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId)).take(8192),
      ctx.db.query("tickets").withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId)).take(8192),
      ctx.db.query("packages").withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId)).take(8192),
      ctx.db.query("network_devices").withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId)).take(8192),
      getRadiusOnlineSubscriberIds(ctx, args.workspaceId),
    ]);
    const active = subscribers.filter((s) => s.status === "active").length;
    const online = subscribers.filter((subscriber) =>
      isSubscriberOnline(subscriber, radiusOnlineSubscriberIds),
    ).length;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const paid = invoices.filter((invoice) => invoice.status === "paid" && invoice.paidDate);
    return {
      totalSubscribers: subscribers.length,
      activeSubscribers: active,
      suspendedSubscribers: subscribers.filter((s) => s.status === "suspended").length,
      expiredSubscribers: subscribers.filter((s) => s.status === "expired").length,
      onlineSubscribers: online, offlineSubscribers: active - online,
      pppoeCount: subscribers.filter((s) => s.connectionType === "pppoe").length,
      hotspotCount: subscribers.filter((s) => s.connectionType === "hotspot").length,
      monthlyRevenue: paid.filter((i) => i.paidDate! >= startOfMonth).reduce((sum, i) => sum + i.amount, 0),
      todayRevenue: paid.filter((i) => i.paidDate! >= startOfToday).reduce((sum, i) => sum + i.amount, 0),
      pendingInvoices: invoices.filter((i) => i.status === "pending").length,
      overdueInvoices: invoices.filter((i) => i.status === "overdue").length,
      outstandingAmount: invoices.filter((i) => i.status === "pending" || i.status === "overdue")
        .reduce((sum, i) => sum + i.amount, 0),
      openTickets: tickets.filter((t) => t.status === "open" || t.status === "in_progress").length,
      totalPackages: packages.length, totalNetworkDevices: devices.length,
      onlineDevices: devices.filter((d) => d.status === "online").length,
    };
  },
});

export const getRevenueChart = query({
  args: { workspaceId: v.id("workspaces"), days: v.optional(v.number()) },
  returns: v.array(dailyRevenueValidator),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const daysBack = Math.max(1, Math.min(90, Math.floor(args.days ?? 30)));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack + 1);
    startDate.setHours(0, 0, 0, 0);
    const dailyData: Record<string, { revenue: number; payments: number }> = {};
    for (let i = 0; i < daysBack; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      dailyData[date.toISOString().split("T")[0]] = { revenue: 0, payments: 0 };
    }
    const invoices = await ctx.db.query("invoices")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "paid"))
      .take(8192);
    for (const invoice of invoices) {
      if (!invoice.paidDate) continue;
      const day = dailyData[invoice.paidDate.split("T")[0]];
      if (day) { day.revenue += invoice.amount; day.payments += 1; }
    }
    return Object.entries(dailyData).map(([date, data]) => ({ date, ...data }));
  },
});

export const getRecentTransactions = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(recentTransactionValidator),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const transactions = await ctx.db.query("transactions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc").take(8);
    return await Promise.all(transactions.map(async (tx) => {
      const subscriber = tx.subscriberId ? await ctx.db.get(tx.subscriberId) : null;
      const sameWorkspace = subscriber?.workspaceId === args.workspaceId ? subscriber : null;
      return {
        _id: tx._id, subscriberName: sameWorkspace?.name ?? (tx.subscriberId ? "Unknown" : "System"),
        amount: tx.amount, type: tx.type, method: tx.method, status: tx.status,
        reference: tx.reference ?? null, createdAt: tx.createdAt,
      };
    }));
  },
});

export const getSubscriberBreakdown = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    active: v.number(), suspended: v.number(), expired: v.number(),
    pending: v.number(), total: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const subscribers = await ctx.db.query("subscribers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(8192);
    return {
      active: subscribers.filter((s) => s.status === "active").length,
      suspended: subscribers.filter((s) => s.status === "suspended").length,
      expired: subscribers.filter((s) => s.status === "expired").length,
      pending: subscribers.filter((s) => s.status === "pending").length,
      total: subscribers.length,
    };
  },
});
