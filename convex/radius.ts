import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";

// ─── Internal mutations called from HTTP actions ──────────────────────────────

export const logAndAccept = internalMutation({
  args: {
    type: v.union(v.literal("authorize"), v.literal("authenticate"), v.literal("accounting")),
    username: v.string(),
    nasIdentifier: v.optional(v.string()),
    nasIpAddress: v.optional(v.string()),
    requestAttrs: v.optional(v.string()),
    responseAttrs: v.optional(v.string()),
    routerId: v.optional(v.id("routers")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("radius_logs", {
      ...args,
      responseCode: "accept",
      createdAt: new Date().toISOString(),
    });
  },
});

export const logAndReject = internalMutation({
  args: {
    type: v.union(v.literal("authorize"), v.literal("authenticate"), v.literal("accounting")),
    username: v.string(),
    nasIdentifier: v.optional(v.string()),
    nasIpAddress: v.optional(v.string()),
    requestAttrs: v.optional(v.string()),
    responseCode: v.union(v.literal("reject"), v.literal("error")),
    rejectReason: v.optional(v.string()),
    routerId: v.optional(v.id("routers")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("radius_logs", {
      ...args,
      createdAt: new Date().toISOString(),
    });
  },
});

export const upsertSession = internalMutation({
  args: {
    sessionId: v.string(),
    routerId: v.optional(v.id("routers")),
    subscriberId: v.optional(v.id("subscribers")),
    username: v.string(),
    nasIdentifier: v.string(),
    nasIpAddress: v.optional(v.string()),
    framedIpAddress: v.optional(v.string()),
    calledStationId: v.optional(v.string()),
    callingStationId: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("stopped"), v.literal("interim")),
    startTime: v.string(),
    stopTime: v.optional(v.string()),
    sessionTime: v.optional(v.number()),
    inputOctets: v.optional(v.number()),
    outputOctets: v.optional(v.number()),
    inputGigawords: v.optional(v.number()),
    outputGigawords: v.optional(v.number()),
    terminateCause: v.optional(v.string()),
    connectionType: v.union(v.literal("pppoe"), v.literal("hotspot"), v.literal("static")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("router_sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (existing) {
      const { sessionId: _sid, ...rest } = args;
      await ctx.db.patch(existing._id, rest);
    } else {
      await ctx.db.insert("router_sessions", {
        ...args,
        createdAt: new Date().toISOString(),
      });
    }
  },
});

// ─── Queries ─────────────────────────────────────────────────────────────────

export const listLogs = query({
  args: {
    paginationOpts: paginationOptsValidator,
    type: v.optional(v.union(v.literal("authorize"), v.literal("authenticate"), v.literal("accounting"))),
    responseCode: v.optional(v.union(v.literal("accept"), v.literal("reject"), v.literal("error"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    let q = ctx.db.query("radius_logs").order("desc");

    if (args.type) {
      q = ctx.db
        .query("radius_logs")
        .withIndex("by_type", (qi) => qi.eq("type", args.type!))
        .order("desc");
    }

    return await q.paginate(args.paginationOpts);
  },
});
