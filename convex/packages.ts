import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema from "./schema";
import { requireWorkspaceRole } from "./model/workspace";

const readRoles = ["owner", "admin", "billing", "network", "read_only"] as const;
const writeRoles = ["owner", "admin", "billing"] as const;
const packageDoc = schema.doc("packages");
const subscriberDoc = schema
  .doc("subscribers")
  .omit(
    "pppoeUsername",
    "pppoePassword",
    "pppoePasswordCiphertext",
    "pppoePasswordIv",
    "hotspotUsername",
    "hotspotPassword",
    "hotspotPasswordCiphertext",
    "hotspotPasswordIv",
  );
const packageWithCount = packageDoc.extend({ subscriberCount: v.number() });
const packageWithSubscribers = packageWithCount.extend({
  subscribers: v.array(subscriberDoc),
});

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
    type: v.optional(v.union(v.literal("pppoe"), v.literal("hotspot"), v.literal("static"), v.literal("all"))),
    isActive: v.optional(v.union(v.literal("active"), v.literal("inactive"), v.literal("all"))),
    search: v.optional(v.string()),
  },
  returns: paginationResultValidator(packageWithCount),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const page = await ctx.db
      .query("packages")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .paginate(args.paginationOpts);
    const filtered = page.page.filter((pkg) => {
      if (args.type && args.type !== "all" && pkg.type !== args.type) return false;
      if (args.isActive && args.isActive !== "all" && pkg.isActive !== (args.isActive === "active")) return false;
      const search = args.search?.toLowerCase();
      return !search || pkg.name.toLowerCase().includes(search) ||
        pkg.speed.toLowerCase().includes(search) ||
        (pkg.description?.toLowerCase().includes(search) ?? false);
    });
    const enriched = await Promise.all(filtered.map(async (pkg) => {
      const assigned = await ctx.db
        .query("subscribers")
        .withIndex("by_workspace_and_package", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("packageId", pkg._id),
        )
        .take(8192);
      return { ...pkg, subscriberCount: assigned.length };
    }));
    return { ...page, page: enriched };
  },
});

export const listActive = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(packageDoc),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    return await ctx.db.query("packages")
      .withIndex("by_workspace_and_is_active", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("isActive", true),
      )
      .take(200);
  },
});

export const getById = query({
  args: { workspaceId: v.id("workspaces"), id: v.id("packages") },
  returns: v.union(packageWithSubscribers, v.null()),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const pkg = await ctx.db.get(args.id);
    if (!pkg || pkg.workspaceId !== args.workspaceId) return null;
    const [assigned, subscribers] = await Promise.all([
      ctx.db.query("subscribers")
        .withIndex("by_workspace_and_package", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("packageId", args.id),
        )
        .take(8192),
      ctx.db.query("subscribers")
        .withIndex("by_workspace_and_package", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("packageId", args.id),
        )
        .take(10),
    ]);
    return {
      ...pkg,
      subscriberCount: assigned.length,
      subscribers: subscribers.map(({
        pppoeUsername: _username,
        pppoePassword: _password,
        pppoePasswordCiphertext: _ciphertext,
        pppoePasswordIv: _iv,
        hotspotUsername: _hotspotUsername,
        hotspotPassword: _hotspotPassword,
        hotspotPasswordCiphertext: _hotspotCiphertext,
        hotspotPasswordIv: _hotspotIv,
        ...sub
      }) => sub),
    };
  },
});

export const getStats = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    total: v.number(), active: v.number(), inactive: v.number(),
    pppoe: v.number(), hotspot: v.number(), static: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const all = await ctx.db.query("packages")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(8192);
    return {
      total: all.length,
      active: all.filter((pkg) => pkg.isActive).length,
      inactive: all.filter((pkg) => !pkg.isActive).length,
      pppoe: all.filter((pkg) => pkg.type === "pppoe").length,
      hotspot: all.filter((pkg) => pkg.type === "hotspot").length,
      static: all.filter((pkg) => pkg.type === "static").length,
    };
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(), speed: v.string(), price: v.number(),
    type: v.union(v.literal("pppoe"), v.literal("hotspot"), v.literal("static")),
    description: v.optional(v.string()), downloadSpeed: v.number(),
    uploadSpeed: v.number(), isActive: v.boolean(),
  },
  returns: v.id("packages"),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const { workspaceId, ...fields } = args;
    const id = await ctx.db.insert("packages", {
      ...fields, workspaceId, createdAt: new Date().toISOString(),
    });
    await ctx.db.insert("audit_logs", {
      workspaceId, userId: identity.tokenIdentifier, action: "create",
      resource: "package", resourceId: id, details: `Created package: ${args.name}`,
      createdAt: new Date().toISOString(),
    });
    return id;
  },
});

export const update = mutation({
  args: {
    workspaceId: v.id("workspaces"), id: v.id("packages"),
    name: v.optional(v.string()), speed: v.optional(v.string()),
    price: v.optional(v.number()),
    type: v.optional(v.union(v.literal("pppoe"), v.literal("hotspot"), v.literal("static"))),
    description: v.optional(v.string()), downloadSpeed: v.optional(v.number()),
    uploadSpeed: v.optional(v.number()), isActive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const pkg = await ctx.db.get(args.id);
    if (!pkg || pkg.workspaceId !== args.workspaceId) throw new Error("Package not found");
    const { workspaceId: _workspaceId, id, ...fields } = args;
    const updates = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
    await ctx.db.patch(id, updates);
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier, action: "update",
      resource: "package", resourceId: id,
      details: `Updated package fields: ${Object.keys(updates).join(", ")}`,
      createdAt: new Date().toISOString(),
    });
    return null;
  },
});

export const toggleActive = mutation({
  args: { workspaceId: v.id("workspaces"), id: v.id("packages"), isActive: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const pkg = await ctx.db.get(args.id);
    if (!pkg || pkg.workspaceId !== args.workspaceId) throw new Error("Package not found");
    await ctx.db.patch(args.id, { isActive: args.isActive });
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier, action: "update",
      resource: "package", resourceId: args.id,
      details: `${args.isActive ? "Activated" : "Deactivated"} package`,
      createdAt: new Date().toISOString(),
    });
    return null;
  },
});

export const remove = mutation({
  args: { workspaceId: v.id("workspaces"), id: v.id("packages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const pkg = await ctx.db.get(args.id);
    if (!pkg || pkg.workspaceId !== args.workspaceId) throw new Error("Package not found");
    const assigned = await ctx.db.query("subscribers")
      .withIndex("by_workspace_and_package", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("packageId", args.id),
      )
      .take(1);
    if (assigned.length) throw new Error("Package is assigned to subscribers");
    await ctx.db.delete(args.id);
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier, action: "delete",
      resource: "package", resourceId: args.id, details: `Deleted package: ${pkg.name}`,
      createdAt: new Date().toISOString(),
    });
    return null;
  },
});

export const bulkAssign = mutation({
  args: {
    workspaceId: v.id("workspaces"), subscriberIds: v.array(v.id("subscribers")),
    packageId: v.id("packages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg || pkg.workspaceId !== args.workspaceId) throw new Error("Package not found");
    for (const subscriberId of args.subscriberIds) {
      const subscriber = await ctx.db.get(subscriberId);
      if (!subscriber || subscriber.workspaceId !== args.workspaceId) throw new Error("Subscriber not found");
      await ctx.db.patch(subscriberId, { packageId: args.packageId });
    }
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier,
      action: "bulk_assign", resource: "package", resourceId: args.packageId,
      details: `Assigned ${args.subscriberIds.length} subscribers to package: ${pkg.name}`,
      createdAt: new Date().toISOString(),
    });
    return null;
  },
});
