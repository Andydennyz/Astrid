import { paginationResultValidator, paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema from "./schema";
import { requireWorkspaceRole } from "./model/workspace";

const readableRoles = ["owner", "admin", "billing", "read_only"] as const;
const smsType = v.union(
  v.literal("invoice"),
  v.literal("reminder"),
  v.literal("custom"),
  v.literal("system"),
);
const smsLogWithSubscriber = v.object({
  _id: v.id("sms_logs"),
  _creationTime: v.number(),
  workspaceId: v.optional(v.id("workspaces")),
  recipient: v.string(),
  message: v.string(),
  status: v.union(v.literal("sent"), v.literal("failed"), v.literal("pending")),
  type: smsType,
  subscriberId: v.optional(v.id("subscribers")),
  cost: v.optional(v.number()),
  sentAt: v.string(),
  subscriberName: v.union(v.string(), v.null()),
});

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
    status: v.optional(
      v.union(v.literal("sent"), v.literal("failed"), v.literal("pending"), v.literal("all")),
    ),
    type: v.optional(v.union(smsType, v.literal("all"))),
    search: v.optional(v.string()),
  },
  returns: paginationResultValidator(smsLogWithSubscriber),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readableRoles);
    const base = ctx.db.query("sms_logs");
    const q =
      args.status && args.status !== "all"
        ? base.withIndex("by_workspace_and_status", (index) =>
            index.eq("workspaceId", args.workspaceId).eq("status", args.status as "sent" | "failed" | "pending"),
          )
        : base.withIndex("by_workspace", (index) => index.eq("workspaceId", args.workspaceId));
    const page = await q.order("desc").paginate(args.paginationOpts);
    const enriched = await Promise.all(
      page.page.map(async (log) => {
        const subscriber = log.subscriberId ? await ctx.db.get(log.subscriberId) : null;
        return {
          ...log,
          subscriberName:
            subscriber?.workspaceId === args.workspaceId ? subscriber.name : null,
        };
      }),
    );
    const search = args.search?.toLowerCase();
    const filtered = enriched.filter((log) => {
      if (args.type && args.type !== "all" && log.type !== args.type) return false;
      return (
        !search ||
        log.recipient.toLowerCase().includes(search) ||
        log.message.toLowerCase().includes(search) ||
        (log.subscriberName?.toLowerCase().includes(search) ?? false)
      );
    });
    return { ...page, page: filtered };
  },
});

export const getStats = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    total: v.number(),
    sent: v.number(),
    failed: v.number(),
    pending: v.number(),
    totalCost: v.number(),
    thisMonthCount: v.number(),
    invoiceCount: v.number(),
    reminderCount: v.number(),
    customCount: v.number(),
    deliveryRate: v.number(),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readableRoles);
    const fetched = await ctx.db
      .query("sms_logs")
      .withIndex("by_workspace_and_sent_at", (index) => index.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(1001);
    const logs = fetched.slice(0, 1000);
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    let sent = 0;
    let failed = 0;
    let pending = 0;
    let totalCost = 0;
    let thisMonthCount = 0;
    let invoiceCount = 0;
    let reminderCount = 0;
    let customCount = 0;
    for (const log of logs) {
      if (log.status === "sent") sent++;
      if (log.status === "failed") failed++;
      if (log.status === "pending") pending++;
      totalCost += log.cost ?? 0;
      if (log.sentAt >= startOfMonth) thisMonthCount++;
      if (log.type === "invoice") invoiceCount++;
      if (log.type === "reminder") reminderCount++;
      if (log.type === "custom") customCount++;
    }
    return {
      total: logs.length,
      sent,
      failed,
      pending,
      totalCost,
      thisMonthCount,
      invoiceCount,
      reminderCount,
      customCount,
      deliveryRate: logs.length ? Math.round((sent / logs.length) * 100) : 0,
      truncated: fetched.length > 1000,
    };
  },
});

export const sendBulk = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    message: v.string(),
    type: smsType,
    targetGroup: v.union(
      v.literal("all"),
      v.literal("active"),
      v.literal("suspended"),
      v.literal("expired"),
      v.literal("pending"),
    ),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, [
      "owner",
      "admin",
      "billing",
    ]);
    let subscribers;
    if (args.targetGroup === "all") {
      subscribers = await ctx.db
        .query("subscribers")
        .withIndex("by_workspace", (index) => index.eq("workspaceId", args.workspaceId))
        .take(501);
    } else {
      const status = args.targetGroup;
      subscribers = await ctx.db
        .query("subscribers")
        .withIndex("by_workspace_and_status", (index) =>
          index.eq("workspaceId", args.workspaceId).eq("status", status),
        )
        .take(501);
    }
    if (subscribers.length > 500) {
      throw new ConvexError("Bulk SMS is limited to 500 recipients per request");
    }
    const now = new Date().toISOString();
    for (const subscriber of subscribers) {
      await ctx.db.insert("sms_logs", {
        workspaceId: args.workspaceId,
        recipient: subscriber.phone,
        message: args.message,
        status: "sent",
        type: args.type,
        subscriberId: subscriber._id,
        cost: 1,
        sentAt: now,
      });
    }
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId,
      userId: identity.tokenIdentifier,
      action: "send_bulk_sms",
      resource: "sms_logs",
      details: `Sent ${subscribers.length} SMS (${args.type}) to group: ${args.targetGroup}`,
      createdAt: now,
    });
    return subscribers.length;
  },
});

export const sendSingle = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    recipient: v.string(),
    message: v.string(),
    type: smsType,
    subscriberId: v.optional(v.id("subscribers")),
  },
  returns: v.id("sms_logs"),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, [
      "owner",
      "admin",
      "billing",
    ]);
    if (args.subscriberId) {
      const subscriber = await ctx.db.get(args.subscriberId);
      if (!subscriber || subscriber.workspaceId !== args.workspaceId) {
        throw new ConvexError("Subscriber does not belong to this workspace");
      }
    }
    const now = new Date().toISOString();
    const id = await ctx.db.insert("sms_logs", {
      workspaceId: args.workspaceId,
      recipient: args.recipient,
      message: args.message,
      status: "sent",
      type: args.type,
      subscriberId: args.subscriberId,
      cost: 1,
      sentAt: now,
    });
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId,
      userId: identity.tokenIdentifier,
      action: "send_sms",
      resource: "sms_logs",
      resourceId: id,
      details: `Sent SMS to ${args.recipient}`,
      createdAt: now,
    });
    return id;
  },
});
