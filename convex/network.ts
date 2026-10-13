import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

const deviceTypeValidator = v.union(
  v.literal("router"),
  v.literal("switch"),
  v.literal("access_point"),
  v.literal("server"),
  v.literal("other"),
);

const statusValidator = v.union(
  v.literal("online"),
  v.literal("offline"),
  v.literal("maintenance"),
);

// ─── Stats ────────────────────────────────────────────────────────────────────
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("network_devices").collect();
    return {
      total: all.length,
      online: all.filter((d) => d.status === "online").length,
      offline: all.filter((d) => d.status === "offline").length,
      maintenance: all.filter((d) => d.status === "maintenance").length,
      routers: all.filter((d) => d.type === "router").length,
      switches: all.filter((d) => d.type === "switch").length,
      accessPoints: all.filter((d) => d.type === "access_point").length,
      servers: all.filter((d) => d.type === "server").length,
    };
  },
});

// ─── List devices (paginated + filters) ───────────────────────────────────────
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.union(statusValidator, v.literal("all"))),
    type: v.optional(v.union(deviceTypeValidator, v.literal("all"))),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let page;
    if (args.status && args.status !== "all") {
      page = await ctx.db
        .query("network_devices")
        .withIndex("by_status", (q) => q.eq("status", args.status as "online" | "offline" | "maintenance"))
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      page = await ctx.db.query("network_devices").order("desc").paginate(args.paginationOpts);
    }

    const filtered = page.page.filter((d) => {
      if (args.type && args.type !== "all" && d.type !== args.type) return false;
      if (args.search) {
        const q = args.search.toLowerCase();
        return (
          d.name.toLowerCase().includes(q) ||
          d.ipAddress.toLowerCase().includes(q) ||
          (d.location?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });

    return { ...page, page: filtered };
  },
});

// ─── Get single device ─────────────────────────────────────────────────────────
export const get = query({
  args: { id: v.id("network_devices") },
  handler: async (ctx, args) => ctx.db.get(args.id),
});

// ─── Create ────────────────────────────────────────────────────────────────────
export const create = mutation({
  args: {
    name: v.string(),
    type: deviceTypeValidator,
    ipAddress: v.string(),
    status: statusValidator,
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const id = await ctx.db.insert("network_devices", {
      ...args,
      lastSeen: args.status === "online" ? new Date().toISOString() : undefined,
      createdAt: new Date().toISOString(),
    });

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "create",
      resource: "network_device",
      resourceId: id,
      details: `Added device: ${args.name} (${args.type}) at ${args.ipAddress}`,
      createdAt: new Date().toISOString(),
    });

    return id;
  },
});

// ─── Update ────────────────────────────────────────────────────────────────────
export const update = mutation({
  args: {
    id: v.id("network_devices"),
    name: v.optional(v.string()),
    type: v.optional(deviceTypeValidator),
    ipAddress: v.optional(v.string()),
    status: v.optional(statusValidator),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const { id, ...fields } = args;
    const updates: Record<string, string | undefined> = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    ) as Record<string, string | undefined>;

    if (fields.status === "online") updates.lastSeen = new Date().toISOString();

    await ctx.db.patch(id, updates);

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "update",
      resource: "network_device",
      resourceId: id,
      details: `Updated device: ${Object.keys(updates).join(", ")}`,
      createdAt: new Date().toISOString(),
    });
  },
});

// ─── Delete ────────────────────────────────────────────────────────────────────
export const remove = mutation({
  args: { id: v.id("network_devices") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const device = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "delete",
      resource: "network_device",
      resourceId: args.id,
      details: `Removed device: ${device?.name ?? ""}`,
      createdAt: new Date().toISOString(),
    });
  },
});

// ─── Toggle status ─────────────────────────────────────────────────────────────
export const toggleStatus = mutation({
  args: {
    id: v.id("network_devices"),
    status: statusValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    await ctx.db.patch(args.id, {
      status: args.status,
      ...(args.status === "online" ? { lastSeen: new Date().toISOString() } : {}),
    });

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "update",
      resource: "network_device",
      resourceId: args.id,
      details: `Status changed to: ${args.status}`,
      createdAt: new Date().toISOString(),
    });
  },
});
