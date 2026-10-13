import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    routerId: v.optional(v.id("routers")),
    status: v.optional(v.union(v.literal("active"), v.literal("stopped"), v.literal("interim"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    let baseQuery;
    if (args.routerId) {
      baseQuery = ctx.db
        .query("router_sessions")
        .withIndex("by_router", (q) => q.eq("routerId", args.routerId));
    } else if (args.status) {
      baseQuery = ctx.db
        .query("router_sessions")
        .withIndex("by_status", (q) => q.eq("status", args.status!));
    } else {
      baseQuery = ctx.db.query("router_sessions");
    }

    const result = await baseQuery.order("desc").paginate(args.paginationOpts);

    // Enrich with subscriber and router names
    const enriched = await Promise.all(
      result.page.map(async (session) => {
        const subscriber = session.subscriberId ? await ctx.db.get(session.subscriberId) : null;
        const router = session.routerId ? await ctx.db.get(session.routerId) : null;
        return { ...session, subscriberName: subscriber?.name, routerName: router?.name };
      }),
    );

    return { ...result, page: enriched };
  },
});

export const getActiveSummary = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const active = await ctx.db
      .query("router_sessions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const routers = await ctx.db.query("routers").collect();

    // Group by router
    const byRouter: Record<string, { routerName: string; count: number }> = {};
    for (const session of active) {
      const key = session.routerId ?? "unassigned";
      if (!byRouter[key]) {
        const router = routers.find((r) => r._id === session.routerId);
        byRouter[key] = { routerName: router?.name ?? "Unknown", count: 0 };
      }
      byRouter[key].count++;
    }

    return { total: active.length, byRouter: Object.values(byRouter) };
  },
});

export const markDisconnected = mutation({
  args: { sessionId: v.id("router_sessions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    await ctx.db.patch(args.sessionId, {
      status: "stopped",
      stopTime: new Date().toISOString(),
      terminateCause: "Admin-Reset",
    });
  },
});
