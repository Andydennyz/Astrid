import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import schema from "./schema";
import type { Doc, Id } from "./_generated/dataModel";
import { requireWorkspaceRole } from "./model/workspace";

const readRoles = ["owner", "admin", "billing", "network", "read_only"] as const;
const writeRoles = ["owner", "admin", "billing"] as const;
const transactionDoc = schema.doc("transactions");
const subscriberDoc = schema
  .doc("subscribers")
  .omit(
    "pppoeUsername",
    "pppoePassword",
    "pppoePasswordCiphertext",
    "pppoePasswordIv",
    "hotspotUsername",
    "hotspotPassword",
    "hotspotPasswordCiphertext",
    "hotspotPasswordIv",
  );
const invoiceDoc = schema.doc("invoices");
const transactionListDoc = transactionDoc.extend({
  subscriberName: v.string(), subscriberPhone: v.string(),
});
const statusValidator = v.union(v.literal("completed"), v.literal("pending"), v.literal("failed"));
const methodValidator = v.union(
  v.literal("mpesa"), v.literal("cash"), v.literal("bank"), v.literal("card"), v.literal("paypal"),
);
const typeValidator = v.union(
  v.literal("payment"), v.literal("refund"), v.literal("credit"), v.literal("debit"),
);

function balanceChange(type: Doc<"transactions">["type"], amount: number) {
  return type === "payment" || type === "credit" ? amount : -amount;
}

async function updateSubscriberBalance(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  subscriberId: Id<"subscribers"> | undefined,
  type: Doc<"transactions">["type"],
  amount: number,
  direction: 1 | -1,
) {
  if (!subscriberId) return;
  const subscriber = await ctx.db.get(subscriberId);
  if (!subscriber || subscriber.workspaceId !== workspaceId) {
    throw new ConvexError("Transaction subscriber is unavailable in this workspace");
  }
  await ctx.db.patch(subscriberId, {
    balance: subscriber.balance + direction * balanceChange(type, amount),
  });
}

async function transitionInvoicePayment(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  invoiceId: Id<"invoices"> | undefined,
  type: Doc<"transactions">["type"],
  wasCompleted: boolean,
  willBeCompleted: boolean,
  now: string,
) {
  if (!invoiceId || type !== "payment" || wasCompleted === willBeCompleted) return;
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice || invoice.workspaceId !== workspaceId) {
    throw new ConvexError("Transaction invoice is unavailable in this workspace");
  }
  if (willBeCompleted) {
    if (invoice.status === "paid") throw new ConvexError("Invoice already paid");
    if (invoice.status === "cancelled") {
      throw new ConvexError("Cancelled invoices cannot be paid");
    }
    await ctx.db.patch(invoiceId, { status: "paid", paidDate: now });
  } else if (invoice.status === "paid") {
    const status = invoice.dueDate.slice(0, 10) < now.slice(0, 10) ? "overdue" : "pending";
    await ctx.db.patch(invoiceId, { status, paidDate: undefined });
  }
}

export const list = query({
  args: {
    workspaceId: v.id("workspaces"), paginationOpts: paginationOptsValidator,
    status: v.optional(v.union(statusValidator, v.literal("all"))),
    method: v.optional(v.union(methodValidator, v.literal("all"))),
    type: v.optional(v.union(typeValidator, v.literal("all"))),
    search: v.optional(v.string()),
  },
  returns: paginationResultValidator(transactionListDoc),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const page = args.status && args.status !== "all"
      ? await ctx.db.query("transactions")
          .withIndex("by_workspace_and_status", (q) =>
            q.eq("workspaceId", args.workspaceId).eq(
              "status",
              args.status as "completed" | "pending" | "failed",
            ))
          .order("desc").paginate(args.paginationOpts)
      : await ctx.db.query("transactions")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
          .order("desc").paginate(args.paginationOpts);
    const enriched = await Promise.all(page.page.map(async (tx) => {
      const subscriber = tx.subscriberId ? await ctx.db.get(tx.subscriberId) : null;
      const sameWorkspaceSubscriber = subscriber?.workspaceId === args.workspaceId ? subscriber : null;
      return {
        ...tx,
        subscriberName: sameWorkspaceSubscriber?.name ?? "System / Manual",
        subscriberPhone: sameWorkspaceSubscriber?.phone ?? "",
      };
    }));
    const search = args.search?.toLowerCase();
    const filtered = enriched.filter((tx) =>
      (!args.method || args.method === "all" || tx.method === args.method) &&
      (!args.type || args.type === "all" || tx.type === args.type) &&
      (!search || tx.subscriberName.toLowerCase().includes(search) ||
        (tx.reference?.toLowerCase().includes(search) ?? false) ||
        (tx.notes?.toLowerCase().includes(search) ?? false)),
    );
    return { ...page, page: filtered };
  },
});

export const getStats = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    total: v.number(), completed: v.number(), pending: v.number(), failed: v.number(),
    totalVolume: v.number(), thisMonthVolume: v.number(), todayVolume: v.number(),
    mpesaVolume: v.number(), cashVolume: v.number(), cardVolume: v.number(), bankVolume: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const all = await ctx.db.query("transactions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(8192);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const completed = all.filter((tx) => tx.status === "completed");
    const thisMonth = completed.filter((tx) => tx.createdAt >= startOfMonth);
    const today = completed.filter((tx) => tx.createdAt >= startOfToday);
    const byMethod = new Map<string, number>();
    for (const tx of completed) byMethod.set(tx.method, (byMethod.get(tx.method) ?? 0) + tx.amount);
    return {
      total: all.length, completed: completed.length,
      pending: all.filter((tx) => tx.status === "pending").length,
      failed: all.filter((tx) => tx.status === "failed").length,
      totalVolume: completed.reduce((sum, tx) => sum + tx.amount, 0),
      thisMonthVolume: thisMonth.reduce((sum, tx) => sum + tx.amount, 0),
      todayVolume: today.reduce((sum, tx) => sum + tx.amount, 0),
      mpesaVolume: byMethod.get("mpesa") ?? 0,
      cashVolume: byMethod.get("cash") ?? 0,
      cardVolume: byMethod.get("card") ?? 0,
      bankVolume: byMethod.get("bank") ?? 0,
    };
  },
});

export const getDailyVolume = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(v.object({ label: v.string(), key: v.string(), volume: v.number(), count: v.number() })),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const now = new Date();
    const days: { label: string; key: string; volume: number; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const key = date.toISOString().split("T")[0];
      days.push({ label: date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }), key, volume: 0, count: 0 });
    }
    const txns = await ctx.db.query("transactions")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "completed"))
      .take(8192);
    for (const tx of txns) {
      const day = days.find((entry) => entry.key === tx.createdAt.split("T")[0]);
      if (day) { day.volume += tx.amount; day.count += 1; }
    }
    return days;
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"), subscriberId: v.optional(v.id("subscribers")),
    invoiceId: v.optional(v.id("invoices")), amount: v.number(), type: typeValidator,
    method: methodValidator, reference: v.optional(v.string()), status: statusValidator,
    notes: v.optional(v.string()),
  },
  returns: v.id("transactions"),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    if (!Number.isFinite(args.amount) || args.amount <= 0) {
      throw new ConvexError("Transaction amount must be greater than zero");
    }
    let invoice = null;
    if (args.invoiceId) {
      invoice = await ctx.db.get(args.invoiceId);
      if (!invoice || invoice.workspaceId !== args.workspaceId) throw new Error("Invoice not found");
      if (args.type !== "payment") {
        throw new ConvexError("Transactions linked to an invoice must be payments");
      }
      if (args.amount !== invoice.amount) {
        throw new ConvexError("Invoice payments must match the full invoice amount");
      }
      if (args.subscriberId && invoice.subscriberId !== args.subscriberId) {
        throw new Error("Invoice and subscriber do not match");
      }
      if (invoice.status === "paid") throw new ConvexError("Invoice already paid");
      if (invoice.status === "cancelled") {
        throw new ConvexError("Cancelled invoices cannot be paid");
      }
    }
    const subscriberId = args.subscriberId ?? invoice?.subscriberId;
    if (subscriberId) {
      const subscriber = await ctx.db.get(subscriberId);
      if (!subscriber || subscriber.workspaceId !== args.workspaceId) throw new Error("Subscriber not found");
    }
    const now = new Date().toISOString();
    const { workspaceId, ...fields } = args;
    const id = await ctx.db.insert("transactions", {
      ...fields, workspaceId, subscriberId, createdAt: now,
    });
    if (subscriberId && args.status === "completed") {
      await updateSubscriberBalance(ctx, args.workspaceId, subscriberId, args.type, args.amount, 1);
    }
    if (invoice && args.status === "completed") {
      await transitionInvoicePayment(
        ctx, args.workspaceId, invoice._id, args.type, false, true, now,
      );
    }
    await ctx.db.insert("audit_logs", {
      workspaceId, userId: identity.tokenIdentifier, action: "create",
      resource: "transaction", resourceId: id,
      details: `${args.type} of Ksh ${args.amount} via ${args.method} — ${args.status}`,
      createdAt: now,
    });
    return id;
  },
});

export const updateStatus = mutation({
  args: { workspaceId: v.id("workspaces"), id: v.id("transactions"), status: statusValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const tx = await ctx.db.get(args.id);
    if (!tx || tx.workspaceId !== args.workspaceId) throw new Error("Transaction not found");
    if (tx.status === args.status) return null;
    const now = new Date().toISOString();
    await transitionInvoicePayment(
      ctx,
      args.workspaceId,
      tx.invoiceId,
      tx.type,
      tx.status === "completed",
      args.status === "completed",
      now,
    );
    if (tx.status === "completed") {
      await updateSubscriberBalance(ctx, args.workspaceId, tx.subscriberId, tx.type, tx.amount, -1);
    } else if (args.status === "completed") {
      await updateSubscriberBalance(ctx, args.workspaceId, tx.subscriberId, tx.type, tx.amount, 1);
    }
    await ctx.db.patch(args.id, { status: args.status });
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier, action: "update",
      resource: "transaction", resourceId: args.id,
      details: `Updated transaction status from ${tx.status} to ${args.status}`, createdAt: now,
    });
    return null;
  },
});

export const remove = mutation({
  args: { workspaceId: v.id("workspaces"), id: v.id("transactions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const tx = await ctx.db.get(args.id);
    if (!tx || tx.workspaceId !== args.workspaceId) throw new Error("Transaction not found");
    const now = new Date().toISOString();
    if (tx.status === "completed") {
      await transitionInvoicePayment(
        ctx, args.workspaceId, tx.invoiceId, tx.type, true, false, now,
      );
      await updateSubscriberBalance(ctx, args.workspaceId, tx.subscriberId, tx.type, tx.amount, -1);
    }
    await ctx.db.delete(args.id);
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier, action: "delete",
      resource: "transaction", resourceId: args.id, details: "Deleted transaction", createdAt: now,
    });
    return null;
  },
});

export const getSubscribersList = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(subscriberDoc),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const subscribers = await ctx.db.query("subscribers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("asc").take(200);
    return subscribers.map(({
      pppoeUsername: _username,
      pppoePassword: _password,
      pppoePasswordCiphertext: _ciphertext,
      pppoePasswordIv: _iv,
      hotspotUsername: _hotspotUsername,
      hotspotPassword: _hotspotPassword,
      hotspotPasswordCiphertext: _hotspotCiphertext,
      hotspotPasswordIv: _hotspotIv,
      ...safeSubscriber
    }) => safeSubscriber);
  },
});

export const getOpenInvoices = query({
  args: {
    workspaceId: v.id("workspaces"),
    subscriberId: v.optional(v.id("subscribers")),
  },
  returns: v.array(invoiceDoc),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    if (args.subscriberId) {
      const subscriber = await ctx.db.get(args.subscriberId);
      if (!subscriber || subscriber.workspaceId !== args.workspaceId) throw new Error("Subscriber not found");
      const [pending, overdue] = await Promise.all([
        ctx.db.query("invoices").withIndex("by_workspace_and_subscriber_and_status", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("subscriberId", args.subscriberId!).eq("status", "pending")).take(100),
        ctx.db.query("invoices").withIndex("by_workspace_and_subscriber_and_status", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("subscriberId", args.subscriberId!).eq("status", "overdue")).take(100),
      ]);
      return [...pending, ...overdue];
    }
    return await ctx.db.query("invoices")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "pending"))
      .take(50);
  },
});
