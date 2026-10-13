import { paginationResultValidator, paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import schema from "./schema";
import { requireWorkspaceRole } from "./model/workspace";

const readableRoles = ["owner", "admin", "billing", "network", "read_only"] as const;

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
    resource: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  returns: paginationResultValidator(schema.doc("audit_logs")),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readableRoles);
    const page = await ctx.db
      .query("audit_logs")
      .withIndex("by_workspace_and_created_at", (index) =>
        index.eq("workspaceId", args.workspaceId),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const search = args.search?.toLowerCase();
    const filtered = page.page.filter((log) => {
      if (args.resource && args.resource !== "all" && log.resource !== args.resource) return false;
      return (
        !search ||
        log.action.toLowerCase().includes(search) ||
        log.resource.toLowerCase().includes(search) ||
        (log.details?.toLowerCase().includes(search) ?? false) ||
        log.userId.toLowerCase().includes(search)
      );
    });
    return { ...page, page: filtered };
  },
});

export const getStats = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    total: v.number(),
    today: v.number(),
    thisWeek: v.number(),
    byResource: v.record(v.string(), v.number()),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readableRoles);
    const fetched = await ctx.db
      .query("audit_logs")
      .withIndex("by_workspace_and_created_at", (index) =>
        index.eq("workspaceId", args.workspaceId),
      )
      .order("desc")
      .take(1001);
    const logs = fetched.slice(0, 1000);
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const weekStart = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
    const byResource: Record<string, number> = {};
    let today = 0;
    let thisWeek = 0;
    for (const log of logs) {
      if (log.createdAt >= todayStart) today++;
      if (log.createdAt >= weekStart) thisWeek++;
      if (log.resource) byResource[log.resource] = (byResource[log.resource] ?? 0) + 1;
    }
    return { total: logs.length, today, thisWeek, byResource, truncated: fetched.length > 1000 };
  },
});

export const getResources = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readableRoles);
    const logs = await ctx.db
      .query("audit_logs")
      .withIndex("by_workspace_and_created_at", (index) =>
        index.eq("workspaceId", args.workspaceId),
      )
      .order("desc")
      .take(500);
    return [...new Set(logs.map((log) => log.resource))];
  },
});
