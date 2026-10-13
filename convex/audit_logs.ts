import { query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

// ─── List audit logs (paginated) ───────────────────────────────────────────────
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    resource: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("audit_logs")
      .order("desc")
      .paginate(args.paginationOpts);

    const filtered = page.page.filter((log) => {
      if (args.resource && args.resource !== "all" && log.resource !== args.resource) return false;
      if (args.search) {
        const q = args.search.toLowerCase();
        return (
          log.action.toLowerCase().includes(q) ||
          log.resource.toLowerCase().includes(q) ||
          (log.details?.toLowerCase().includes(q) ?? false) ||
          log.userId.toLowerCase().includes(q)
        );
      }
      return true;
    });

    return { ...page, page: filtered };
  },
});

// ─── Stats ─────────────────────────────────────────────────────────────────────
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("audit_logs").collect();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 24 * 3_600_000).toISOString();

    return {
      total: all.length,
      today: all.filter((l) => l.createdAt >= todayStart).length,
      thisWeek: all.filter((l) => l.createdAt >= weekStart).length,
      byResource: all.reduce<Record<string, number>>((acc, l) => {
        acc[l.resource] = (acc[l.resource] ?? 0) + 1;
        return acc;
      }, {}),
    };
  },
});

// ─── Distinct resource types ───────────────────────────────────────────────────
export const getResources = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("audit_logs").take(500);
    return [...new Set(all.map((l) => l.resource))];
  },
});
