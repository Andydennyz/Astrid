import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

// ─── List notifications for current user ──────────────────────────────────────
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    unreadOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { page: [], isDone: true, continueCursor: "" };

    let q;
    if (args.unreadOnly) {
      q = ctx.db
        .query("notifications")
        .withIndex("by_user_and_read", (i) =>
          i.eq("userId", identity.tokenIdentifier).eq("read", false),
        );
    } else {
      q = ctx.db
        .query("notifications")
        .withIndex("by_user", (i) => i.eq("userId", identity.tokenIdentifier));
    }

    return await q.order("desc").paginate(args.paginationOpts);
  },
});

// ─── Unread count ──────────────────────────────────────────────────────────────
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (i) =>
        i.eq("userId", identity.tokenIdentifier).eq("read", false),
      )
      .collect();
    return unread.length;
  },
});

// ─── Mark as read ──────────────────────────────────────────────────────────────
export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    await ctx.db.patch(args.id, { read: true });
  },
});

// ─── Mark all as read ──────────────────────────────────────────────────────────
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (i) =>
        i.eq("userId", identity.tokenIdentifier).eq("read", false),
      )
      .collect();

    await Promise.all(unread.map((n) => ctx.db.patch(n._id, { read: true })));
  },
});

// ─── Delete notification ───────────────────────────────────────────────────────
export const remove = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    await ctx.db.delete(args.id);
  },
});

// ─── Create notification (internal helper, used by other mutations) ────────────
export const create = mutation({
  args: {
    userId: v.string(),
    title: v.string(),
    message: v.string(),
    type: v.union(
      v.literal("info"),
      v.literal("success"),
      v.literal("warning"),
      v.literal("error"),
    ),
    link: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      ...args,
      read: false,
      createdAt: new Date().toISOString(),
    });
  },
});

// ─── Seed demo notifications ───────────────────────────────────────────────────
export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const demos = [
      { title: "New subscriber registered", message: "John Mwangi has signed up for a 10Mbps PPPoE plan.", type: "success" as const, link: "/subscribers" },
      { title: "Invoice overdue", message: "Invoice #INV-0042 for Mary Wanjiku is 5 days overdue.", type: "warning" as const, link: "/financials" },
      { title: "Network device offline", message: "Router RB450G at Site B has gone offline.", type: "error" as const, link: "/network" },
      { title: "Payment received", message: "Ksh 1,500 M-Pesa payment received from Brian Otieno.", type: "success" as const, link: "/transactions" },
      { title: "Ticket assigned", message: "Ticket #T-023 (Router hardware failure) assigned to you.", type: "info" as const, link: "/tickets" },
      { title: "Bulk SMS sent", message: "500 reminder SMS sent to active subscribers.", type: "info" as const, link: "/sms-reports" },
      { title: "Subscriber suspended", message: "Esther Akinyi has been suspended due to non-payment.", type: "warning" as const, link: "/subscribers" },
    ];

    const now = new Date();
    for (let i = 0; i < demos.length; i++) {
      const ts = new Date(now.getTime() - i * 3_600_000).toISOString();
      await ctx.db.insert("notifications", {
        userId: identity.tokenIdentifier,
        ...demos[i],
        read: i > 2,
        createdAt: ts,
      });
    }
  },
});
