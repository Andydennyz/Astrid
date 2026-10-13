import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

// ─── List SMS logs ────────────────────────────────────────────────────────────
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(
      v.union(
        v.literal("sent"),
        v.literal("failed"),
        v.literal("pending"),
        v.literal("all"),
      ),
    ),
    type: v.optional(
      v.union(
        v.literal("invoice"),
        v.literal("reminder"),
        v.literal("custom"),
        v.literal("system"),
        v.literal("all"),
      ),
    ),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let page;
    if (args.status && args.status !== "all") {
      page = await ctx.db
        .query("sms_logs")
        .withIndex("by_status", (q) =>
          q.eq("status", args.status as "sent" | "failed" | "pending"),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      page = await ctx.db.query("sms_logs").order("desc").paginate(args.paginationOpts);
    }

    const enriched = await Promise.all(
      page.page.map(async (log) => {
        const subscriber = log.subscriberId
          ? await ctx.db.get(log.subscriberId)
          : null;
        return { ...log, subscriberName: subscriber?.name ?? null };
      }),
    );

    const filtered = enriched.filter((log) => {
      if (args.type && args.type !== "all" && log.type !== args.type) return false;
      if (args.search) {
        const q = args.search.toLowerCase();
        return (
          log.recipient.toLowerCase().includes(q) ||
          log.message.toLowerCase().includes(q) ||
          (log.subscriberName?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });

    return { ...page, page: filtered };
  },
});

// ─── Stats ────────────────────────────────────────────────────────────────────
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("sms_logs").collect();
    const totalCost = all.reduce((s, l) => s + (l.cost ?? 0), 0);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thisMonth = all.filter((l) => l.sentAt >= startOfMonth);

    return {
      total: all.length,
      sent: all.filter((l) => l.status === "sent").length,
      failed: all.filter((l) => l.status === "failed").length,
      pending: all.filter((l) => l.status === "pending").length,
      totalCost,
      thisMonthCount: thisMonth.length,
      invoiceCount: all.filter((l) => l.type === "invoice").length,
      reminderCount: all.filter((l) => l.type === "reminder").length,
      customCount: all.filter((l) => l.type === "custom").length,
      deliveryRate:
        all.length > 0
          ? Math.round((all.filter((l) => l.status === "sent").length / all.length) * 100)
          : 0,
    };
  },
});

// ─── Send bulk SMS (simulated) ────────────────────────────────────────────────
export const sendBulk = mutation({
  args: {
    message: v.string(),
    type: v.union(
      v.literal("invoice"),
      v.literal("reminder"),
      v.literal("custom"),
      v.literal("system"),
    ),
    // "all", "active", "suspended", "overdue" subscriber group
    targetGroup: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    // Fetch target subscribers
    let subscribers;
    if (args.targetGroup === "all") {
      subscribers = await ctx.db.query("subscribers").collect();
    } else if (
      args.targetGroup === "active" ||
      args.targetGroup === "suspended" ||
      args.targetGroup === "expired" ||
      args.targetGroup === "pending"
    ) {
      subscribers = await ctx.db
        .query("subscribers")
        .withIndex("by_status", (q) =>
          q.eq(
            "status",
            args.targetGroup as "active" | "suspended" | "expired" | "pending",
          ),
        )
        .collect();
    } else {
      subscribers = await ctx.db.query("subscribers").collect();
    }

    const now = new Date().toISOString();
    let count = 0;

    for (const sub of subscribers) {
      await ctx.db.insert("sms_logs", {
        recipient: sub.phone,
        message: args.message,
        status: "sent",
        type: args.type,
        subscriberId: sub._id,
        cost: 1,
        sentAt: now,
      });
      count++;
    }

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "send_bulk_sms",
      resource: "sms_logs",
      details: `Sent ${count} SMS (${args.type}) to group: ${args.targetGroup}`,
      createdAt: now,
    });

    return count;
  },
});

// ─── Send single SMS (simulated) ──────────────────────────────────────────────
export const sendSingle = mutation({
  args: {
    recipient: v.string(),
    message: v.string(),
    type: v.union(
      v.literal("invoice"),
      v.literal("reminder"),
      v.literal("custom"),
      v.literal("system"),
    ),
    subscriberId: v.optional(v.id("subscribers")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const id = await ctx.db.insert("sms_logs", {
      recipient: args.recipient,
      message: args.message,
      status: "sent",
      type: args.type,
      subscriberId: args.subscriberId,
      cost: 1,
      sentAt: new Date().toISOString(),
    });

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "send_sms",
      resource: "sms_logs",
      resourceId: id,
      details: `Sent SMS to ${args.recipient}`,
      createdAt: new Date().toISOString(),
    });

    return id;
  },
});
