import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Id } from "./_generated/dataModel.d.ts";

// ─── Invoice list with filters ────────────────────────────────────────────────
export const listInvoices = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("paid"),
        v.literal("overdue"),
        v.literal("cancelled"),
        v.literal("all"),
      ),
    ),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let page;

    if (args.status && args.status !== "all") {
      page = await ctx.db
        .query("invoices")
        .withIndex("by_status", (q) =>
          q.eq("status", args.status as "pending" | "paid" | "overdue" | "cancelled"),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      page = await ctx.db.query("invoices").order("desc").paginate(args.paginationOpts);
    }

    // Enrich with subscriber name
    const enriched = await Promise.all(
      page.page.map(async (inv) => {
        const subscriber = await ctx.db.get(inv.subscriberId);
        return {
          ...inv,
          subscriberName: subscriber?.name ?? "Unknown",
          subscriberPhone: subscriber?.phone ?? "",
        };
      }),
    );

    // Search filter
    const filtered = args.search
      ? enriched.filter((inv) => {
          const q = args.search!.toLowerCase();
          return (
            inv.invoiceNumber.toLowerCase().includes(q) ||
            inv.subscriberName.toLowerCase().includes(q) ||
            inv.description.toLowerCase().includes(q)
          );
        })
      : enriched;

    return { ...page, page: filtered };
  },
});

// ─── Invoice stats ─────────────────────────────────────────────────────────────
export const getInvoiceStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("invoices").collect();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

    const paid = all.filter((i) => i.status === "paid");
    const thisMonthRevenue = paid
      .filter((i) => i.paidDate && i.paidDate >= startOfMonth)
      .reduce((s, i) => s + i.amount, 0);
    const lastMonthRevenue = paid
      .filter((i) => i.paidDate && i.paidDate >= startOfLastMonth && i.paidDate <= endOfLastMonth)
      .reduce((s, i) => s + i.amount, 0);

    const outstandingAmount = all
      .filter((i) => i.status === "pending" || i.status === "overdue")
      .reduce((s, i) => s + i.amount, 0);

    return {
      total: all.length,
      paid: paid.length,
      pending: all.filter((i) => i.status === "pending").length,
      overdue: all.filter((i) => i.status === "overdue").length,
      cancelled: all.filter((i) => i.status === "cancelled").length,
      totalRevenue: paid.reduce((s, i) => s + i.amount, 0),
      thisMonthRevenue,
      lastMonthRevenue,
      outstandingAmount,
      revenueGrowth:
        lastMonthRevenue > 0
          ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
          : 0,
    };
  },
});

// ─── Revenue breakdown by month (last 6 months) ───────────────────────────────
export const getMonthlyRevenue = query({
  args: {},
  handler: async (ctx) => {
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_status", (q) => q.eq("status", "paid"))
      .collect();

    const now = new Date();
    const months: { label: string; key: string; revenue: number; count: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        label: d.toLocaleString("default", { month: "short" }),
        key,
        revenue: 0,
        count: 0,
      });
    }

    for (const inv of invoices) {
      if (!inv.paidDate) continue;
      const key = inv.paidDate.substring(0, 7);
      const month = months.find((m) => m.key === key);
      if (month) {
        month.revenue += inv.amount;
        month.count += 1;
      }
    }

    return months;
  },
});

// ─── Get single invoice ────────────────────────────────────────────────────────
export const getInvoiceById = query({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    const inv = await ctx.db.get(args.id);
    if (!inv) return null;
    const subscriber = await ctx.db.get(inv.subscriberId);
    const pkg = subscriber?.packageId ? await ctx.db.get(subscriber.packageId) : null;
    return { ...inv, subscriber, package: pkg };
  },
});

// ─── Create invoice ────────────────────────────────────────────────────────────
export const createInvoice = mutation({
  args: {
    subscriberId: v.id("subscribers"),
    amount: v.number(),
    description: v.string(),
    dueDate: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("overdue"),
      v.literal("cancelled"),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    // Auto-generate invoice number
    const count = (await ctx.db.query("invoices").collect()).length;
    const invoiceNumber = `INV-${String(count + 1).padStart(5, "0")}`;

    const id = await ctx.db.insert("invoices", {
      ...args,
      invoiceNumber,
      paidDate: args.status === "paid" ? new Date().toISOString() : undefined,
      createdAt: new Date().toISOString(),
    });

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "create",
      resource: "invoice",
      resourceId: id,
      details: `Created invoice ${invoiceNumber} for Ksh ${args.amount}`,
      createdAt: new Date().toISOString(),
    });

    return id;
  },
});

// ─── Update invoice ────────────────────────────────────────────────────────────
export const updateInvoice = mutation({
  args: {
    id: v.id("invoices"),
    amount: v.optional(v.number()),
    description: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("paid"),
        v.literal("overdue"),
        v.literal("cancelled"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const { id, ...fields } = args;
    const updates: Record<string, unknown> = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );

    // Set paidDate when marking as paid
    if (fields.status === "paid") {
      updates.paidDate = new Date().toISOString();
    }

    await ctx.db.patch(id, updates);

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "update",
      resource: "invoice",
      resourceId: id,
      details: `Updated invoice: ${Object.keys(updates).join(", ")}`,
      createdAt: new Date().toISOString(),
    });
  },
});

// ─── Mark invoices as paid (bulk) ─────────────────────────────────────────────
export const markAsPaid = mutation({
  args: { ids: v.array(v.id("invoices")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const now = new Date().toISOString();
    for (const id of args.ids) {
      await ctx.db.patch(id, { status: "paid", paidDate: now });
    }

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "bulk_mark_paid",
      resource: "invoice",
      details: `Marked ${args.ids.length} invoices as paid`,
      createdAt: now,
    });
  },
});

// ─── Delete invoice ────────────────────────────────────────────────────────────
export const deleteInvoice = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const inv = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "delete",
      resource: "invoice",
      resourceId: args.id,
      details: `Deleted invoice ${inv?.invoiceNumber ?? ""}`,
      createdAt: new Date().toISOString(),
    });
  },
});

// ─── Get subscribers list (for invoice creation dropdown) ─────────────────────
export const getSubscribersList = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("subscribers")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
  },
});

// ─── Generate monthly invoices for all active subscribers ─────────────────────
export const generateMonthlyInvoices = mutation({
  args: {
    dueDate: v.string(), // ISO string
    description: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ created: number; skipped: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const subscribers = await ctx.db
      .query("subscribers")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    // Derive month key (YYYY-MM) from dueDate to avoid duplicates
    const monthKey = args.dueDate.substring(0, 7);
    const description = args.description ?? `Monthly internet subscription – ${monthKey}`;

    // Fetch all existing invoices for dedup check
    const allInvoices = await ctx.db.query("invoices").collect();

    let created = 0;
    let skipped = 0;

    const invoiceCount = allInvoices.length;
    let counter = invoiceCount;

    for (const sub of subscribers) {
      if (!sub.monthlyFee || sub.monthlyFee <= 0) { skipped++; continue; }

      // Skip if an invoice with matching description already exists for this subscriber this month
      const existing = allInvoices.find(
        (inv) =>
          inv.subscriberId === sub._id &&
          inv.description === description &&
          inv.dueDate.startsWith(monthKey),
      );
      if (existing) { skipped++; continue; }

      counter++;
      const invoiceNumber = `INV-${String(counter).padStart(5, "0")}`;

      await ctx.db.insert("invoices", {
        subscriberId: sub._id,
        amount: sub.monthlyFee,
        status: "pending",
        dueDate: args.dueDate,
        description,
        invoiceNumber,
        createdAt: new Date().toISOString(),
      });

      created++;
    }

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "bulk_generate",
      resource: "invoice",
      details: `Generated ${created} monthly invoices (${skipped} skipped) for ${monthKey}`,
      createdAt: new Date().toISOString(),
    });

    return { created, skipped };
  },
});

// ─── Mark overdue: any pending invoice past its due date ─────────────────────
export const markOverdueInvoices = mutation({
  args: {},
  handler: async (ctx): Promise<number> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const now = new Date().toISOString();
    const pending = await ctx.db
      .query("invoices")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const toMark = pending.filter((inv) => inv.dueDate < now);

    for (const inv of toMark) {
      await ctx.db.patch(inv._id, { status: "overdue" });
    }

    if (toMark.length > 0) {
      await ctx.db.insert("audit_logs", {
        userId: identity.tokenIdentifier,
        action: "mark_overdue",
        resource: "invoice",
        details: `Marked ${toMark.length} invoices as overdue`,
        createdAt: new Date().toISOString(),
      });
    }

    return toMark.length;
  },
});

// ─── Record payment: creates a transaction + marks invoice paid ───────────────
export const recordPayment = mutation({
  args: {
    invoiceId: v.id("invoices"),
    method: v.union(
      v.literal("mpesa"),
      v.literal("cash"),
      v.literal("bank"),
      v.literal("card"),
      v.literal("paypal"),
    ),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === "paid") throw new Error("Invoice already paid");

    const now = new Date().toISOString();

    // Mark invoice as paid
    await ctx.db.patch(args.invoiceId, { status: "paid", paidDate: now });

    // Create linked transaction
    const txId = await ctx.db.insert("transactions", {
      subscriberId: invoice.subscriberId,
      invoiceId: args.invoiceId,
      amount: invoice.amount,
      type: "payment",
      method: args.method,
      reference: args.reference,
      status: "completed",
      notes: args.notes,
      createdAt: now,
    });

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "record_payment",
      resource: "invoice",
      resourceId: args.invoiceId,
      details: `Payment of Ksh ${invoice.amount} via ${args.method} – ${invoice.invoiceNumber}`,
      createdAt: now,
    });

    return txId;
  },
});
