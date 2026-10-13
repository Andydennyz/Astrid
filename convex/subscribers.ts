import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Id } from "./_generated/dataModel.d.ts";

// ─── List with search + filter ───────────────────────────────────────────────
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("suspended"),
        v.literal("expired"),
        v.literal("pending"),
        v.literal("all"),
      ),
    ),
    connectionType: v.optional(
      v.union(v.literal("pppoe"), v.literal("hotspot"), v.literal("static"), v.literal("all")),
    ),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let queryBuilder = ctx.db.query("subscribers");

    // Filter by status using index
    if (args.status && args.status !== "all") {
      const results = await queryBuilder
        .withIndex("by_status", (q) => q.eq("status", args.status as "active" | "suspended" | "expired" | "pending"))
        .order("desc")
        .paginate(args.paginationOpts);

      // Apply additional filters in memory
      const filtered = results.page.filter((s) => {
        if (args.connectionType && args.connectionType !== "all") {
          if (s.connectionType !== args.connectionType) return false;
        }
        if (args.search) {
          const q = args.search.toLowerCase();
          return (
            s.name.toLowerCase().includes(q) ||
            s.phone.toLowerCase().includes(q) ||
            (s.email?.toLowerCase().includes(q) ?? false) ||
            (s.ipAddress?.toLowerCase().includes(q) ?? false)
          );
        }
        return true;
      });

      // Enrich with package info
      const enriched = await Promise.all(
        filtered.map(async (s) => {
          const pkg = s.packageId ? await ctx.db.get(s.packageId) : null;
          return { ...s, packageName: pkg?.name ?? null, packageSpeed: pkg?.speed ?? null };
        }),
      );

      return { ...results, page: enriched };
    }

    // No status filter — collect all and filter in memory
    const allSubs = await queryBuilder.order("desc").paginate(args.paginationOpts);

    const filtered = allSubs.page.filter((s) => {
      if (args.connectionType && args.connectionType !== "all") {
        if (s.connectionType !== args.connectionType) return false;
      }
      if (args.search) {
        const q = args.search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.phone.toLowerCase().includes(q) ||
          (s.email?.toLowerCase().includes(q) ?? false) ||
          (s.ipAddress?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });

    const enriched = await Promise.all(
      filtered.map(async (s) => {
        const pkg = s.packageId ? await ctx.db.get(s.packageId) : null;
        return { ...s, packageName: pkg?.name ?? null, packageSpeed: pkg?.speed ?? null };
      }),
    );

    return { ...allSubs, page: enriched };
  },
});

// ─── Get single subscriber ────────────────────────────────────────────────────
export const getById = query({
  args: { id: v.id("subscribers") },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.id);
    if (!sub) return null;
    const pkg = sub.packageId ? await ctx.db.get(sub.packageId) : null;

    // Recent invoices
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_subscriber", (q) => q.eq("subscriberId", args.id))
      .order("desc")
      .take(5);

    // Recent transactions
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_subscriber", (q) => q.eq("subscriberId", args.id))
      .order("desc")
      .take(5);

    return {
      ...sub,
      package: pkg,
      invoices,
      transactions,
    };
  },
});

// ─── Get all packages (for form dropdowns) ────────────────────────────────────
export const getPackages = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("packages")
      .withIndex("by_is_active", (q) => q.eq("isActive", true))
      .collect();
  },
});

// ─── Stats summary ────────────────────────────────────────────────────────────
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("subscribers").collect();
    return {
      total: all.length,
      active: all.filter((s) => s.status === "active").length,
      suspended: all.filter((s) => s.status === "suspended").length,
      expired: all.filter((s) => s.status === "expired").length,
      pending: all.filter((s) => s.status === "pending").length,
      online: all.filter((s) => s.isOnline).length,
      pppoe: all.filter((s) => s.connectionType === "pppoe").length,
      hotspot: all.filter((s) => s.connectionType === "hotspot").length,
      staticConn: all.filter((s) => s.connectionType === "static").length,
    };
  },
});

// ─── Create subscriber ────────────────────────────────────────────────────────
export const create = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("expired"),
      v.literal("pending"),
    ),
    connectionType: v.union(v.literal("pppoe"), v.literal("hotspot"), v.literal("static")),
    packageId: v.optional(v.id("packages")),
    ipAddress: v.optional(v.string()),
    macAddress: v.optional(v.string()),
    monthlyFee: v.number(),
    balance: v.number(),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const id = await ctx.db.insert("subscribers", {
      ...args,
      isOnline: false,
      createdAt: new Date().toISOString(),
    });

    // Audit log
    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "create",
      resource: "subscriber",
      resourceId: id,
      details: `Created subscriber: ${args.name}`,
      createdAt: new Date().toISOString(),
    });

    return id;
  },
});

// ─── Update subscriber ────────────────────────────────────────────────────────
export const update = mutation({
  args: {
    id: v.id("subscribers"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("suspended"),
        v.literal("expired"),
        v.literal("pending"),
      ),
    ),
    connectionType: v.optional(
      v.union(v.literal("pppoe"), v.literal("hotspot"), v.literal("static")),
    ),
    packageId: v.optional(v.id("packages")),
    ipAddress: v.optional(v.string()),
    macAddress: v.optional(v.string()),
    monthlyFee: v.optional(v.number()),
    balance: v.optional(v.number()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const { id, ...fields } = args;

    // Remove undefined values
    const updates = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    ) as Partial<typeof fields>;

    await ctx.db.patch(id, updates);

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "update",
      resource: "subscriber",
      resourceId: id,
      details: `Updated subscriber fields: ${Object.keys(updates).join(", ")}`,
      createdAt: new Date().toISOString(),
    });
  },
});

// ─── Update status (bulk-friendly) ────────────────────────────────────────────
export const updateStatus = mutation({
  args: {
    ids: v.array(v.id("subscribers")),
    status: v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("expired"),
      v.literal("pending"),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    for (const id of args.ids) {
      await ctx.db.patch(id, { status: args.status });
    }

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "bulk_status_update",
      resource: "subscriber",
      details: `Updated ${args.ids.length} subscribers to status: ${args.status}`,
      createdAt: new Date().toISOString(),
    });
  },
});

// ─── Delete subscriber ────────────────────────────────────────────────────────
export const remove = mutation({
  args: { id: v.id("subscribers") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const sub = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "delete",
      resource: "subscriber",
      resourceId: args.id,
      details: `Deleted subscriber: ${sub?.name ?? "Unknown"}`,
      createdAt: new Date().toISOString(),
    });
  },
});
