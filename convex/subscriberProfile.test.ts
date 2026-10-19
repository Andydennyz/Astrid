/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createWorkspaceFixture } from "../src/test/workspace-fixtures";

const modules = import.meta.glob("./**/*.ts");

describe("subscriber profile", () => {
  it("returns workspace-scoped profile data without returning stored passwords", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({
      issuer: "https://issuer.example.test",
      subject: "profile-owner",
      tokenIdentifier: "issuer|profile-owner",
      email: "profile-owner@example.test",
      name: "Profile Owner",
    });
    const workspaceId = await createWorkspaceFixture(
      t,
      owner,
      "Subscriber profile workspace",
    );
    const subscriberId = await t.run(async (ctx) =>
      ctx.db.insert("subscribers", {
        workspaceId,
        name: "Profile subscriber",
        phone: "+254700000099",
        status: "active",
        connectionType: "pppoe",
        monthlyFee: 1200,
        balance: 0,
        isOnline: true,
        pppoeUsername: "profile-user",
        pppoePassword: "must-not-be-returned",
        pppoePasswordCiphertext: "ciphertext",
        pppoePasswordIv: "iv",
        createdAt: "2026-10-18T00:00:00.000Z",
      }),
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("invoices", {
        workspaceId,
        subscriberId,
        amount: 1200,
        status: "pending",
        dueDate: "2026-11-01",
        description: "Monthly service",
        invoiceNumber: "INV-100",
        createdAt: "2026-10-18T00:00:00.000Z",
      });
      await ctx.db.insert("transactions", {
        workspaceId,
        subscriberId,
        amount: 1200,
        type: "payment",
        method: "cash",
        status: "completed",
        createdAt: "2026-10-18T00:00:00.000Z",
      });
      await ctx.db.insert("tickets", {
        workspaceId,
        subscriberId,
        title: "Connection check",
        description: "Subscriber reports a slow connection",
        status: "open",
        priority: "medium",
        category: "connectivity",
        createdAt: "2026-10-18T00:00:00.000Z",
      });
      await ctx.db.insert("sms_logs", {
        workspaceId,
        subscriberId,
        recipient: "+254700000099",
        message: "Payment received",
        status: "sent",
        type: "custom",
        sentAt: "2026-10-18T00:00:00.000Z",
      });
      await ctx.db.insert("router_sessions", {
        workspaceId,
        subscriberId,
        username: "profile-user",
        nasIdentifier: "profile-router",
        sessionId: "profile-session-1",
        startTime: "2026-10-18T00:00:00.000Z",
        status: "active",
        connectionType: "pppoe",
        createdAt: "2026-10-18T00:00:00.000Z",
      });
    });

    const profile = await owner.query(api.subscriberProfile.get, {
      workspaceId,
      subscriberId,
    });

    expect(profile?.subscriber).toMatchObject({
      name: "Profile subscriber",
      pppoeUsername: "profile-user",
      isOnline: true,
    });
    expect(profile?.subscriber).not.toHaveProperty("pppoePassword");
    expect(profile?.subscriber).not.toHaveProperty("pppoePasswordCiphertext");
    expect(profile?.subscriber).not.toHaveProperty("pppoePasswordIv");
    expect(profile).toMatchObject({
      package: null,
      invoices: [{ invoiceNumber: "INV-100" }],
      transactions: [{ type: "payment" }],
      tickets: [{ title: "Connection check" }],
      smsLogs: [{ message: "Payment received" }],
      sessions: [{ sessionId: "profile-session-1" }],
    });
  });

  it("reports subscribers offline when suspended or without a live session", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({
      issuer: "https://issuer.example.test",
      subject: "profile-presence-owner",
      tokenIdentifier: "issuer|profile-presence-owner",
      email: "profile-presence-owner@example.test",
      name: "Profile Presence Owner",
    });
    const workspaceId = await createWorkspaceFixture(
      t,
      owner,
      "Subscriber presence workspace",
    );
    const subscriberId = await t.run(async (ctx) =>
      ctx.db.insert("subscribers", {
        workspaceId,
        name: "Presence subscriber",
        phone: "+254700000097",
        status: "active",
        connectionType: "pppoe",
        monthlyFee: 1000,
        balance: 0,
        isOnline: true,
        createdAt: new Date().toISOString(),
      }),
    );
    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("router_sessions", {
        workspaceId,
        subscriberId,
        username: "presence-user",
        nasIdentifier: "presence-router",
        sessionId: "presence-session",
        startTime: new Date().toISOString(),
        status: "active",
        connectionType: "pppoe",
        createdAt: new Date().toISOString(),
      }),
    );

    await expect(
      owner.query(api.subscriberProfile.get, { workspaceId, subscriberId }),
    ).resolves.toMatchObject({
      subscriber: { isOnline: true },
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(subscriberId, { status: "suspended" });
    });
    await expect(
      owner.query(api.subscriberProfile.get, { workspaceId, subscriberId }),
    ).resolves.toMatchObject({
      subscriber: { isOnline: false },
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(subscriberId, { status: "active" });
      await ctx.db.patch(sessionId, { status: "stopped" });
    });
    await expect(
      owner.query(api.subscriberProfile.get, { workspaceId, subscriberId }),
    ).resolves.toMatchObject({
      subscriber: { isOnline: false },
    });
  });

  it("does not reveal a subscriber from another workspace", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({
      issuer: "https://issuer.example.test",
      subject: "profile-isolation-owner",
      tokenIdentifier: "issuer|profile-isolation-owner",
      email: "profile-isolation-owner@example.test",
      name: "Profile Isolation Owner",
    });
    const workspaceId = await createWorkspaceFixture(
      t,
      owner,
      "Subscriber profile workspace A",
    );
    const otherWorkspaceId = await createWorkspaceFixture(
      t,
      owner,
      "Subscriber profile workspace B",
    );
    const subscriberId = await t.run(async (ctx) =>
      ctx.db.insert("subscribers", {
        workspaceId: otherWorkspaceId,
        name: "Private subscriber",
        phone: "+254700000098",
        status: "active",
        connectionType: "static",
        monthlyFee: 0,
        balance: 0,
        isOnline: false,
        createdAt: "2026-10-18T00:00:00.000Z",
      }),
    );

    await expect(
      owner.query(api.subscriberProfile.get, {
        workspaceId,
        subscriberId,
      }),
    ).resolves.toBeNull();
  });
});
