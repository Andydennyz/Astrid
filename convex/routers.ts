import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ConvexError } from "convex/values";

// ─── Queries ────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return await ctx.db.query("routers").collect();
  },
});

export const getById = query({
  args: { id: v.id("routers") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return await ctx.db.get(args.id);
  },
});

export const getStats = query({
  args: { routerId: v.id("routers") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const activeSessions = await ctx.db
      .query("router_sessions")
      .withIndex("by_router", (q) => q.eq("routerId", args.routerId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const recentSessions = await ctx.db
      .query("router_sessions")
      .withIndex("by_router", (q) => q.eq("routerId", args.routerId))
      .order("desc")
      .take(100);

    // Compute total bytes transferred across recent sessions
    let totalDownload = 0;
    let totalUpload = 0;
    for (const s of recentSessions) {
      const gw = 4294967296; // 2^32
      totalDownload += (s.inputOctets ?? 0) + (s.inputGigawords ?? 0) * gw;
      totalUpload += (s.outputOctets ?? 0) + (s.outputGigawords ?? 0) * gw;
    }

    return {
      activeSessions: activeSessions.length,
      totalSessions: recentSessions.length,
      totalDownloadBytes: totalDownload,
      totalUploadBytes: totalUpload,
    };
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    name: v.string(),
    publicKey: v.string(),
    privateKey: v.string(),
    presharedKey: v.optional(v.string()),
    tunnelIp: v.string(),
    serverPublicKey: v.string(),
    serverEndpoint: v.string(),
    serverTunnelIp: v.string(),
    allowedIPs: v.string(),
    dns: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    location: v.optional(v.string()),
    model: v.optional(v.string()),
    notes: v.optional(v.string()),
    radiusSecret: v.string(),
    nasIdentifier: v.string(),
    routerOsVersion: v.optional(v.union(v.literal("v6"), v.literal("v7"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    // Ensure nasIdentifier unique
    const existing = await ctx.db
      .query("routers")
      .withIndex("by_nas_identifier", (q) => q.eq("nasIdentifier", args.nasIdentifier))
      .first();
    if (existing) {
      throw new ConvexError({ message: "NAS Identifier already in use by another router", code: "CONFLICT" });
    }

    return await ctx.db.insert("routers", {
      ...args,
      status: "unknown",
      createdAt: new Date().toISOString(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("routers"),
    name: v.optional(v.string()),
    presharedKey: v.optional(v.string()),
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
    radiusSecret: v.optional(v.string()),
    nasIdentifier: v.optional(v.string()),
    status: v.optional(v.union(v.literal("online"), v.literal("offline"), v.literal("unknown"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const { id, ...fields } = args;
    const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    await ctx.db.patch(id, clean);
  },
});

export const remove = mutation({
  args: { id: v.id("routers") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    await ctx.db.delete(args.id);
  },
});

export const updateLastSeen = mutation({
  args: { id: v.id("routers"), status: v.union(v.literal("online"), v.literal("offline"), v.literal("unknown")) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lastSeen: new Date().toISOString(), status: args.status });
  },
});
