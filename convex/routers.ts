import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { ConvexError } from "convex/values";
import { requireWorkspaceRole } from "./model/workspace";

const routerStatus = v.union(v.literal("online"), v.literal("offline"), v.literal("unknown"));
const publicRouter = v.object({
  _id: v.id("routers"),
  _creationTime: v.number(),
  workspaceId: v.optional(v.id("workspaces")),
  name: v.string(),
  publicKey: v.string(),
  tunnelIp: v.optional(v.string()),
  serverPublicKey: v.optional(v.string()),
  serverEndpoint: v.optional(v.string()),
  serverTunnelIp: v.optional(v.string()),
  allowedIPs: v.optional(v.string()),
  dns: v.optional(v.string()),
  ipAddress: v.optional(v.string()),
  location: v.optional(v.string()),
  model: v.optional(v.string()),
  status: routerStatus,
  lastSeen: v.optional(v.string()),
  notes: v.optional(v.string()),
  nasIdentifier: v.string(),
  routerOsVersion: v.optional(v.union(v.literal("v6"), v.literal("v7"))),
  createdAt: v.string(),
});
const readableRoles = ["owner", "admin", "network", "read_only"] as const;

export const list = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(publicRouter),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readableRoles);
    const routers = await ctx.db
      .query("routers")
      .withIndex("by_workspace", (index) => index.eq("workspaceId", args.workspaceId))
      .take(500);
    return routers.map(
      ({
        privateKey: _privateKey,
        presharedKey: _presharedKey,
        radiusSecret: _radiusSecret,
        radiusSecretHash: _radiusSecretHash,
        ...router
      }) => router,
    );
  },
});

export const getById = query({
  args: { workspaceId: v.id("workspaces"), id: v.id("routers") },
  returns: v.union(publicRouter, v.null()),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readableRoles);
    const router = await ctx.db.get(args.id);
    if (!router || router.workspaceId !== args.workspaceId) return null;
    const {
      privateKey: _privateKey,
      presharedKey: _presharedKey,
      radiusSecret: _radiusSecret,
      radiusSecretHash: _radiusSecretHash,
      ...safeRouter
    } = router;
    return safeRouter;
  },
});

export const getStats = query({
  args: { workspaceId: v.id("workspaces"), routerId: v.id("routers") },
  returns: v.object({
    activeSessions: v.number(),
    totalSessions: v.number(),
    totalDownloadBytes: v.number(),
    totalUploadBytes: v.number(),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readableRoles);
    const router = await ctx.db.get(args.routerId);
    if (!router || router.workspaceId !== args.workspaceId) {
      throw new ConvexError("Router does not belong to this workspace");
    }
    const [active, recent] = await Promise.all([
      ctx.db
        .query("router_sessions")
        .withIndex("by_workspace_and_router_and_status", (index) =>
          index
            .eq("workspaceId", args.workspaceId)
            .eq("routerId", args.routerId)
            .eq("status", "active"),
        )
        .take(1001),
      ctx.db
        .query("router_sessions")
        .withIndex("by_workspace_and_router", (index) =>
          index.eq("workspaceId", args.workspaceId).eq("routerId", args.routerId),
        )
        .order("desc")
        .take(100),
    ]);
    let totalDownloadBytes = 0;
    let totalUploadBytes = 0;
    for (const session of recent) {
      totalDownloadBytes +=
        (session.inputOctets ?? 0) + (session.inputGigawords ?? 0) * 4_294_967_296;
      totalUploadBytes +=
        (session.outputOctets ?? 0) + (session.outputGigawords ?? 0) * 4_294_967_296;
    }
    return {
      activeSessions: Math.min(active.length, 1000),
      totalSessions: recent.length,
      totalDownloadBytes,
      totalUploadBytes,
      truncated: active.length > 1000,
    };
  },
});

export const update = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    id: v.id("routers"),
    name: v.optional(v.string()),
    tunnelIp: v.optional(v.string()),
    serverPublicKey: v.optional(v.string()),
    serverEndpoint: v.optional(v.string()),
    serverTunnelIp: v.optional(v.string()),
    allowedIPs: v.optional(v.string()),
    dns: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    location: v.optional(v.string()),
    model: v.optional(v.string()),
    notes: v.optional(v.string()),
    nasIdentifier: v.optional(v.string()),
    status: v.optional(routerStatus),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, ["owner", "admin", "network"]);
    const router = await ctx.db.get(args.id);
    if (!router || router.workspaceId !== args.workspaceId) {
      throw new ConvexError("Router does not belong to this workspace");
    }
    if (args.nasIdentifier && args.nasIdentifier !== router.nasIdentifier) {
      const existing = await ctx.db
        .query("routers")
        .withIndex("by_workspace_and_nas_identifier", (index) =>
          index.eq("workspaceId", args.workspaceId).eq("nasIdentifier", args.nasIdentifier!),
        )
        .first();
      if (existing && existing._id !== args.id) {
        throw new ConvexError("NAS Identifier already exists in this workspace");
      }
    }
    const {
      id: _id,
      workspaceId: _workspaceId,
      name,
      tunnelIp,
      serverPublicKey,
      serverEndpoint,
      serverTunnelIp,
      allowedIPs,
      dns,
      ipAddress,
      location,
      model,
      notes,
      nasIdentifier,
      status,
    } = args;
    await ctx.db.patch(args.id, {
      ...(name !== undefined && { name }),
      ...(tunnelIp !== undefined && { tunnelIp }),
      ...(serverPublicKey !== undefined && { serverPublicKey }),
      ...(serverEndpoint !== undefined && { serverEndpoint }),
      ...(serverTunnelIp !== undefined && { serverTunnelIp }),
      ...(allowedIPs !== undefined && { allowedIPs }),
      ...(dns !== undefined && { dns }),
      ...(ipAddress !== undefined && { ipAddress }),
      ...(location !== undefined && { location }),
      ...(model !== undefined && { model }),
      ...(notes !== undefined && { notes }),
      ...(nasIdentifier !== undefined && { nasIdentifier }),
      ...(status !== undefined && { status }),
    });
    return null;
  },
});

export const remove = mutation({
  args: { workspaceId: v.id("workspaces"), id: v.id("routers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, ["owner", "admin", "network"]);
    const router = await ctx.db.get(args.id);
    if (!router || router.workspaceId !== args.workspaceId) {
      throw new ConvexError("Router does not belong to this workspace");
    }
    await ctx.db.delete(args.id);
    return null;
  },
});

export const updateLastSeen = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    id: v.id("routers"),
    status: routerStatus,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const router = await ctx.db.get(args.id);
    if (!router || router.workspaceId !== args.workspaceId) {
      throw new ConvexError("Router does not belong to this workspace");
    }
    await ctx.db.patch(args.id, { lastSeen: new Date().toISOString(), status: args.status });
    return null;
  },
});

const managementSetupStatus = v.union(
  v.literal("prepared"),
  v.literal("operator_applied"),
);
const publicManagementSetup = v.object({
  _id: v.id("router_management_setups"),
  _creationTime: v.number(),
  workspaceId: v.id("workspaces"),
  routerId: v.id("routers"),
  managementAddress: v.string(),
  gatewaySourceAddress: v.string(),
  apiPort: v.literal(8729),
  apiUsername: v.string(),
  certificateName: v.string(),
  scriptVersion: v.literal("routeros-v7-api-ssl-v1"),
  scriptSha256: v.string(),
  status: managementSetupStatus,
  createdBy: v.id("users"),
  createdAt: v.string(),
  operatorAppliedAt: v.optional(v.string()),
});

function isIpv4Address(value: string) {
  const octets = value.split(".");
  return octets.length === 4 && octets.every((octet) => {
    if (!/^(0|[1-9]\d{0,2})$/.test(octet)) return false;
    const number = Number(octet);
    return number <= 255;
  });
}

export const listManagementSetups = query({
  args: {
    workspaceId: v.id("workspaces"),
    routerId: v.id("routers"),
  },
  returns: v.array(publicManagementSetup),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readableRoles);
    const router = await ctx.db.get(args.routerId);
    if (!router || router.workspaceId !== args.workspaceId) {
      throw new ConvexError("Router does not belong to this workspace");
    }
    return await ctx.db
      .query("router_management_setups")
      .withIndex("by_workspace_and_router", (index) =>
        index.eq("workspaceId", args.workspaceId).eq("routerId", args.routerId),
      )
      .order("desc")
      .take(10);
  },
});

export const recordManagementSetup = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    routerId: v.id("routers"),
    managementAddress: v.string(),
    gatewaySourceAddress: v.string(),
    apiUsername: v.string(),
    certificateName: v.string(),
    scriptSha256: v.string(),
  },
  returns: v.id("router_management_setups"),
  handler: async (ctx, args) => {
    const { user } = await requireWorkspaceRole(
      ctx,
      args.workspaceId,
      ["owner", "admin", "network"],
    );
    const router = await ctx.db.get(args.routerId);
    if (!router || router.workspaceId !== args.workspaceId) {
      throw new ConvexError("Router does not belong to this workspace");
    }
    if (
      !isIpv4Address(args.managementAddress) ||
      !isIpv4Address(args.gatewaySourceAddress) ||
      args.managementAddress === args.gatewaySourceAddress
    ) {
      throw new ConvexError("Enter distinct valid IPv4 addresses for router and gateway");
    }
    if (!/^astrid-api-[a-f0-9]{12}$/.test(args.apiUsername)) {
      throw new ConvexError("Generated management username is invalid");
    }
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(args.certificateName)) {
      throw new ConvexError("Certificate name must use 1-64 letters, digits, dots, dashes, or underscores");
    }
    if (!/^[a-f0-9]{64}$/.test(args.scriptSha256)) {
      throw new ConvexError("Router setup script fingerprint is invalid");
    }

    return await ctx.db.insert("router_management_setups", {
      workspaceId: args.workspaceId,
      routerId: args.routerId,
      managementAddress: args.managementAddress,
      gatewaySourceAddress: args.gatewaySourceAddress,
      apiPort: 8729,
      apiUsername: args.apiUsername,
      certificateName: args.certificateName,
      scriptVersion: "routeros-v7-api-ssl-v1",
      scriptSha256: args.scriptSha256,
      status: "prepared",
      createdBy: user._id,
      createdAt: new Date().toISOString(),
    });
  },
});

export const markManagementSetupApplied = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    setupId: v.id("router_management_setups"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, ["owner", "admin", "network"]);
    const setup = await ctx.db.get(args.setupId);
    if (!setup || setup.workspaceId !== args.workspaceId) {
      throw new ConvexError("Router management setup does not belong to this workspace");
    }
    const router = await ctx.db.get(setup.routerId);
    if (!router || router.workspaceId !== args.workspaceId) {
      throw new ConvexError("Router does not belong to this workspace");
    }
    if (setup.status === "prepared") {
      await ctx.db.patch(setup._id, {
        status: "operator_applied",
        operatorAppliedAt: new Date().toISOString(),
      });
    }
    return null;
  },
});
