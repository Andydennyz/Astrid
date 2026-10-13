import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema from "./schema";
import { requireWorkspaceRole } from "./model/workspace";

const readRoles = ["owner", "admin", "billing", "network", "read_only"] as const;
const writeRoles = ["owner", "admin", "billing"] as const;
const subscriberDoc = schema.doc("subscribers").omit("pppoeUsername", "pppoePassword");
const packageDoc = schema.doc("packages");
const invoiceDoc = schema.doc("invoices");
const transactionDoc = schema.doc("transactions");
const subscriberListDoc = subscriberDoc.extend({
  packageName: v.union(v.string(), v.null()),
  packageSpeed: v.union(v.string(), v.null()),
});
const subscriberDetails = subscriberDoc.extend({
  package: v.union(packageDoc, v.null()),
  invoices: v.array(invoiceDoc),
  transactions: v.array(transactionDoc),
});
const statusValidator = v.union(
  v.literal("active"), v.literal("suspended"), v.literal("expired"), v.literal("pending"),
);
const connectionTypeValidator = v.union(
  v.literal("pppoe"), v.literal("hotspot"), v.literal("static"),
);

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.union(statusValidator, v.literal("all"))),
    connectionType: v.optional(v.union(connectionTypeValidator, v.literal("all"))),
    search: v.optional(v.string()),
  },
  returns: paginationResultValidator(subscriberListDoc),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const page = args.status && args.status !== "all"
      ? await ctx.db.query("subscribers")
          .withIndex("by_workspace_and_status", (q) =>
            q.eq("workspaceId", args.workspaceId).eq(
              "status",
              args.status as "active" | "suspended" | "expired" | "pending",
            ),
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db.query("subscribers")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
          .order("desc")
          .paginate(args.paginationOpts);
    const search = args.search?.toLowerCase();
    const filtered = page.page.filter((subscriber) => {
      if (args.connectionType && args.connectionType !== "all" &&
          subscriber.connectionType !== args.connectionType) return false;
      return !search || subscriber.name.toLowerCase().includes(search) ||
        subscriber.phone.toLowerCase().includes(search) ||
        (subscriber.email?.toLowerCase().includes(search) ?? false) ||
        (subscriber.ipAddress?.toLowerCase().includes(search) ?? false);
    });
    const enriched = await Promise.all(filtered.map(async (subscriber) => {
      const pkg = subscriber.packageId ? await ctx.db.get(subscriber.packageId) : null;
      const safePackage = pkg?.workspaceId === args.workspaceId ? pkg : null;
      const { pppoeUsername: _username, pppoePassword: _password, ...safeSubscriber } = subscriber;
      return {
        ...safeSubscriber,
        packageName: safePackage?.name ?? null,
        packageSpeed: safePackage?.speed ?? null,
      };
    }));
    return { ...page, page: enriched };
  },
});

export const getById = query({
  args: { workspaceId: v.id("workspaces"), id: v.id("subscribers") },
  returns: v.union(subscriberDetails, v.null()),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const subscriber = await ctx.db.get(args.id);
    if (!subscriber || subscriber.workspaceId !== args.workspaceId) return null;
    const [pkg, invoices, transactions] = await Promise.all([
      subscriber.packageId ? ctx.db.get(subscriber.packageId) : null,
      ctx.db.query("invoices")
        .withIndex("by_workspace_and_subscriber", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("subscriberId", args.id),
        )
        .order("desc")
        .take(5),
      ctx.db.query("transactions")
        .withIndex("by_workspace_and_subscriber", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("subscriberId", args.id),
        )
        .order("desc")
        .take(5),
    ]);
    const { pppoeUsername: _username, pppoePassword: _password, ...safeSubscriber } = subscriber;
    return {
      ...safeSubscriber,
      package: pkg?.workspaceId === args.workspaceId ? pkg : null,
      invoices,
      transactions,
    };
  },
});

export const getPackages = query({
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

export const getStats = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    total: v.number(), active: v.number(), suspended: v.number(), expired: v.number(),
    pending: v.number(), online: v.number(), pppoe: v.number(), hotspot: v.number(),
    staticConn: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const all = await ctx.db.query("subscribers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(8192);
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

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"), name: v.string(), email: v.optional(v.string()),
    phone: v.string(), status: statusValidator, connectionType: connectionTypeValidator,
    packageId: v.optional(v.id("packages")), ipAddress: v.optional(v.string()),
    macAddress: v.optional(v.string()), monthlyFee: v.number(), balance: v.number(),
    address: v.optional(v.string()), notes: v.optional(v.string()),
  },
  returns: v.id("subscribers"),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    if (args.packageId) {
      const pkg = await ctx.db.get(args.packageId);
      if (!pkg || pkg.workspaceId !== args.workspaceId) throw new Error("Package not found");
    }
    const id = await ctx.db.insert("subscribers", {
      ...args, isOnline: false, createdAt: new Date().toISOString(),
    });
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier, action: "create",
      resource: "subscriber", resourceId: id, details: `Created subscriber: ${args.name}`,
      createdAt: new Date().toISOString(),
    });
    return id;
  },
});

export const update = mutation({
  args: {
    workspaceId: v.id("workspaces"), id: v.id("subscribers"),
    name: v.optional(v.string()), email: v.optional(v.string()), phone: v.optional(v.string()),
    status: v.optional(statusValidator), connectionType: v.optional(connectionTypeValidator),
    packageId: v.optional(v.id("packages")), ipAddress: v.optional(v.string()),
    macAddress: v.optional(v.string()), monthlyFee: v.optional(v.number()),
    balance: v.optional(v.number()), address: v.optional(v.string()), notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const subscriber = await ctx.db.get(args.id);
    if (!subscriber || subscriber.workspaceId !== args.workspaceId) throw new Error("Subscriber not found");
    if (args.packageId) {
      const pkg = await ctx.db.get(args.packageId);
      if (!pkg || pkg.workspaceId !== args.workspaceId) throw new Error("Package not found");
    }
    const { workspaceId: _workspaceId, id, ...fields } = args;
    const updates = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
    await ctx.db.patch(id, updates);
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier, action: "update",
      resource: "subscriber", resourceId: id,
      details: `Updated subscriber fields: ${Object.keys(updates).join(", ")}`,
      createdAt: new Date().toISOString(),
    });
    return null;
  },
});

export const updateStatus = mutation({
  args: { workspaceId: v.id("workspaces"), ids: v.array(v.id("subscribers")), status: statusValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    for (const id of args.ids) {
      const subscriber = await ctx.db.get(id);
      if (!subscriber || subscriber.workspaceId !== args.workspaceId) throw new Error("Subscriber not found");
      await ctx.db.patch(id, { status: args.status });
    }
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier,
      action: "bulk_status_update", resource: "subscriber",
      details: `Updated ${args.ids.length} subscribers to status: ${args.status}`,
      createdAt: new Date().toISOString(),
    });
    return null;
  },
});

export const remove = mutation({
  args: { workspaceId: v.id("workspaces"), id: v.id("subscribers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const subscriber = await ctx.db.get(args.id);
    if (!subscriber || subscriber.workspaceId !== args.workspaceId) throw new Error("Subscriber not found");
    const [invoices, transactions, tickets] = await Promise.all([
      ctx.db.query("invoices").withIndex("by_workspace_and_subscriber", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("subscriberId", args.id)).take(1),
      ctx.db.query("transactions").withIndex("by_workspace_and_subscriber", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("subscriberId", args.id)).take(1),
      ctx.db.query("tickets").withIndex("by_workspace_and_subscriber", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("subscriberId", args.id)).take(1),
    ]);
    if (invoices.length || transactions.length || tickets.length) {
      throw new Error("Subscriber has linked records and cannot be deleted");
    }
    await ctx.db.delete(args.id);
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier, action: "delete",
      resource: "subscriber", resourceId: args.id,
      details: `Deleted subscriber: ${subscriber.name}`, createdAt: new Date().toISOString(),
    });
    return null;
  },
});
