import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Id } from "./_generated/dataModel.d.ts";

// ─── Paginated list with filters ─────────────────────────────────────────────
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(
      v.union(
        v.literal("completed"),
        v.literal("pending"),
        v.literal("failed"),
        v.literal("all"),
      ),
    ),
    method: v.optional(
      v.union(
        v.literal("mpesa"),
        v.literal("cash"),
        v.literal("bank"),
        v.literal("card"),
        v.literal("paypal"),
        v.literal("all"),
      ),
    ),
    type: v.optional(
      v.union(
        v.literal("payment"),
        v.literal("refund"),
        v.literal("credit"),
        v.literal("debit"),
        v.literal("all"),
      ),
    ),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let page;
    if (args.status && args.status !== "all") {
      page = await ctx.db
        .query("transactions")
        .withIndex("by_status", (q) =>
          q.eq("status", args.status as "completed" | "pending" | "failed"),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      page = await ctx.db.query("transactions").order("desc").paginate(args.paginationOpts);
    }

    // Enrich with subscriber name
    const enriched = await Promise.all(
      page.page.map(async (tx) => {
        const subscriber = tx.subscriberId ? await ctx.db.get(tx.subscriberId) : null;
        return {
          ...tx,
          subscriberName: subscriber?.name ?? "System / Manual",
          subscriberPhone: subscriber?.phone ?? "",
        };
      }),
    );

    // In-memory filters
    const filtered = enriched.filter((tx) => {
      if (args.method && args.method !== "all" && tx.method !== args.method) return false;
      if (args.type && args.type !== "all" && tx.type !== args.type) return false;
      if (args.search) {
        const q = args.search.toLowerCase();
        return (
          tx.subscriberName.toLowerCase().includes(q) ||
          (tx.reference?.toLowerCase().includes(q) ?? false) ||
          (tx.notes?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });

    return { ...page, page: filtered };
  },
});

// ─── Stats summary ────────────────────────────────────────────────────────────
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("transactions").collect();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).toISOString();

    const completed = all.filter((t) => t.status === "completed");
    const thisMonth = completed.filter((t) => t.createdAt >= startOfMonth);
    const today = completed.filter((t) => t.createdAt >= startOfToday);

    const byMethod: Record<string, number> = {};
    for (const t of completed) {
      byMethod[t.method] = (byMethod[t.method] ?? 0) + t.amount;
    }

    return {
      total: all.length,
      completed: completed.length,
      pending: all.filter((t) => t.status === "pending").length,
      failed: all.filter((t) => t.status === "failed").length,
      totalVolume: completed.reduce((s, t) => s + t.amount, 0),
      thisMonthVolume: thisMonth.reduce((s, t) => s + t.amount, 0),
      todayVolume: today.reduce((s, t) => s + t.amount, 0),
      mpesaVolume: byMethod["mpesa"] ?? 0,
      cashVolume: byMethod["cash"] ?? 0,
      cardVolume: byMethod["card"] ?? 0,
      bankVolume: byMethod["bank"] ?? 0,
    };
  },
});

// ─── Volume by day (last 14 days) ─────────────────────────────────────────────
export const getDailyVolume = query({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    const days: { label: string; key: string; volume: number; count: number }[] = [];

    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      days.push({
        label: d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
        key,
        volume: 0,
        count: 0,
      });
    }

    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();

    for (const tx of txns) {
      const key = tx.createdAt.split("T")[0];
      const day = days.find((d) => d.key === key);
      if (day) {
        day.volume += tx.amount;
        day.count += 1;
      }
    }

    return days;
  },
});

// ─── Create transaction ────────────────────────────────────────────────────────
export const create = mutation({
  args: {
    subscriberId: v.optional(v.id("subscribers")),
    invoiceId: v.optional(v.id("invoices")),
    amount: v.number(),
    type: v.union(
      v.literal("payment"),
      v.literal("refund"),
      v.literal("credit"),
      v.literal("debit"),
    ),
    method: v.union(
      v.literal("mpesa"),
      v.literal("cash"),
      v.literal("bank"),
      v.literal("card"),
      v.literal("paypal"),
    ),
    reference: v.optional(v.string()),
    status: v.union(v.literal("completed"), v.literal("pending"), v.literal("failed")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const id = await ctx.db.insert("transactions", {
      ...args,
      createdAt: new Date().toISOString(),
    });

    // If payment linked to invoice, mark invoice paid
    if (args.invoiceId && args.status === "completed" && args.type === "payment") {
      await ctx.db.patch(args.invoiceId, {
        status: "paid",
        paidDate: new Date().toISOString(),
      });
    }

    // Update subscriber balance if linked
    if (args.subscriberId && args.status === "completed") {
      const sub = await ctx.db.get(args.subscriberId);
      if (sub) {
        const delta =
          args.type === "payment" || args.type === "credit" ? args.amount : -args.amount;
        await ctx.db.patch(args.subscriberId, { balance: sub.balance + delta });
      }
    }

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "create",
      resource: "transaction",
      resourceId: id,
      details: `${args.type} of Ksh ${args.amount} via ${args.method} — ${args.status}`,
      createdAt: new Date().toISOString(),
    });

    return id;
  },
});

// ─── Update transaction status ─────────────────────────────────────────────────
export const updateStatus = mutation({
  args: {
    id: v.id("transactions"),
    status: v.union(v.literal("completed"), v.literal("pending"), v.literal("failed")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    await ctx.db.patch(args.id, { status: args.status });

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "update",
      resource: "transaction",
      resourceId: args.id,
      details: `Updated transaction status to ${args.status}`,
      createdAt: new Date().toISOString(),
    });
  },
});

// ─── Delete transaction ────────────────────────────────────────────────────────
export const remove = mutation({
  args: { id: v.id("transactions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    await ctx.db.delete(args.id);

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "delete",
      resource: "transaction",
      resourceId: args.id,
      details: `Deleted transaction`,
      createdAt: new Date().toISOString(),
    });
  },
});

// ─── Subscriber list for dropdown ─────────────────────────────────────────────
export const getSubscribersList = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("subscribers").order("asc").take(200);
  },
});

// ─── Open invoices list for dropdown ──────────────────────────────────────────
export const getOpenInvoices = query({
  args: { subscriberId: v.optional(v.id("subscribers")) },
  handler: async (ctx, args) => {
    if (args.subscriberId) {
      return await ctx.db
        .query("invoices")
        .withIndex("by_subscriber", (q) => q.eq("subscriberId", args.subscriberId!))
        .filter((q) =>
          q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "overdue")),
        )
        .collect();
    }
    return await ctx.db
      .query("invoices")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(50);
  },
});
