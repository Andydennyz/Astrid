import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const initialInvoiceValidator = v.object({
  dueDate: v.string(),
  description: v.string(),
});

type InitialInvoiceArgs = {
  workspaceId: Id<"workspaces">;
  subscriberId: Id<"subscribers">;
  amount: number;
  dueDate: string;
  description: string;
  userId: string;
};

export async function createInitialInvoice(ctx: MutationCtx, args: InitialInvoiceArgs) {
  const dueDate = Date.parse(args.dueDate);
  const description = args.description.trim();
  if (!Number.isFinite(dueDate) || !description || description.length > 200) {
    throw new ConvexError("Enter a valid invoice due date and a description up to 200 characters");
  }
  if (!Number.isFinite(args.amount) || args.amount <= 0) {
    throw new ConvexError("An initial invoice requires a positive monthly fee");
  }

  const now = new Date().toISOString();
  const invoiceId = await ctx.db.insert("invoices", {
    workspaceId: args.workspaceId,
    subscriberId: args.subscriberId,
    amount: args.amount,
    status: "pending",
    dueDate: new Date(dueDate).toISOString(),
    description,
    invoiceNumber: `INV-${Date.now()}-${String(args.subscriberId).slice(-6).toUpperCase()}`,
    createdAt: now,
  });
  await ctx.db.insert("audit_logs", {
    workspaceId: args.workspaceId,
    userId: args.userId,
    action: "create",
    resource: "invoice",
    resourceId: invoiceId,
    details: `Created initial invoice for Ksh ${args.amount}`,
    createdAt: now,
  });
  return invoiceId;
}
