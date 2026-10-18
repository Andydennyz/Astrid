import { paginationResultValidator, paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireWorkspaceRole } from "./model/workspace";

const sessionStatus = v.union(v.literal("active"), v.literal("stopped"), v.literal("interim"));
const connectionType = v.union(v.literal("pppoe"), v.literal("hotspot"), v.literal("static"));
const sessionWithNames = v.object({
  _id: v.id("router_sessions"),
  _creationTime: v.number(),
  workspaceId: v.optional(v.id("workspaces")),
  routerId: v.optional(v.id("routers")),
  subscriberId: v.optional(v.id("subscribers")),
  username: v.string(),
  nasIdentifier: v.string(),
  nasIpAddress: v.optional(v.string()),
  framedIpAddress: v.optional(v.string()),
  calledStationId: v.optional(v.string()),
  callingStationId: v.optional(v.string()),
  sessionId: v.string(),
  startTime: v.string(),
  stopTime: v.optional(v.string()),
  sessionTime: v.optional(v.number()),
  inputOctets: v.optional(v.number()),
  outputOctets: v.optional(v.number()),
  inputGigawords: v.optional(v.number()),
  outputGigawords: v.optional(v.number()),
  status: sessionStatus,
  terminateCause: v.optional(v.string()),
  connectionType,
  createdAt: v.string(),
  subscriberName: v.union(v.string(), v.null()),
  routerName: v.union(v.string(), v.null()),
});

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
    routerId: v.optional(v.id("routers")),
    status: v.optional(sessionStatus),
  },
  returns: paginationResultValidator(sessionWithNames),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, [
      "owner",
      "admin",
      "network",
      "read_only",
    ]);
    let q;
    if (args.routerId) {
      const router = await ctx.db.get(args.routerId);
      if (!router || router.workspaceId !== args.workspaceId) {
        throw new ConvexError("Router does not belong to this workspace");
      }
      q = args.status
        ? ctx.db
            .query("router_sessions")
            .withIndex("by_workspace_and_router_and_status", (index) =>
              index
                .eq("workspaceId", args.workspaceId)
                .eq("routerId", args.routerId!)
                .eq("status", args.status!),
            )
        : ctx.db
            .query("router_sessions")
            .withIndex("by_workspace_and_router", (index) =>
              index.eq("workspaceId", args.workspaceId).eq("routerId", args.routerId!),
            );
    } else {
      q = args.status
        ? ctx.db
            .query("router_sessions")
            .withIndex("by_workspace_and_status", (index) =>
              index.eq("workspaceId", args.workspaceId).eq("status", args.status!),
            )
        : ctx.db
            .query("router_sessions")
            .withIndex("by_workspace", (index) => index.eq("workspaceId", args.workspaceId));
    }
    const page = await q.order("desc").paginate(args.paginationOpts);
    const enriched = await Promise.all(
      page.page.map(async (session) => {
        const [subscriber, router] = await Promise.all([
          session.subscriberId ? ctx.db.get(session.subscriberId) : null,
          session.routerId ? ctx.db.get(session.routerId) : null,
        ]);
        return {
          ...session,
          subscriberName:
            subscriber?.workspaceId === args.workspaceId ? subscriber.name : null,
          routerName: router?.workspaceId === args.workspaceId ? router.name : null,
        };
      }),
    );
    return { ...page, page: enriched };
  },
});

export const getActiveSummary = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    total: v.number(),
    byRouter: v.array(v.object({ routerName: v.string(), count: v.number() })),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, [
      "owner",
      "admin",
      "network",
      "read_only",
    ]);
    const [activeSessions, interimSessions] = await Promise.all([
      ctx.db
        .query("router_sessions")
        .withIndex("by_workspace_and_status", (index) =>
          index.eq("workspaceId", args.workspaceId).eq("status", "active"),
        )
        .take(1001),
      ctx.db
        .query("router_sessions")
        .withIndex("by_workspace_and_status", (index) =>
          index.eq("workspaceId", args.workspaceId).eq("status", "interim"),
        )
        .take(1001),
    ]);
    const fetchedCount = activeSessions.length + interimSessions.length;
    const sessions = [...activeSessions, ...interimSessions].slice(0, 1000);
    const counts = new Map<string, { routerId?: Id<"routers">; count: number }>();
    for (const session of sessions) {
      const key = session.routerId ?? "unassigned";
      const existing = counts.get(key);
      counts.set(key, { routerId: session.routerId, count: (existing?.count ?? 0) + 1 });
    }
    const byRouter = await Promise.all(
      [...counts.entries()].map(async ([key, value]) => {
        const router = value.routerId ? await ctx.db.get(value.routerId) : null;
        return {
          routerName:
            router?.workspaceId === args.workspaceId ? router.name : key === "unassigned" ? "Unassigned" : "Unknown",
          count: value.count,
        };
      }),
    );
    return { total: sessions.length, byRouter, truncated: fetchedCount > 1000 };
  },
});

export const markDisconnected = mutation({
  args: { workspaceId: v.id("workspaces"), sessionId: v.id("router_sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, ["owner", "admin", "network"]);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.workspaceId !== args.workspaceId) {
      throw new ConvexError("Session does not belong to this workspace");
    }
    if (session.routerId) {
      const router = await ctx.db.get(session.routerId);
      if (!router || router.workspaceId !== args.workspaceId) {
        throw new ConvexError("Session router does not belong to this workspace");
      }
    }
    if (session.subscriberId) {
      const subscriber = await ctx.db.get(session.subscriberId);
      if (!subscriber || subscriber.workspaceId !== args.workspaceId) {
        throw new ConvexError("Session subscriber does not belong to this workspace");
      }
    }
    await ctx.db.patch(args.sessionId, {
      status: "stopped",
      stopTime: new Date().toISOString(),
      terminateCause: "Admin-Reset",
    });
    return null;
  },
});
