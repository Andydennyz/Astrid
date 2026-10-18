import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireWorkspaceRole } from "./model/workspace";

const readRoles = ["owner", "admin", "billing", "network", "read_only"] as const;
const exportedRow = v.record(v.string(), v.union(v.string(), v.number()));

export const getRevenueReport = query({
  args: { workspaceId: v.id("workspaces"), months: v.optional(v.number()) },
  returns: v.object({
    months: v.array(v.object({
      label: v.string(), key: v.string(), revenue: v.number(),
      invoiceCount: v.number(), avgInvoice: v.number(),
    })),
    totalRevenue: v.number(), totalInvoices: v.number(),
    bestMonth: v.object({
      label: v.string(), key: v.string(), revenue: v.number(),
      invoiceCount: v.number(), avgInvoice: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const monthCount = Math.max(1, Math.min(60, Math.floor(args.months ?? 12)));
    const paidInvoices = await ctx.db.query("invoices")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "paid"))
      .take(8192);
    const now = new Date();
    const months: { label: string; key: string; revenue: number; invoiceCount: number; avgInvoice: number }[] = [];
    for (let i = monthCount - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: date.toLocaleString("default", { month: "short", year: "numeric" }),
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        revenue: 0, invoiceCount: 0, avgInvoice: 0,
      });
    }
    for (const invoice of paidInvoices) {
      if (!invoice.paidDate) continue;
      const month = months.find((entry) => entry.key === invoice.paidDate!.substring(0, 7));
      if (month) { month.revenue += invoice.amount; month.invoiceCount += 1; }
    }
    for (const month of months) {
      month.avgInvoice = month.invoiceCount ? Math.round(month.revenue / month.invoiceCount) : 0;
    }
    const totalRevenue = months.reduce((sum, month) => sum + month.revenue, 0);
    const totalInvoices = months.reduce((sum, month) => sum + month.invoiceCount, 0);
    const bestMonth = months.reduce((best, month) => month.revenue > best.revenue ? month : best, months[0]);
    return { months, totalRevenue, totalInvoices, bestMonth };
  },
});

export const getSubscriberReport = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    total: v.number(),
    byStatus: v.object({ active: v.number(), suspended: v.number(), expired: v.number(), pending: v.number() }),
    byType: v.object({ pppoe: v.number(), hotspot: v.number(), static: v.number() }),
    packageBreakdown: v.array(v.object({ name: v.string(), count: v.number(), revenue: v.number() })),
    totalMRR: v.number(), onlineCount: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const [subscribers, packages] = await Promise.all([
      ctx.db.query("subscribers").withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId)).take(8192),
      ctx.db.query("packages").withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId)).take(8192),
    ]);
    const packageMap = new Map(packages.map((pkg) => [pkg._id, pkg]));
    const byPackage = new Map<string, { name: string; count: number; revenue: number }>();
    for (const subscriber of subscribers) {
      const pkg = subscriber.packageId ? packageMap.get(subscriber.packageId) : undefined;
      const key = subscriber.packageId ?? "unassigned";
      const current = byPackage.get(key) ?? {
        name: pkg?.name ?? (subscriber.packageId ? "Unknown" : "No Package"),
        count: 0, revenue: 0,
      };
      current.count += 1;
      current.revenue += subscriber.monthlyFee;
      byPackage.set(key, current);
    }
    return {
      total: subscribers.length,
      byStatus: {
        active: subscribers.filter((s) => s.status === "active").length,
        suspended: subscribers.filter((s) => s.status === "suspended").length,
        expired: subscribers.filter((s) => s.status === "expired").length,
        pending: subscribers.filter((s) => s.status === "pending").length,
      },
      byType: {
        pppoe: subscribers.filter((s) => s.connectionType === "pppoe").length,
        hotspot: subscribers.filter((s) => s.connectionType === "hotspot").length,
        static: subscribers.filter((s) => s.connectionType === "static").length,
      },
      packageBreakdown: [...byPackage.values()].sort((a, b) => b.count - a.count),
      totalMRR: subscribers.filter((s) => s.status === "active")
        .reduce((sum, subscriber) => sum + subscriber.monthlyFee, 0),
      onlineCount: subscribers.filter((s) => s.isOnline).length,
    };
  },
});

export const getTransactionReport = query({
  args: { workspaceId: v.id("workspaces"), days: v.optional(v.number()) },
  returns: v.object({
    totalVolume: v.number(), totalCount: v.number(),
    byMethod: v.array(v.object({ method: v.string(), count: v.number(), volume: v.number() })),
    byType: v.array(v.object({ type: v.string(), count: v.number(), volume: v.number() })),
    dailyVolume: v.array(v.object({ date: v.string(), volume: v.number(), count: v.number() })),
    daysBack: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const daysBack = Math.max(1, Math.min(365, Math.floor(args.days ?? 30)));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const transactions = await ctx.db.query("transactions")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "completed"))
      .take(8192);
    const inRange = transactions.filter((tx) => tx.createdAt >= cutoff.toISOString());
    const byMethod = new Map<string, { count: number; volume: number }>();
    const byType = new Map<string, { count: number; volume: number }>();
    const daily = new Map<string, { volume: number; count: number }>();
    for (const tx of inRange) {
      const method = byMethod.get(tx.method) ?? { count: 0, volume: 0 };
      method.count += 1; method.volume += tx.amount; byMethod.set(tx.method, method);
      const type = byType.get(tx.type) ?? { count: 0, volume: 0 };
      type.count += 1; type.volume += tx.amount; byType.set(tx.type, type);
      const date = tx.createdAt.substring(0, 10);
      const day = daily.get(date) ?? { volume: 0, count: 0 };
      day.volume += tx.amount; day.count += 1; daily.set(date, day);
    }
    return {
      totalVolume: inRange.reduce((sum, tx) => sum + tx.amount, 0),
      totalCount: inRange.length,
      byMethod: [...byMethod.entries()].map(([method, data]) => ({ method, ...data })),
      byType: [...byType.entries()].map(([type, data]) => ({ type, ...data })),
      dailyVolume: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({ date, ...data })),
      daysBack,
    };
  },
});

export const exportSubscribers = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(exportedRow),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const [subscribers, packages] = await Promise.all([
      ctx.db.query("subscribers").withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId)).take(2000),
      ctx.db.query("packages").withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId)).take(8192),
    ]);
    const packageMap = new Map(packages.map((pkg) => [pkg._id, pkg.name]));
    return subscribers.map((subscriber) => ({
      Name: subscriber.name, Phone: subscriber.phone, Email: subscriber.email ?? "",
      Status: subscriber.status, "Connection Type": subscriber.connectionType,
      Package: subscriber.packageId ? packageMap.get(subscriber.packageId) ?? "Unknown" : "",
      "Monthly Fee (KES)": subscriber.monthlyFee, Balance: subscriber.balance,
      "IP Address": subscriber.ipAddress ?? "", Online: subscriber.isOnline ? "Yes" : "No",
      "Joined Date": subscriber.createdAt.split("T")[0],
    }));
  },
});

export const exportInvoices = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(exportedRow),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const invoices = await ctx.db.query("invoices").withIndex("by_workspace", (q) =>
      q.eq("workspaceId", args.workspaceId)).order("desc").take(2000);
    const subscriberIds = [...new Set(invoices.map((invoice) => invoice.subscriberId))];
    const subscribers = await Promise.all(subscriberIds.map((id) => ctx.db.get(id)));
    const subscriberMap = new Map(subscribers.filter((s): s is NonNullable<typeof s> =>
      s !== null && s.workspaceId === args.workspaceId)
      .map((s) => [s._id, s.name]));
    return invoices.map((invoice) => ({
      "Invoice #": invoice.invoiceNumber, Subscriber: subscriberMap.get(invoice.subscriberId) ?? "Unknown",
      "Amount (KES)": invoice.amount, Status: invoice.status, Description: invoice.description,
      "Due Date": invoice.dueDate.split("T")[0],
      "Paid Date": invoice.paidDate ? invoice.paidDate.split("T")[0] : "",
      "Created Date": invoice.createdAt.split("T")[0],
    }));
  },
});

export const exportOverdueInvoices = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(exportedRow),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const invoices = await ctx.db.query("invoices")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "overdue"))
      .take(2000);
    const subscriberIds = [...new Set(invoices.map((invoice) => invoice.subscriberId))];
    const subscribers = await Promise.all(subscriberIds.map((id) => ctx.db.get(id)));
    const subscriberMap = new Map(subscribers.filter((s): s is NonNullable<typeof s> =>
      s !== null && s.workspaceId === args.workspaceId)
      .map((s) => [s._id, { name: s.name, phone: s.phone }]));
    return invoices.map((invoice) => ({
      "Invoice #": invoice.invoiceNumber,
      Subscriber: subscriberMap.get(invoice.subscriberId)?.name ?? "Unknown",
      Phone: subscriberMap.get(invoice.subscriberId)?.phone ?? "",
      "Amount (KES)": invoice.amount, Description: invoice.description,
      "Due Date": invoice.dueDate.split("T")[0],
      "Days Overdue": Math.max(0, Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / 86400000)),
      "Created Date": invoice.createdAt.split("T")[0],
    }));
  },
});

export const getNetworkReport = query({
  args: { workspaceId: v.id("workspaces"), days: v.optional(v.number()) },
  returns: v.object({
    daysBack: v.number(), totalSessions: v.number(), activeSessions: v.number(),
    authAccept: v.number(), authReject: v.number(),
    rejectReasons: v.array(v.object({ reason: v.string(), count: v.number() })),
    topUsers: v.array(v.object({
      username: v.string(), download: v.number(), upload: v.number(), sessions: v.number(), total: v.number(),
    })),
    routerStats: v.array(v.object({
      id: v.id("routers"), name: v.string(), status: v.string(),
      nasIdentifier: v.string(), activeSessions: v.number(),
    })),
    dailyAuthData: v.array(v.object({ date: v.string(), accept: v.number(), reject: v.number() })),
  }),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const daysBack = Math.max(1, Math.min(365, Math.floor(args.days ?? 7)));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = cutoff.toISOString();
    const [routers, recentLogs, recentSessions, activeSessions, interimSessions] = await Promise.all([
      ctx.db
        .query("routers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .take(500),
      ctx.db
        .query("radius_logs")
        .withIndex("by_workspace_and_created_at", (q) =>
          q.eq("workspaceId", args.workspaceId).gte("createdAt", cutoffStr),
        )
        .take(8192),
      ctx.db
        .query("router_sessions")
        .withIndex("by_workspace_and_start_time", (q) =>
          q.eq("workspaceId", args.workspaceId).gte("startTime", cutoffStr),
        )
        .take(8192),
      ctx.db
        .query("router_sessions")
        .withIndex("by_workspace_and_status", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("status", "active"),
        )
        .take(8192),
      ctx.db
        .query("router_sessions")
        .withIndex("by_workspace_and_status", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("status", "interim"),
        )
        .take(8192),
    ]);
    const liveSessions = [...activeSessions, ...interimSessions];

    const authLogs = recentLogs.filter((log) => log.type !== "accounting");
    const authAccept = authLogs.filter((log) => log.responseCode === "accept").length;
    const authReject = authLogs.filter((log) => log.responseCode === "reject").length;
    const rejectReasons = new Map<string, number>();
    for (const log of authLogs) {
      if (log.responseCode !== "reject") continue;
      const reason = log.rejectReason ?? "Unknown";
      rejectReasons.set(reason, (rejectReasons.get(reason) ?? 0) + 1);
    }

    const userBandwidth = new Map<
      string,
      { download: number; upload: number; sessions: number }
    >();
    for (const session of recentSessions) {
      const stats = userBandwidth.get(session.username) ?? {
        download: 0,
        upload: 0,
        sessions: 0,
      };
      stats.download +=
        (session.inputOctets ?? 0) + (session.inputGigawords ?? 0) * 4_294_967_296;
      stats.upload +=
        (session.outputOctets ?? 0) + (session.outputGigawords ?? 0) * 4_294_967_296;
      stats.sessions += 1;
      userBandwidth.set(session.username, stats);
    }
    const topUsers = [...userBandwidth.entries()]
      .map(([username, stats]) => ({
        username,
        ...stats,
        total: stats.download + stats.upload,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const activeByRouter = new Map<string, number>();
    for (const session of liveSessions) {
      if (!session.routerId) continue;
      activeByRouter.set(
        session.routerId,
        (activeByRouter.get(session.routerId) ?? 0) + 1,
      );
    }
    const routerStats = routers.map((router) => ({
      id: router._id,
      name: router.name,
      status: router.status,
      nasIdentifier: router.nasIdentifier,
      activeSessions: activeByRouter.get(router._id) ?? 0,
    }));

    const dailyAuth = new Map<string, { accept: number; reject: number }>();
    for (const log of authLogs) {
      if (log.responseCode === "error") continue;
      const date = log.createdAt.substring(0, 10);
      const daily = dailyAuth.get(date) ?? { accept: 0, reject: 0 };
      if (log.responseCode === "accept") daily.accept += 1;
      else daily.reject += 1;
      dailyAuth.set(date, daily);
    }

    return {
      daysBack,
      totalSessions: recentSessions.length,
      activeSessions: liveSessions.length,
      authAccept,
      authReject,
      rejectReasons: [...rejectReasons.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      topUsers,
      routerStats,
      dailyAuthData: [...dailyAuth.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, counts]) => ({ date, ...counts })),
    };
  },
});

export const exportTransactions = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(exportedRow),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const transactions = await ctx.db.query("transactions").withIndex("by_workspace", (q) =>
      q.eq("workspaceId", args.workspaceId)).order("desc").take(2000);
    const subscriberIds = [...new Set(transactions.map((tx) => tx.subscriberId).filter((id) => id !== undefined))];
    const subscribers = await Promise.all(subscriberIds.map((id) => ctx.db.get(id)));
    const subscriberMap = new Map(subscribers.filter((s): s is NonNullable<typeof s> =>
      s !== null && s.workspaceId === args.workspaceId)
      .map((s) => [s._id, s.name]));
    return transactions.map((tx) => ({
      Date: tx.createdAt.split("T")[0],
      Subscriber: tx.subscriberId ? subscriberMap.get(tx.subscriberId) ?? "Unknown" : "Manual",
      "Amount (KES)": tx.amount, Type: tx.type, Method: tx.method, Status: tx.status,
      Reference: tx.reference ?? "", Notes: tx.notes ?? "",
    }));
  },
});
