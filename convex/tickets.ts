import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

// ─── List tickets with filters ────────────────────────────────────────────────
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(
      v.union(
        v.literal("open"),
        v.literal("in_progress"),
        v.literal("resolved"),
        v.literal("closed"),
        v.literal("all"),
      ),
    ),
    priority: v.optional(
      v.union(
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
        v.literal("critical"),
        v.literal("all"),
      ),
    ),
    category: v.optional(
      v.union(
        v.literal("connectivity"),
        v.literal("billing"),
        v.literal("hardware"),
        v.literal("other"),
        v.literal("all"),
      ),
    ),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let page;
    if (args.status && args.status !== "all") {
      page = await ctx.db
        .query("tickets")
        .withIndex("by_status", (q) =>
          q.eq("status", args.status as "open" | "in_progress" | "resolved" | "closed"),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      page = await ctx.db.query("tickets").order("desc").paginate(args.paginationOpts);
    }

    const enriched = await Promise.all(
      page.page.map(async (ticket) => {
        const subscriber = ticket.subscriberId
          ? await ctx.db.get(ticket.subscriberId)
          : null;
        return {
          ...ticket,
          subscriberName: subscriber?.name ?? null,
          subscriberPhone: subscriber?.phone ?? null,
        };
      }),
    );

    const filtered = enriched.filter((t) => {
      if (args.priority && args.priority !== "all" && t.priority !== args.priority) return false;
      if (args.category && args.category !== "all" && t.category !== args.category) return false;
      if (args.search) {
        const q = args.search.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          (t.subscriberName?.toLowerCase().includes(q) ?? false) ||
          (t.assignedTo?.toLowerCase().includes(q) ?? false)
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
    const all = await ctx.db.query("tickets").collect();
    return {
      total: all.length,
      open: all.filter((t) => t.status === "open").length,
      inProgress: all.filter((t) => t.status === "in_progress").length,
      resolved: all.filter((t) => t.status === "resolved").length,
      closed: all.filter((t) => t.status === "closed").length,
      critical: all.filter((t) => t.priority === "critical").length,
      high: all.filter((t) => t.priority === "high").length,
      connectivity: all.filter((t) => t.category === "connectivity").length,
      billing: all.filter((t) => t.category === "billing").length,
    };
  },
});

// ─── Create ticket ─────────────────────────────────────────────────────────────
export const create = mutation({
  args: {
    subscriberId: v.optional(v.id("subscribers")),
    title: v.string(),
    description: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("resolved"),
      v.literal("closed"),
    ),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical"),
    ),
    category: v.union(
      v.literal("connectivity"),
      v.literal("billing"),
      v.literal("hardware"),
      v.literal("other"),
    ),
    assignedTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const id = await ctx.db.insert("tickets", {
      ...args,
      createdAt: new Date().toISOString(),
    });

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "create",
      resource: "ticket",
      resourceId: id,
      details: `Created ticket: ${args.title} [${args.priority}]`,
      createdAt: new Date().toISOString(),
    });

    return id;
  },
});

// ─── Update ticket ─────────────────────────────────────────────────────────────
export const update = mutation({
  args: {
    id: v.id("tickets"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("open"),
        v.literal("in_progress"),
        v.literal("resolved"),
        v.literal("closed"),
      ),
    ),
    priority: v.optional(
      v.union(
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
        v.literal("critical"),
      ),
    ),
    category: v.optional(
      v.union(
        v.literal("connectivity"),
        v.literal("billing"),
        v.literal("hardware"),
        v.literal("other"),
      ),
    ),
    assignedTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const { id, ...fields } = args;
    const updates: Record<string, unknown> = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );

    if (fields.status === "resolved" || fields.status === "closed") {
      updates.resolvedAt = new Date().toISOString();
    }

    await ctx.db.patch(id, updates);

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "update",
      resource: "ticket",
      resourceId: id,
      details: `Updated ticket: ${Object.keys(updates).join(", ")}`,
      createdAt: new Date().toISOString(),
    });
  },
});

// ─── Delete ticket ─────────────────────────────────────────────────────────────
export const remove = mutation({
  args: { id: v.id("tickets") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const ticket = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "delete",
      resource: "ticket",
      resourceId: args.id,
      details: `Deleted ticket: ${ticket?.title ?? ""}`,
      createdAt: new Date().toISOString(),
    });
  },
});

// ─── Subscribers list for dropdown ────────────────────────────────────────────
export const getSubscribersList = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("subscribers").order("asc").take(200);
  },
});
