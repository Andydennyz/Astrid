import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema from "./schema";
import { requireWorkspaceRole } from "./model/workspace";

const readRoles = ["owner", "admin", "billing", "network", "read_only"] as const;
const writeRoles = ["owner", "admin", "network"] as const;
const deviceDoc = schema.doc("network_devices");
const deviceTypeValidator = v.union(
  v.literal("router"), v.literal("switch"), v.literal("access_point"),
  v.literal("server"), v.literal("other"),
);
const statusValidator = v.union(v.literal("online"), v.literal("offline"), v.literal("maintenance"));

export const getStats = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    total: v.number(), online: v.number(), offline: v.number(), maintenance: v.number(),
    routers: v.number(), switches: v.number(), accessPoints: v.number(), servers: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const all = await ctx.db.query("network_devices")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(8192);
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

export const list = query({
  args: {
    workspaceId: v.id("workspaces"), paginationOpts: paginationOptsValidator,
    status: v.optional(v.union(statusValidator, v.literal("all"))),
    type: v.optional(v.union(deviceTypeValidator, v.literal("all"))),
    search: v.optional(v.string()),
  },
  returns: paginationResultValidator(deviceDoc),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const page = args.status && args.status !== "all"
      ? await ctx.db.query("network_devices")
          .withIndex("by_workspace_and_status", (q) =>
            q.eq("workspaceId", args.workspaceId).eq(
              "status",
              args.status as "online" | "offline" | "maintenance",
            ))
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db.query("network_devices")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
          .order("desc")
          .paginate(args.paginationOpts);
    const search = args.search?.toLowerCase();
    return {
      ...page,
      page: page.page.filter((device) =>
        (!args.type || args.type === "all" || device.type === args.type) &&
        (!search || device.name.toLowerCase().includes(search) ||
          device.ipAddress.toLowerCase().includes(search) ||
          (device.location?.toLowerCase().includes(search) ?? false))),
    };
  },
});

export const get = query({
  args: { workspaceId: v.id("workspaces"), id: v.id("network_devices") },
  returns: v.union(deviceDoc, v.null()),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const device = await ctx.db.get(args.id);
    return device?.workspaceId === args.workspaceId ? device : null;
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"), name: v.string(), type: deviceTypeValidator,
    ipAddress: v.string(), status: statusValidator,
    location: v.optional(v.string()), notes: v.optional(v.string()),
  },
  returns: v.id("network_devices"),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const id = await ctx.db.insert("network_devices", {
      ...args,
      lastSeen: args.status === "online" ? new Date().toISOString() : undefined,
      createdAt: new Date().toISOString(),
    });
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier, action: "create",
      resource: "network_device", resourceId: id,
      details: `Added device: ${args.name} (${args.type}) at ${args.ipAddress}`,
      createdAt: new Date().toISOString(),
    });
    return id;
  },
});

export const update = mutation({
  args: {
    workspaceId: v.id("workspaces"), id: v.id("network_devices"),
    name: v.optional(v.string()), type: v.optional(deviceTypeValidator),
    ipAddress: v.optional(v.string()), status: v.optional(statusValidator),
    location: v.optional(v.string()), notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const device = await ctx.db.get(args.id);
    if (!device || device.workspaceId !== args.workspaceId) throw new Error("Device not found");
    const updates = {
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.type !== undefined ? { type: args.type } : {}),
      ...(args.ipAddress !== undefined ? { ipAddress: args.ipAddress } : {}),
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.location !== undefined ? { location: args.location } : {}),
      ...(args.notes !== undefined ? { notes: args.notes } : {}),
      ...(args.status === "online" ? { lastSeen: new Date().toISOString() } : {}),
    };
    await ctx.db.patch(args.id, updates);
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier, action: "update",
      resource: "network_device", resourceId: args.id,
      details: `Updated device: ${Object.keys(updates).join(", ")}`,
      createdAt: new Date().toISOString(),
    });
    return null;
  },
});

export const remove = mutation({
  args: { workspaceId: v.id("workspaces"), id: v.id("network_devices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const device = await ctx.db.get(args.id);
    if (!device || device.workspaceId !== args.workspaceId) throw new Error("Device not found");
    await ctx.db.delete(args.id);
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier, action: "delete",
      resource: "network_device", resourceId: args.id,
      details: `Removed device: ${device.name}`, createdAt: new Date().toISOString(),
    });
    return null;
  },
});

export const toggleStatus = mutation({
  args: { workspaceId: v.id("workspaces"), id: v.id("network_devices"), status: statusValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const device = await ctx.db.get(args.id);
    if (!device || device.workspaceId !== args.workspaceId) throw new Error("Device not found");
    await ctx.db.patch(args.id, {
      status: args.status,
      ...(args.status === "online" ? { lastSeen: new Date().toISOString() } : {}),
    });
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier, action: "update",
      resource: "network_device", resourceId: args.id,
      details: `Status changed to: ${args.status}`, createdAt: new Date().toISOString(),
    });
    return null;
  },
});
