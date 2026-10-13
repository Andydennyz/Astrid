import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema from "./schema";
import { requireWorkspaceRole } from "./model/workspace";

const readRoles = ["owner", "admin", "billing", "network", "read_only"] as const;
const writeRoles = ["owner", "admin", "billing"] as const;
const invoiceDoc = schema.doc("invoices");
const subscriberDoc = schema.doc("subscribers").omit("pppoeUsername", "pppoePassword");
const packageDoc = schema.doc("packages");
const transactionDoc = schema.doc("transactions");
const invoiceListDoc = invoiceDoc.extend({ subscriberName: v.string(), subscriberPhone: v.string() });
const invoiceStatusValidator = v.union(
  v.literal("pending"), v.literal("paid"), v.literal("overdue"), v.literal("cancelled"),
);
const paymentMethodValidator = v.union(
  v.literal("mpesa"), v.literal("cash"), v.literal("bank"), v.literal("card"), v.literal("paypal"),
);

export const listInvoices = query({
  args: {
    workspaceId: v.id("workspaces"), paginationOpts: paginationOptsValidator,
    status: v.optional(v.union(invoiceStatusValidator, v.literal("all"))),
    search: v.optional(v.string()),
  },
  returns: paginationResultValidator(invoiceListDoc),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const page = args.status && args.status !== "all"
      ? await ctx.db.query("invoices")
          .withIndex("by_workspace_and_status", (q) =>
            q.eq("workspaceId", args.workspaceId).eq(
              "status",
              args.status as "pending" | "paid" | "overdue" | "cancelled",
            ))
          .order("desc").paginate(args.paginationOpts)
      : await ctx.db.query("invoices")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
          .order("desc").paginate(args.paginationOpts);
    const enriched = await Promise.all(page.page.map(async (invoice) => {
      const subscriber = await ctx.db.get(invoice.subscriberId);
      const inWorkspace = subscriber?.workspaceId === args.workspaceId ? subscriber : null;
      return {
        ...invoice,
        subscriberName: inWorkspace?.name ?? "Unknown",
        subscriberPhone: inWorkspace?.phone ?? "",
      };
    }));
    const search = args.search?.toLowerCase();
    return {
      ...page,
      page: search
        ? enriched.filter((invoice) =>
            invoice.invoiceNumber.toLowerCase().includes(search) ||
            invoice.subscriberName.toLowerCase().includes(search) ||
            invoice.description.toLowerCase().includes(search))
        : enriched,
    };
  },
});

export const getInvoiceStats = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    total: v.number(), paid: v.number(), pending: v.number(), overdue: v.number(),
    cancelled: v.number(), totalRevenue: v.number(), thisMonthRevenue: v.number(),
    lastMonthRevenue: v.number(), outstandingAmount: v.number(), revenueGrowth: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const all = await ctx.db.query("invoices")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(8192);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();
    const paid = all.filter((invoice) => invoice.status === "paid");
    const thisMonthRevenue = paid.filter((invoice) => invoice.paidDate && invoice.paidDate >= startOfMonth)
      .reduce((sum, invoice) => sum + invoice.amount, 0);
    const lastMonthRevenue = paid.filter((invoice) => invoice.paidDate &&
      invoice.paidDate >= startOfLastMonth && invoice.paidDate <= endOfLastMonth)
      .reduce((sum, invoice) => sum + invoice.amount, 0);
    return {
      total: all.length, paid: paid.length,
      pending: all.filter((invoice) => invoice.status === "pending").length,
      overdue: all.filter((invoice) => invoice.status === "overdue").length,
      cancelled: all.filter((invoice) => invoice.status === "cancelled").length,
      totalRevenue: paid.reduce((sum, invoice) => sum + invoice.amount, 0),
      thisMonthRevenue, lastMonthRevenue,
      outstandingAmount: all.filter((invoice) => invoice.status === "pending" || invoice.status === "overdue")
        .reduce((sum, invoice) => sum + invoice.amount, 0),
      revenueGrowth: lastMonthRevenue > 0
        ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : 0,
    };
  },
});

export const getMonthlyRevenue = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(v.object({
    label: v.string(), key: v.string(), revenue: v.number(), count: v.number(),
  })),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const invoices = await ctx.db.query("invoices")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "paid"))
      .take(8192);
    const now = new Date();
    const months: { label: string; key: string; revenue: number; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: date.toLocaleString("default", { month: "short" }),
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        revenue: 0, count: 0,
      });
    }
    for (const invoice of invoices) {
      if (!invoice.paidDate) continue;
      const month = months.find((entry) => entry.key === invoice.paidDate!.substring(0, 7));
      if (month) { month.revenue += invoice.amount; month.count += 1; }
    }
    return months;
  },
});

export const getInvoiceById = query({
  args: { workspaceId: v.id("workspaces"), id: v.id("invoices") },
  returns: v.union(invoiceDoc.extend({
    subscriber: subscriberDoc,
    package: v.union(packageDoc, v.null()),
  }), v.null()),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const invoice = await ctx.db.get(args.id);
    if (!invoice || invoice.workspaceId !== args.workspaceId) return null;
    const subscriber = await ctx.db.get(invoice.subscriberId);
    if (!subscriber || subscriber.workspaceId !== args.workspaceId) return null;
    const pkg = subscriber.packageId ? await ctx.db.get(subscriber.packageId) : null;
    const { pppoeUsername: _username, pppoePassword: _password, ...safeSubscriber } = subscriber;
    return {
      ...invoice, subscriber: safeSubscriber,
      package: pkg?.workspaceId === args.workspaceId ? pkg : null,
    };
  },
});

export const createInvoice = mutation({
  args: {
    workspaceId: v.id("workspaces"), subscriberId: v.id("subscribers"),
    amount: v.number(), description: v.string(), dueDate: v.string(),
    status: invoiceStatusValidator,
  },
  returns: v.id("invoices"),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const subscriber = await ctx.db.get(args.subscriberId);
    if (!subscriber || subscriber.workspaceId !== args.workspaceId) throw new Error("Subscriber not found");
    const now = new Date().toISOString();
    const { workspaceId, ...fields } = args;
    const id = await ctx.db.insert("invoices", {
      ...fields, workspaceId,
      invoiceNumber: `INV-${Date.now()}-${String(args.subscriberId).slice(-6).toUpperCase()}`,
      paidDate: args.status === "paid" ? now : undefined, createdAt: now,
    });
    await ctx.db.insert("audit_logs", {
      workspaceId, userId: identity.tokenIdentifier, action: "create",
      resource: "invoice", resourceId: id, details: `Created invoice for Ksh ${args.amount}`,
      createdAt: now,
    });
    return id;
  },
});

export const updateInvoice = mutation({
  args: {
    workspaceId: v.id("workspaces"), id: v.id("invoices"),
    amount: v.optional(v.number()), description: v.optional(v.string()),
    dueDate: v.optional(v.string()), status: v.optional(invoiceStatusValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const invoice = await ctx.db.get(args.id);
    if (!invoice || invoice.workspaceId !== args.workspaceId) throw new Error("Invoice not found");
    const updates = {
      ...(args.amount !== undefined ? { amount: args.amount } : {}),
      ...(args.description !== undefined ? { description: args.description } : {}),
      ...(args.dueDate !== undefined ? { dueDate: args.dueDate } : {}),
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.status === "paid" ? { paidDate: new Date().toISOString() } : {}),
    };
    await ctx.db.patch(args.id, updates);
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier, action: "update",
      resource: "invoice", resourceId: args.id,
      details: `Updated invoice: ${Object.keys(updates).join(", ")}`, createdAt: new Date().toISOString(),
    });
    return null;
  },
});

export const markAsPaid = mutation({
  args: { workspaceId: v.id("workspaces"), ids: v.array(v.id("invoices")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const now = new Date().toISOString();
    for (const id of args.ids) {
      const invoice = await ctx.db.get(id);
      if (!invoice || invoice.workspaceId !== args.workspaceId) throw new Error("Invoice not found");
      await ctx.db.patch(id, { status: "paid", paidDate: now });
    }
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier,
      action: "bulk_mark_paid", resource: "invoice",
      details: `Marked ${args.ids.length} invoices as paid`, createdAt: now,
    });
    return null;
  },
});

export const deleteInvoice = mutation({
  args: { workspaceId: v.id("workspaces"), id: v.id("invoices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const invoice = await ctx.db.get(args.id);
    if (!invoice || invoice.workspaceId !== args.workspaceId) throw new Error("Invoice not found");
    const linked = await ctx.db.query("transactions")
      .withIndex("by_workspace_and_invoice", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("invoiceId", args.id))
      .take(1);
    if (linked.length) throw new Error("Invoice has linked transactions and cannot be deleted");
    await ctx.db.delete(args.id);
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier, action: "delete",
      resource: "invoice", resourceId: args.id,
      details: `Deleted invoice ${invoice.invoiceNumber}`, createdAt: new Date().toISOString(),
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
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "active"))
      .take(200);
    return subscribers.map(({ pppoeUsername: _username, pppoePassword: _password, ...safeSubscriber }) => safeSubscriber);
  },
});

export const generateMonthlyInvoices = mutation({
  args: {
    workspaceId: v.id("workspaces"), dueDate: v.string(), description: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    created: v.number(), skipped: v.number(), isDone: v.boolean(), continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const subscribers = await ctx.db.query("subscribers")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "active"))
      .order("asc")
      .paginate(args.paginationOpts);
    const monthKey = args.dueDate.substring(0, 7);
    const description = args.description ?? `Monthly internet subscription – ${monthKey}`;
    let created = 0;
    let skipped = 0;
    for (const subscriber of subscribers.page) {
      if (!subscriber.monthlyFee || subscriber.monthlyFee <= 0) { skipped++; continue; }
      const invoices = await ctx.db.query("invoices")
        .withIndex("by_workspace_and_subscriber", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("subscriberId", subscriber._id))
        .take(8192);
      if (invoices.some((invoice) =>
        invoice.description === description && invoice.dueDate.startsWith(monthKey))) {
        skipped++;
        continue;
      }
      const suffix = `${Date.now()}-${String(subscriber._id).slice(-6).toUpperCase()}`;
      await ctx.db.insert("invoices", {
        workspaceId: args.workspaceId, subscriberId: subscriber._id,
        amount: subscriber.monthlyFee, status: "pending", dueDate: args.dueDate,
        description, invoiceNumber: `INV-${suffix}`, createdAt: new Date().toISOString(),
      });
      created++;
    }
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier,
      action: "bulk_generate", resource: "invoice",
      details: `Generated ${created} monthly invoices (${skipped} skipped) for ${monthKey}`,
      createdAt: new Date().toISOString(),
    });
    return {
      created, skipped, isDone: subscribers.isDone, continueCursor: subscribers.continueCursor,
    };
  },
});

export const markOverdueInvoices = mutation({
  args: {
    workspaceId: v.id("workspaces"), paginationOpts: paginationOptsValidator,
  },
  returns: v.object({ marked: v.number(), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const now = new Date().toISOString();
    const page = await ctx.db.query("invoices")
      .withIndex("by_workspace_and_status_and_due_date", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "pending").lt("dueDate", now))
      .paginate(args.paginationOpts);
    for (const invoice of page.page) await ctx.db.patch(invoice._id, { status: "overdue" });
    if (page.page.length) {
      await ctx.db.insert("audit_logs", {
        workspaceId: args.workspaceId, userId: identity.tokenIdentifier,
        action: "mark_overdue", resource: "invoice",
        details: `Marked ${page.page.length} invoices as overdue`, createdAt: now,
      });
    }
    return {
      marked: page.page.length, isDone: page.isDone, continueCursor: page.continueCursor,
    };
  },
});

export const recordPayment = mutation({
  args: {
    workspaceId: v.id("workspaces"), invoiceId: v.id("invoices"),
    method: paymentMethodValidator, reference: v.optional(v.string()), notes: v.optional(v.string()),
  },
  returns: v.id("transactions"),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, writeRoles);
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.workspaceId !== args.workspaceId) throw new Error("Invoice not found");
    if (invoice.status === "paid") throw new Error("Invoice already paid");
    const subscriber = await ctx.db.get(invoice.subscriberId);
    if (!subscriber || subscriber.workspaceId !== args.workspaceId) throw new Error("Subscriber not found");
    const now = new Date().toISOString();
    await ctx.db.patch(args.invoiceId, { status: "paid", paidDate: now });
    const txId = await ctx.db.insert("transactions", {
      workspaceId: args.workspaceId, subscriberId: invoice.subscriberId,
      invoiceId: args.invoiceId, amount: invoice.amount, type: "payment",
      method: args.method, reference: args.reference, status: "completed",
      notes: args.notes, createdAt: now,
    });
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier,
      action: "record_payment", resource: "invoice", resourceId: args.invoiceId,
      details: `Payment of Ksh ${invoice.amount} recorded via ${args.method}`,
      createdAt: now,
    });
    return txId;
  },
});
