import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import schema from "./schema";
import { requireWorkspaceRole } from "./model/workspace";
import { isSubscriberServiceAvailable } from "./model/subscriberPresence";

const subscriberDoc = schema
  .doc("subscribers")
  .omit(
    "pppoePassword",
    "pppoePasswordCiphertext",
    "pppoePasswordIv",
    "hotspotPassword",
    "hotspotPasswordCiphertext",
    "hotspotPasswordIv",
  );
const packageDoc = schema.doc("packages");
const invoiceDoc = schema.doc("invoices");
const transactionDoc = schema.doc("transactions");
const ticketDoc = schema.doc("tickets");
const smsLogDoc = schema.doc("sms_logs");
const sessionDoc = schema.doc("router_sessions");

export const get = query({
  args: {
    workspaceId: v.id("workspaces"),
    subscriberId: v.id("subscribers"),
  },
  returns: v.union(
    v.object({
      subscriber: subscriberDoc.extend({
        pppoeUsername: v.optional(v.string()),
        hotspotUsername: v.optional(v.string()),
      }),
      package: v.union(packageDoc, v.null()),
      invoices: v.array(invoiceDoc),
      transactions: v.array(transactionDoc),
      tickets: v.array(ticketDoc),
      smsLogs: v.array(smsLogDoc),
      sessions: v.array(sessionDoc),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, [
      "owner",
      "admin",
      "billing",
      "network",
      "read_only",
    ]);
    const subscriber = await ctx.db.get(args.subscriberId);
    if (!subscriber || subscriber.workspaceId !== args.workspaceId) return null;

    const [
      pkg,
      invoices,
      transactions,
      tickets,
      smsLogs,
      sessions,
      activeSession,
      interimSession,
    ] = await Promise.all([
        subscriber.packageId ? ctx.db.get(subscriber.packageId) : null,
        ctx.db
          .query("invoices")
          .withIndex("by_workspace_and_subscriber", (index) =>
            index
              .eq("workspaceId", args.workspaceId)
              .eq("subscriberId", args.subscriberId),
          )
          .order("desc")
          .take(100),
        ctx.db
          .query("transactions")
          .withIndex("by_workspace_and_subscriber", (index) =>
            index
              .eq("workspaceId", args.workspaceId)
              .eq("subscriberId", args.subscriberId),
          )
          .order("desc")
          .take(100),
        ctx.db
          .query("tickets")
          .withIndex("by_workspace_and_subscriber", (index) =>
            index
              .eq("workspaceId", args.workspaceId)
              .eq("subscriberId", args.subscriberId),
          )
          .order("desc")
          .take(100),
        ctx.db
          .query("sms_logs")
          .withIndex("by_workspace_and_subscriber", (index) =>
            index
              .eq("workspaceId", args.workspaceId)
              .eq("subscriberId", args.subscriberId),
          )
          .order("desc")
          .take(100),
        ctx.db
          .query("router_sessions")
          .withIndex("by_subscriber", (index) =>
            index.eq("subscriberId", args.subscriberId),
          )
          .order("desc")
          .take(100),
        ctx.db
          .query("router_sessions")
          .withIndex("by_workspace_and_subscriber_and_status", (index) =>
            index
              .eq("workspaceId", args.workspaceId)
              .eq("subscriberId", args.subscriberId)
              .eq("status", "active"),
          )
          .first(),
        ctx.db
          .query("router_sessions")
          .withIndex("by_workspace_and_subscriber_and_status", (index) =>
            index
              .eq("workspaceId", args.workspaceId)
              .eq("subscriberId", args.subscriberId)
              .eq("status", "interim"),
          )
          .first(),
      ]);

    if (pkg && pkg.workspaceId !== args.workspaceId) {
      throw new ConvexError(
        "Subscriber package does not belong to this workspace",
      );
    }

    const {
      pppoePassword: _pppoePassword,
      pppoePasswordCiphertext: _pppoePasswordCiphertext,
      pppoePasswordIv: _pppoePasswordIv,
      hotspotPassword: _hotspotPassword,
      hotspotPasswordCiphertext: _hotspotPasswordCiphertext,
      hotspotPasswordIv: _hotspotPasswordIv,
      ...safeSubscriber
    } = subscriber;

    return {
      subscriber: {
        ...safeSubscriber,
        isOnline:
          isSubscriberServiceAvailable(subscriber) &&
          (subscriber.connectionType === "static"
            ? subscriber.isOnline
            : Boolean(activeSession || interimSession)),
      },
      package: pkg,
      invoices,
      transactions,
      tickets,
      smsLogs,
      sessions: sessions.filter(
        (session) => session.workspaceId === args.workspaceId,
      ),
    };
  },
});
