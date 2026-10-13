import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

// ─── List packages with subscriber counts ────────────────────────────────────
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    type: v.optional(
      v.union(
        v.literal("pppoe"),
        v.literal("hotspot"),
        v.literal("static"),
        v.literal("all"),
      ),
    ),
    isActive: v.optional(v.union(v.literal("active"), v.literal("inactive"), v.literal("all"))),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let allPackages = await ctx.db.query("packages").order("desc").collect();

    // Filter by type
    if (args.type && args.type !== "all") {
      allPackages = allPackages.filter((p) => p.type === args.type);
    }

    // Filter by active status
    if (args.isActive && args.isActive !== "all") {
      const active = args.isActive === "active";
      allPackages = allPackages.filter((p) => p.isActive === active);
    }

    // Search by name
    if (args.search) {
      const q = args.search.toLowerCase();
      allPackages = allPackages.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.speed.toLowerCase().includes(q) ||
          (p.description?.toLowerCase().includes(q) ?? false),
      );
    }

    // Enrich with subscriber count
    const enriched = await Promise.all(
      allPackages.map(async (pkg) => {
        const subscribers = await ctx.db
          .query("subscribers")
          .collect();
        const count = subscribers.filter((s) => s.packageId === pkg._id).length;
        return { ...pkg, subscriberCount: count };
      }),
    );

    // Manual pagination
    const { cursor, numItems } = args.paginationOpts;
    const startIdx = cursor ? parseInt(cursor) : 0;
    const page = enriched.slice(startIdx, startIdx + numItems);
    const nextCursor = startIdx + numItems < enriched.length ? String(startIdx + numItems) : null;

    return {
      page,
      isDone: nextCursor === null,
      continueCursor: nextCursor ?? "",
    };
  },
});

// ─── Get all active packages (for dropdowns) ─────────────────────────────────
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("packages")
      .withIndex("by_is_active", (q) => q.eq("isActive", true))
      .collect();
  },
});

// ─── Get single package with subscribers ─────────────────────────────────────
export const getById = query({
  args: { id: v.id("packages") },
  handler: async (ctx, args) => {
    const pkg = await ctx.db.get(args.id);
    if (!pkg) return null;

    const subscribers = await ctx.db.query("subscribers").collect();
    const assignedSubscribers = subscribers.filter((s) => s.packageId === args.id);

    return { ...pkg, subscriberCount: assignedSubscribers.length, subscribers: assignedSubscribers.slice(0, 10) };
  },
});

// ─── Stats summary ────────────────────────────────────────────────────────────
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("packages").collect();
    return {
      total: all.length,
      active: all.filter((p) => p.isActive).length,
      inactive: all.filter((p) => !p.isActive).length,
      pppoe: all.filter((p) => p.type === "pppoe").length,
      hotspot: all.filter((p) => p.type === "hotspot").length,
      static: all.filter((p) => p.type === "static").length,
    };
  },
});

// ─── Create package ───────────────────────────────────────────────────────────
export const create = mutation({
  args: {
    name: v.string(),
    speed: v.string(),
    price: v.number(),
    type: v.union(v.literal("pppoe"), v.literal("hotspot"), v.literal("static")),
    description: v.optional(v.string()),
    downloadSpeed: v.number(),
    uploadSpeed: v.number(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const id = await ctx.db.insert("packages", {
      ...args,
      createdAt: new Date().toISOString(),
    });

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "create",
      resource: "package",
      resourceId: id,
      details: `Created package: ${args.name}`,
      createdAt: new Date().toISOString(),
    });

    return id;
  },
});

// ─── Update package ───────────────────────────────────────────────────────────
export const update = mutation({
  args: {
    id: v.id("packages"),
    name: v.optional(v.string()),
    speed: v.optional(v.string()),
    price: v.optional(v.number()),
    type: v.optional(v.union(v.literal("pppoe"), v.literal("hotspot"), v.literal("static"))),
    description: v.optional(v.string()),
    downloadSpeed: v.optional(v.number()),
    uploadSpeed: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const { id, ...fields } = args;
    const updates = Object.fromEntries(
      Object.entries(fields).filter(([, val]) => val !== undefined),
    ) as Partial<typeof fields>;

    await ctx.db.patch(id, updates);

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "update",
      resource: "package",
      resourceId: id,
      details: `Updated package fields: ${Object.keys(updates).join(", ")}`,
      createdAt: new Date().toISOString(),
    });
  },
});

// ─── Toggle active status ─────────────────────────────────────────────────────
export const toggleActive = mutation({
  args: { id: v.id("packages"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    await ctx.db.patch(args.id, { isActive: args.isActive });

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "update",
      resource: "package",
      resourceId: args.id,
      details: `${args.isActive ? "Activated" : "Deactivated"} package`,
      createdAt: new Date().toISOString(),
    });
  },
});

// ─── Delete package ───────────────────────────────────────────────────────────
export const remove = mutation({
  args: { id: v.id("packages") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const pkg = await ctx.db.get(args.id);

    // Unassign from subscribers first
    const subscribers = await ctx.db.query("subscribers").collect();
    for (const sub of subscribers) {
      if (sub.packageId === args.id) {
        await ctx.db.patch(sub._id, { packageId: undefined });
      }
    }

    await ctx.db.delete(args.id);

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "delete",
      resource: "package",
      resourceId: args.id,
      details: `Deleted package: ${pkg?.name ?? "Unknown"}`,
      createdAt: new Date().toISOString(),
    });
  },
});

// ─── Bulk assign package to subscribers ──────────────────────────────────────
export const bulkAssign = mutation({
  args: {
    subscriberIds: v.array(v.id("subscribers")),
    packageId: v.id("packages"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const pkg = await ctx.db.get(args.packageId);
    if (!pkg) throw new Error("Package not found");

    for (const subId of args.subscriberIds) {
      await ctx.db.patch(subId, { packageId: args.packageId });
    }

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "bulk_assign",
      resource: "package",
      resourceId: args.packageId,
      details: `Assigned ${args.subscriberIds.length} subscribers to package: ${pkg.name}`,
      createdAt: new Date().toISOString(),
    });
  },
});
