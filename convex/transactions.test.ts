/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createWorkspaceFixture } from "../src/test/workspace-fixtures";

const modules = import.meta.glob("./**/*.ts");

async function setupBillingRecords(t: ReturnType<typeof convexTest>) {
  const owner = t.withIdentity({
    issuer: "https://issuer.example.test",
    subject: "billing-owner",
    tokenIdentifier: "issuer|billing-owner",
    email: "billing-owner@example.test",
    name: "Billing Owner",
  });
  const workspaceId = await createWorkspaceFixture(t, owner, "Billing workspace");
  const subscriberId = await owner.mutation(api.subscribers.create, {
    workspaceId,
    name: "Billing subscriber",
    phone: "+254700000001",
    status: "active",
    connectionType: "static",
    monthlyFee: 1000,
    balance: 0,
  });
  const invoiceId = await owner.mutation(api.financials.createInvoice, {
    workspaceId,
    subscriberId,
    amount: 1000,
    description: "Monthly service",
    dueDate: new Date(Date.now() + 86_400_000).toISOString(),
    status: "pending",
  });
  return { owner, workspaceId, subscriberId, invoiceId };
}

describe("billing transaction lifecycle", () => {
  it("requires a full invoice payment transaction", async () => {
    const t = convexTest(schema, modules);
    const { owner, workspaceId, invoiceId } = await setupBillingRecords(t);

    await expect(
      owner.mutation(api.transactions.create, {
        workspaceId,
        invoiceId,
        amount: 500,
        type: "payment",
        method: "cash",
        status: "completed",
      }),
    ).rejects.toThrow("full invoice amount");

    await expect(
      owner.mutation(api.transactions.create, {
        workspaceId,
        invoiceId,
        amount: 1000,
        type: "credit",
        method: "cash",
        status: "completed",
      }),
    ).rejects.toThrow("must be payments");

    await expect(t.run(async (ctx) => ctx.db.get(invoiceId))).resolves.toMatchObject({
      status: "pending",
    });
  });

  it("applies and reverses balance and invoice effects only on status transitions", async () => {
    const t = convexTest(schema, modules);
    const { owner, workspaceId, subscriberId, invoiceId } = await setupBillingRecords(t);
    const transactionId = await owner.mutation(api.transactions.create, {
      workspaceId,
      invoiceId,
      amount: 1000,
      type: "payment",
      method: "cash",
      status: "pending",
    });

    await owner.mutation(api.transactions.updateStatus, {
      workspaceId,
      id: transactionId,
      status: "completed",
    });
    await owner.mutation(api.transactions.updateStatus, {
      workspaceId,
      id: transactionId,
      status: "completed",
    });
    await expect(t.run(async (ctx) => ctx.db.get(subscriberId))).resolves.toMatchObject({
      balance: 1000,
    });
    await expect(t.run(async (ctx) => ctx.db.get(invoiceId))).resolves.toMatchObject({
      status: "paid",
    });

    await owner.mutation(api.transactions.updateStatus, {
      workspaceId,
      id: transactionId,
      status: "failed",
    });
    await expect(t.run(async (ctx) => ctx.db.get(subscriberId))).resolves.toMatchObject({
      balance: 0,
    });
    const reopenedInvoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
    expect(reopenedInvoice?.status).toBe("pending");
    expect(reopenedInvoice?.paidDate).toBeUndefined();

    await owner.mutation(api.transactions.updateStatus, {
      workspaceId,
      id: transactionId,
      status: "completed",
    });
    await owner.mutation(api.transactions.remove, { workspaceId, id: transactionId });
    await expect(t.run(async (ctx) => ctx.db.get(subscriberId))).resolves.toMatchObject({
      balance: 0,
    });
    const deletedPaymentInvoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
    expect(deletedPaymentInvoice?.status).toBe("pending");
    expect(deletedPaymentInvoice?.paidDate).toBeUndefined();
  });

  it("updates subscriber balance when recording a payment from the invoice workflow", async () => {
    const t = convexTest(schema, modules);
    const { owner, workspaceId, subscriberId, invoiceId } = await setupBillingRecords(t);

    const transactionId = await owner.mutation(api.financials.recordPayment, {
      workspaceId,
      invoiceId,
      method: "mpesa",
      reference: "TEST-REF-1",
    });

    await expect(t.run(async (ctx) => ctx.db.get(subscriberId))).resolves.toMatchObject({
      balance: 1000,
    });
    await expect(t.run(async (ctx) => ctx.db.get(invoiceId))).resolves.toMatchObject({
      status: "paid",
    });
    await expect(t.run(async (ctx) => ctx.db.get(transactionId))).resolves.toMatchObject({
      type: "payment",
      status: "completed",
      amount: 1000,
    });
  });
});
