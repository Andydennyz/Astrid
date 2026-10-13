import { paginationResultValidator, paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { requireWorkspaceRole } from "./model/workspace";

const radiusType = v.union(
  v.literal("authorize"),
  v.literal("authenticate"),
  v.literal("accounting"),
);
const responseCode = v.union(v.literal("accept"), v.literal("reject"), v.literal("error"));

async function requireRouterWorkspace(ctx: MutationCtx, routerId?: Id<"routers">) {
  if (!routerId) throw new ConvexError("RADIUS writes require an authenticated router gateway");
  const router = await ctx.db.get(routerId);
  if (!router?.workspaceId) {
    throw new ConvexError("Router workspace is unavailable; RADIUS bridge is disabled");
  }
  return router;
}

export const logAndAccept = internalMutation({
  args: {
    type: radiusType,
    username: v.string(),
    nasIdentifier: v.optional(v.string()),
    nasIpAddress: v.optional(v.string()),
    requestAttrs: v.optional(v.string()),
    responseAttrs: v.optional(v.string()),
    routerId: v.optional(v.id("routers")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const router = await requireRouterWorkspace(ctx, args.routerId);
    await ctx.db.insert("radius_logs", {
      ...args,
      workspaceId: router.workspaceId,
      responseCode: "accept",
      createdAt: new Date().toISOString(),
    });
    return null;
  },
});

export const logAndReject = internalMutation({
  args: {
    type: radiusType,
    username: v.string(),
    nasIdentifier: v.optional(v.string()),
    nasIpAddress: v.optional(v.string()),
    requestAttrs: v.optional(v.string()),
    responseCode: v.union(v.literal("reject"), v.literal("error")),
    rejectReason: v.optional(v.string()),
    routerId: v.optional(v.id("routers")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const router = await requireRouterWorkspace(ctx, args.routerId);
    await ctx.db.insert("radius_logs", {
      ...args,
      workspaceId: router.workspaceId,
      createdAt: new Date().toISOString(),
    });
    return null;
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
  returns: v.null(),
  handler: async (ctx, args) => {
    const router = await requireRouterWorkspace(ctx, args.routerId);
    if (args.subscriberId) {
      const subscriber = await ctx.db.get(args.subscriberId);
      if (!subscriber || subscriber.workspaceId !== router.workspaceId) {
        throw new ConvexError("RADIUS subscriber does not belong to the router workspace");
      }
    }
    const existing = await ctx.db
      .query("router_sessions")
      .withIndex("by_workspace_and_session_id", (index) =>
        index.eq("workspaceId", router.workspaceId!).eq("sessionId", args.sessionId),
      )
      .first();
    const { sessionId: _sessionId, routerId: _routerId, ...sessionFields } = args;
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...sessionFields,
        workspaceId: router.workspaceId,
        routerId: router._id,
      });
    } else {
      await ctx.db.insert("router_sessions", {
        ...args,
        workspaceId: router.workspaceId,
        routerId: router._id,
        createdAt: new Date().toISOString(),
      });
    }
    return null;
  },
});

export const listLogs = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
    type: v.optional(radiusType),
    responseCode: v.optional(responseCode),
  },
  returns: paginationResultValidator(schema.doc("radius_logs")),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, ["owner", "admin", "network", "read_only"]);
    const base = ctx.db.query("radius_logs");
    const q =
      args.type && args.responseCode
        ? base.withIndex("by_workspace_and_type_and_response_code", (index) =>
            index
              .eq("workspaceId", args.workspaceId)
              .eq("type", args.type!)
              .eq("responseCode", args.responseCode!),
          )
        : args.type
          ? base.withIndex("by_workspace_and_type", (index) =>
              index.eq("workspaceId", args.workspaceId).eq("type", args.type!),
            )
          : base.withIndex("by_workspace", (index) =>
              index.eq("workspaceId", args.workspaceId),
            );
    const page = await q.order("desc").paginate(args.paginationOpts);
    return args.responseCode && !args.type
      ? {
          ...page,
          page: page.page.filter((log) => log.responseCode === args.responseCode),
        }
      : page;
  },
});
