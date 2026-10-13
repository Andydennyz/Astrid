import { paginationResultValidator, paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import schema from "./schema";
import { requireWorkspaceRole } from "./model/workspace";

const readableRoles = ["owner", "admin", "billing", "network", "read_only"] as const;

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
    unreadOnly: v.optional(v.boolean()),
  },
  returns: paginationResultValidator(schema.doc("notifications")),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, readableRoles);
    const base = ctx.db.query("notifications");
    const q = args.unreadOnly
      ? base.withIndex("by_workspace_and_user_and_read", (index) =>
          index
            .eq("workspaceId", args.workspaceId)
            .eq("userId", identity.tokenIdentifier)
            .eq("read", false),
        )
      : base.withIndex("by_workspace_and_user", (index) =>
          index.eq("workspaceId", args.workspaceId).eq("userId", identity.tokenIdentifier),
        );
    return await q.order("desc").paginate(args.paginationOpts);
  },
});

export const unreadCount = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, readableRoles);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_workspace_and_user_and_read", (index) =>
        index
          .eq("workspaceId", args.workspaceId)
          .eq("userId", identity.tokenIdentifier)
          .eq("read", false),
      )
      .take(1001);
    return unread.length;
  },
});

export const markRead = mutation({
  args: { workspaceId: v.id("workspaces"), id: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, readableRoles);
    const notification = await ctx.db.get(args.id);
    if (
      !notification ||
      notification.workspaceId !== args.workspaceId ||
      notification.userId !== identity.tokenIdentifier
    ) {
      throw new Error("Notification not found");
    }
    await ctx.db.patch(args.id, { read: true });
    return null;
  },
});

export const markAllRead = mutation({
  args: { workspaceId: v.id("workspaces") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, readableRoles);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_workspace_and_user_and_read", (index) =>
        index
          .eq("workspaceId", args.workspaceId)
          .eq("userId", identity.tokenIdentifier)
          .eq("read", false),
      )
      .take(500);
    await Promise.all(unread.map((notification) => ctx.db.patch(notification._id, { read: true })));
    return unread.length;
  },
});

export const remove = mutation({
  args: { workspaceId: v.id("workspaces"), id: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, readableRoles);
    const notification = await ctx.db.get(args.id);
    if (
      !notification ||
      notification.workspaceId !== args.workspaceId ||
      notification.userId !== identity.tokenIdentifier
    ) {
      throw new Error("Notification not found");
    }
    await ctx.db.delete(args.id);
    return null;
  },
});

export const create = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    title: v.string(),
    message: v.string(),
    type: v.union(
      v.literal("info"),
      v.literal("success"),
      v.literal("warning"),
      v.literal("error"),
    ),
    link: v.optional(v.string()),
  },
  returns: v.id("notifications"),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (index) => index.eq("tokenIdentifier", args.userId))
      .unique();
    if (!user) throw new Error("Notification recipient not found");
    const membership = await ctx.db
      .query("workspace_members")
      .withIndex("by_workspace_and_user", (index) =>
        index.eq("workspaceId", args.workspaceId).eq("userId", user._id),
      )
      .unique();
    if (!membership) throw new Error("Recipient is not a workspace member");
    return await ctx.db.insert("notifications", {
      ...args,
      read: false,
      createdAt: new Date().toISOString(),
    });
  },
});

export const seedDemo = mutation({
  args: { workspaceId: v.id("workspaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, readableRoles);
    const demos = [
      { title: "New subscriber registered", message: "A new subscriber has signed up.", type: "success" as const, link: "/subscribers" },
      { title: "Invoice overdue", message: "An invoice is overdue.", type: "warning" as const, link: "/financials" },
      { title: "Network device offline", message: "A network device is offline.", type: "error" as const, link: "/network" },
      { title: "Payment received", message: "A payment was received.", type: "success" as const, link: "/transactions" },
      { title: "Ticket assigned", message: "A support ticket was assigned.", type: "info" as const, link: "/tickets" },
      { title: "Bulk SMS sent", message: "A bulk SMS was sent.", type: "info" as const, link: "/sms-reports" },
      { title: "Subscriber suspended", message: "A subscriber was suspended.", type: "warning" as const, link: "/subscribers" },
    ];
    const now = Date.now();
    for (const [index, demo] of demos.entries()) {
      await ctx.db.insert("notifications", {
        workspaceId: args.workspaceId,
        userId: identity.tokenIdentifier,
        ...demo,
        read: index > 2,
        createdAt: new Date(now - index * 3_600_000).toISOString(),
      });
    }
    return null;
  },
});
