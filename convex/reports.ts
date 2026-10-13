import { query } from "./_generated/server";
import { v } from "convex/values";

// ─── Revenue summary by month (configurable range) ────────────────────────────
export const getRevenueReport = query({
  args: { months: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const monthCount = args.months ?? 12;
    const now = new Date();
    const months: {
      label: string;
      key: string;
      revenue: number;
      invoiceCount: number;
      avgInvoice: number;
    }[] = [];

    for (let i = monthCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        label: d.toLocaleString("default", { month: "short", year: "numeric" }),
        key,
        revenue: 0,
        invoiceCount: 0,
        avgInvoice: 0,
      });
    }

    const paidInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_status", (q) => q.eq("status", "paid"))
      .collect();

    for (const inv of paidInvoices) {
      if (!inv.paidDate) continue;
      const key = inv.paidDate.substring(0, 7);
      const month = months.find((m) => m.key === key);
      if (month) {
        month.revenue += inv.amount;
        month.invoiceCount += 1;
      }
    }

    for (const month of months) {
      month.avgInvoice = month.invoiceCount > 0 ? Math.round(month.revenue / month.invoiceCount) : 0;
    }

    const totalRevenue = months.reduce((s, m) => s + m.revenue, 0);
    const totalInvoices = months.reduce((s, m) => s + m.invoiceCount, 0);
    const bestMonth = months.reduce((best, m) => (m.revenue > best.revenue ? m : best), months[0]);

    return { months, totalRevenue, totalInvoices, bestMonth };
  },
});

// ─── Subscriber report ────────────────────────────────────────────────────────
export const getSubscriberReport = query({
  args: {},
  handler: async (ctx) => {
    const subscribers = await ctx.db.query("subscribers").collect();
    const packages = await ctx.db.query("packages").collect();

    const packageMap = new Map(packages.map((p) => [p._id, p]));

    // By status
    const byStatus = {
      active: subscribers.filter((s) => s.status === "active").length,
      suspended: subscribers.filter((s) => s.status === "suspended").length,
      expired: subscribers.filter((s) => s.status === "expired").length,
      pending: subscribers.filter((s) => s.status === "pending").length,
    };

    // By connection type
    const byType = {
      pppoe: subscribers.filter((s) => s.connectionType === "pppoe").length,
      hotspot: subscribers.filter((s) => s.connectionType === "hotspot").length,
      static: subscribers.filter((s) => s.connectionType === "static").length,
    };

    // By package
    const byPackage: Record<string, { name: string; count: number; revenue: number }> = {};
    for (const sub of subscribers) {
      const pkgId = sub.packageId ?? "unassigned";
      const pkgName = sub.packageId ? (packageMap.get(sub.packageId)?.name ?? "Unknown") : "No Package";
      if (!byPackage[pkgId]) {
        byPackage[pkgId] = { name: pkgName, count: 0, revenue: 0 };
      }
      byPackage[pkgId].count += 1;
      byPackage[pkgId].revenue += sub.monthlyFee;
    }

    const packageBreakdown = Object.values(byPackage).sort((a, b) => b.count - a.count);

    const totalMRR = subscribers
      .filter((s) => s.status === "active")
      .reduce((s, sub) => s + sub.monthlyFee, 0);

    return {
      total: subscribers.length,
      byStatus,
      byType,
      packageBreakdown,
      totalMRR,
      onlineCount: subscribers.filter((s) => s.isOnline).length,
    };
  },
});

// ─── Transaction report ────────────────────────────────────────────────────────
export const getTransactionReport = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const daysBack = args.days ?? 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = cutoff.toISOString();

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();

    const inRange = transactions.filter((t) => t.createdAt >= cutoffStr);

    const byMethod: Record<string, { count: number; volume: number }> = {};
    for (const t of inRange) {
      if (!byMethod[t.method]) byMethod[t.method] = { count: 0, volume: 0 };
      byMethod[t.method].count += 1;
      byMethod[t.method].volume += t.amount;
    }

    const byType: Record<string, { count: number; volume: number }> = {};
    for (const t of inRange) {
      if (!byType[t.type]) byType[t.type] = { count: 0, volume: 0 };
      byType[t.type].count += 1;
      byType[t.type].volume += t.amount;
    }

    // Daily volume over range
    const dailyMap: Record<string, { volume: number; count: number }> = {};
    for (const t of inRange) {
      const key = t.createdAt.substring(0, 10);
      if (!dailyMap[key]) dailyMap[key] = { volume: 0, count: 0 };
      dailyMap[key].volume += t.amount;
      dailyMap[key].count += 1;
    }
    const dailyVolume = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    return {
      totalVolume: inRange.reduce((s, t) => s + t.amount, 0),
      totalCount: inRange.length,
      byMethod: Object.entries(byMethod).map(([method, data]) => ({ method, ...data })),
      byType: Object.entries(byType).map(([type, data]) => ({ type, ...data })),
      dailyVolume,
      daysBack,
    };
  },
});

// ─── Full data exports (for CSV download) ─────────────────────────────────────
export const exportSubscribers = query({
  args: {},
  handler: async (ctx) => {
    const subscribers = await ctx.db.query("subscribers").collect();
    const packages = await ctx.db.query("packages").collect();
    const pkgMap = new Map(packages.map((p) => [p._id, p]));

    return subscribers.map((s) => ({
      Name: s.name,
      Phone: s.phone,
      Email: s.email ?? "",
      Status: s.status,
      "Connection Type": s.connectionType,
      Package: s.packageId ? (pkgMap.get(s.packageId)?.name ?? "Unknown") : "",
      "Monthly Fee (KES)": s.monthlyFee,
      Balance: s.balance,
      "IP Address": s.ipAddress ?? "",
      Online: s.isOnline ? "Yes" : "No",
      "Joined Date": s.createdAt.split("T")[0],
    }));
  },
});

export const exportInvoices = query({
  args: {},
  handler: async (ctx) => {
    const invoices = await ctx.db.query("invoices").order("desc").take(2000);
    const subMap = new Map<string, string>();

    const subIds = [...new Set(invoices.map((i) => i.subscriberId))];
    for (const id of subIds) {
      const sub = await ctx.db.get(id);
      if (sub) subMap.set(id, sub.name);
    }

    return invoices.map((inv) => ({
      "Invoice #": inv.invoiceNumber,
      Subscriber: subMap.get(inv.subscriberId) ?? "Unknown",
      "Amount (KES)": inv.amount,
      Status: inv.status,
      Description: inv.description,
      "Due Date": inv.dueDate.split("T")[0],
      "Paid Date": inv.paidDate ? inv.paidDate.split("T")[0] : "",
      "Created Date": inv.createdAt.split("T")[0],
    }));
  },
});

export const exportOverdueInvoices = query({
  args: {},
  handler: async (ctx) => {
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_status", (q) => q.eq("status", "overdue"))
      .collect();

    const subIds = [...new Set(invoices.map((i) => i.subscriberId))];
    const subMap = new Map<string, { name: string; phone: string }>();
    for (const id of subIds) {
      const sub = await ctx.db.get(id);
      if (sub) subMap.set(id, { name: sub.name, phone: sub.phone });
    }

    return invoices.map((inv) => ({
      "Invoice #": inv.invoiceNumber,
      Subscriber: subMap.get(inv.subscriberId)?.name ?? "Unknown",
      Phone: subMap.get(inv.subscriberId)?.phone ?? "",
      "Amount (KES)": inv.amount,
      Description: inv.description,
      "Due Date": inv.dueDate.split("T")[0],
      "Days Overdue": Math.max(
        0,
        Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000),
      ),
      "Created Date": inv.createdAt.split("T")[0],
    }));
  },
});

// ─── Network / RADIUS sessions report ────────────────────────────────────────
export const getNetworkReport = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const daysBack = args.days ?? 7;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = cutoff.toISOString();

    const routers = await ctx.db.query("routers").collect();

    // Auth stats from RADIUS logs
    const allLogs = await ctx.db.query("radius_logs").collect();
    const recentLogs = allLogs.filter((l) => l.createdAt >= cutoffStr);

    const authAccept = recentLogs.filter(
      (l) => l.type !== "accounting" && l.responseCode === "accept",
    ).length;
    const authReject = recentLogs.filter(
      (l) => l.type !== "accounting" && l.responseCode === "reject",
    ).length;

    // Reject reasons breakdown
    const rejectReasons: Record<string, number> = {};
    for (const l of recentLogs.filter((l) => l.responseCode === "reject")) {
      const reason = l.rejectReason ?? "Unknown";
      rejectReasons[reason] = (rejectReasons[reason] ?? 0) + 1;
    }

    // Recent sessions
    const allSessions = await ctx.db.query("router_sessions").collect();
    const recentSessions = allSessions.filter((s) => s.startTime >= cutoffStr);

    const activeSessions = allSessions.filter((s) => s.status === "active");

    // Top users by bandwidth
    const userBw: Record<string, { download: number; upload: number; sessions: number }> = {};
    const GW = 4294967296;
    for (const s of recentSessions) {
      if (!userBw[s.username]) userBw[s.username] = { download: 0, upload: 0, sessions: 0 };
      userBw[s.username].download += (s.inputOctets ?? 0) + (s.inputGigawords ?? 0) * GW;
      userBw[s.username].upload += (s.outputOctets ?? 0) + (s.outputGigawords ?? 0) * GW;
      userBw[s.username].sessions += 1;
    }

    const topUsers = Object.entries(userBw)
      .map(([username, stats]) => ({ username, ...stats, total: stats.download + stats.upload }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Per-router active sessions
    const routerStats = routers.map((r) => ({
      id: r._id,
      name: r.name,
      status: r.status,
      nasIdentifier: r.nasIdentifier,
      activeSessions: activeSessions.filter((s) => s.routerId === r._id).length,
    }));

    // Daily auth activity
    const dailyAuth: Record<string, { accept: number; reject: number }> = {};
    for (const l of recentLogs.filter((l) => l.type !== "accounting")) {
      const day = l.createdAt.substring(0, 10);
      if (!dailyAuth[day]) dailyAuth[day] = { accept: 0, reject: 0 };
      if (l.responseCode === "accept") dailyAuth[day].accept += 1;
      else if (l.responseCode === "reject") dailyAuth[day].reject += 1;
    }
    const dailyAuthData = Object.entries(dailyAuth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    return {
      daysBack,
      totalSessions: recentSessions.length,
      activeSessions: activeSessions.length,
      authAccept,
      authReject,
      rejectReasons: Object.entries(rejectReasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      topUsers,
      routerStats,
      dailyAuthData,
    };
  },
});

export const exportTransactions = query({
  args: {},
  handler: async (ctx) => {
    const txns = await ctx.db.query("transactions").order("desc").take(2000);
    const subIds = [...new Set(txns.map((t) => t.subscriberId).filter(Boolean))];
    const subMap = new Map<string, string>();
    for (const id of subIds) {
      if (!id) continue;
      const sub = await ctx.db.get(id);
      if (sub) subMap.set(id, sub.name);
    }

    return txns.map((t) => ({
      Date: t.createdAt.split("T")[0],
      Subscriber: t.subscriberId ? (subMap.get(t.subscriberId) ?? "Unknown") : "Manual",
      "Amount (KES)": t.amount,
      Type: t.type,
      Method: t.method,
      Status: t.status,
      Reference: t.reference ?? "",
      Notes: t.notes ?? "",
    }));
  },
});
