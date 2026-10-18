/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { encryptSubscriberPassword } from "./subscriberCredentials";
import { createWorkspaceFixture } from "../src/test/workspace-fixtures";

const modules = import.meta.glob("./**/*.ts");
const testEncryptionKey = btoa(
  String.fromCharCode(...new Uint8Array(32).fill(7)),
);
const testGatewayToken = "test-radius-gateway-token-32-characters";

function restAttribute(value: string | number, type = "string") {
  return { type, value: [value] };
}

beforeEach(() => {
  vi.stubEnv("PPPOE_CREDENTIAL_ENCRYPTION_KEY", testEncryptionKey);
  vi.stubEnv("RADIUS_GATEWAY_TOKEN", testGatewayToken);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function authenticatedTestUser(t: ReturnType<typeof convexTest>) {
  return t.withIdentity({
    issuer: "https://issuer.example.test",
    subject: "radius-owner",
    tokenIdentifier: "issuer|radius-owner",
    email: "radius-owner@example.test",
    name: "RADIUS Owner",
  });
}

async function setupPppoe(t: ReturnType<typeof convexTest>) {
  const owner = authenticatedTestUser(t);
  const workspaceId = await createWorkspaceFixture(t, owner, "RADIUS workspace");
  const packageId = await owner.mutation(api.packages.create, {
    workspaceId,
    name: "PPPoE 20",
    speed: "20 Mbps",
    price: 1000,
    type: "pppoe",
    downloadSpeed: 20,
    uploadSpeed: 10,
    isActive: true,
  });
  const subscriberId = await owner.action(api.subscribers.createPppoe, {
    workspaceId,
    name: "PPPoE subscriber",
    phone: "+254700000001",
    status: "active",
    packageId,
    monthlyFee: 1000,
    balance: 0,
    pppoeUsername: "subscriber-1",
    pppoePassword: "temporary-test-password",
  });
  const routerId = await t.run(async (ctx) =>
    ctx.db.insert("routers", {
      workspaceId,
      name: "PPPoE NAS",
      publicKey: "router-public-key",
      privateKey: "router-private-key",
      tunnelIp: "10.77.0.2/32",
      serverPublicKey: "server-public-key",
      serverEndpoint: "192.0.2.1:51820",
      serverTunnelIp: "10.77.0.1/32",
      allowedIPs: "10.77.0.0/24",
      status: "unknown",
      radiusSecret: "test-radius-secret",
      nasIdentifier: "pppoe-nas",
      createdAt: new Date().toISOString(),
    }),
  );
  return { owner, workspaceId, packageId, subscriberId, routerId };
}

async function setupHotspot(t: ReturnType<typeof convexTest>) {
  const owner = authenticatedTestUser(t);
  const workspaceId = await createWorkspaceFixture(t, owner, "Hotspot RADIUS workspace");
  const packageId = await owner.mutation(api.packages.create, {
    workspaceId,
    name: "Hotspot 10",
    speed: "10 Mbps",
    price: 500,
    type: "hotspot",
    downloadSpeed: 10,
    uploadSpeed: 5,
    isActive: true,
  });
  const subscriberId = await owner.action(api.subscribers.createHotspot, {
    workspaceId,
    name: "Hotspot subscriber",
    phone: "+254700000011",
    status: "active",
    packageId,
    monthlyFee: 500,
    balance: 0,
    hotspotUsername: "hotspot-user",
    hotspotPassword: "temporary-hotspot-password",
  });
  const routerId = await t.run(async (ctx) =>
    ctx.db.insert("routers", {
      workspaceId,
      name: "Hotspot NAS",
      publicKey: "hotspot-router-public-key",
      tunnelIp: "10.77.0.2/32",
      status: "unknown",
      nasIdentifier: "hotspot-nas",
      createdAt: new Date().toISOString(),
    }),
  );
  return { owner, workspaceId, packageId, subscriberId, routerId };
}

describe("PPPoE RADIUS authorization", () => {
  it("blocks subscriber activation until its matching package is active", async () => {
    const t = convexTest(schema, modules);
    const { owner, workspaceId, packageId, subscriberId } = await setupPppoe(t);

    await owner.mutation(api.subscribers.updateStatus, {
      workspaceId,
      ids: [subscriberId],
      status: "suspended",
    });
    await owner.mutation(api.packages.toggleActive, {
      workspaceId,
      id: packageId,
      isActive: false,
    });

    await expect(
      owner.mutation(api.subscribers.update, {
        workspaceId,
        id: subscriberId,
        status: "active",
      }),
    ).rejects.toThrow("Select an active pppoe package before activation");
    await expect(
      owner.mutation(api.subscribers.updateStatus, {
        workspaceId,
        ids: [subscriberId],
        status: "active",
      }),
    ).rejects.toThrow("Select an active pppoe package before activation");
    await expect(t.run(async (ctx) => ctx.db.get(subscriberId))).resolves.toMatchObject({
      status: "suspended",
    });

    await owner.mutation(api.packages.toggleActive, {
      workspaceId,
      id: packageId,
      isActive: true,
    });
    await owner.mutation(api.subscribers.updateStatus, {
      workspaceId,
      ids: [subscriberId],
      status: "active",
    });
    await expect(t.run(async (ctx) => ctx.db.get(subscriberId))).resolves.toMatchObject({
      status: "active",
    });

    const legacySubscriberId = await t.run((ctx) =>
      ctx.db.insert("subscribers", {
        workspaceId,
        name: "Legacy PPPoE subscriber",
        phone: "+254700000099",
        status: "suspended",
        connectionType: "pppoe",
        packageId,
        monthlyFee: 1000,
        balance: 0,
        isOnline: false,
        createdAt: new Date().toISOString(),
      }),
    );
    await expect(
      owner.mutation(api.subscribers.updateStatus, {
        workspaceId,
        ids: [legacySubscriberId],
        status: "active",
      }),
    ).rejects.toThrow("Set encrypted pppoe credentials before activation");
  });

  it("creates the onboarding subscriber and initial invoice atomically", async () => {
    const t = convexTest(schema, modules);
    const owner = authenticatedTestUser(t);
    const workspaceId = await createWorkspaceFixture(t, owner, "Initial invoice workspace");
    const packageId = await owner.mutation(api.packages.create, {
      workspaceId,
      name: "PPPoE 5",
      speed: "5 Mbps",
      price: 500,
      type: "pppoe",
      downloadSpeed: 5,
      uploadSpeed: 2,
      isActive: true,
    });
    const subscriberArgs = {
      workspaceId,
      name: "Invoice test subscriber",
      phone: "+254700000099",
      status: "active" as const,
      packageId,
      monthlyFee: 500,
      balance: 0,
      pppoeUsername: "invoice-test",
      pppoePassword: "temporary-test-password",
    };

    await expect(
      owner.action(api.subscribers.createPppoe, {
        ...subscriberArgs,
        initialInvoice: {
          dueDate: "not-a-date",
          description: "Initial internet subscription",
        },
      }),
    ).rejects.toThrow(/valid invoice due date/i);
    await expect(
      t.run(async (ctx) =>
        ctx.db.query("subscribers")
          .withIndex("by_workspace", (index) => index.eq("workspaceId", workspaceId))
          .take(10),
      ),
    ).resolves.toHaveLength(0);

    const subscriberId = await owner.action(api.subscribers.createPppoe, {
      ...subscriberArgs,
      initialInvoice: {
        dueDate: "2026-11-01T00:00:00.000Z",
        description: "Initial internet subscription",
      },
    });
    const invoices = await t.run(async (ctx) =>
      ctx.db.query("invoices")
        .withIndex("by_workspace_and_subscriber", (index) =>
          index.eq("workspaceId", workspaceId).eq("subscriberId", subscriberId),
        )
        .take(10),
    );
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({
      workspaceId,
      subscriberId,
      amount: 500,
      status: "pending",
      dueDate: "2026-11-01T00:00:00.000Z",
      description: "Initial internet subscription",
    });
  });

  it("accepts an active PPPoE subscriber with an active PPPoE package on its router workspace", async () => {
    const t = convexTest(schema, modules);
    const { routerId, subscriberId } = await setupPppoe(t);

    await expect(
      t.action(internal.radius_helpers.authorizeSubscriber, {
        routerId,
        username: "subscriber-1",
        password: "temporary-test-password",
        connectionType: "pppoe",
      }),
    ).resolves.toMatchObject({
      accepted: true,
      subscriberId,
      username: "subscriber-1",
      downloadMbps: 20,
      uploadMbps: 10,
    });
  });

  describe("Hotspot RADIUS authorization", () => {
    it("stores separate encrypted credentials and authorizes an active Hotspot package", async () => {
      const t = convexTest(schema, modules);
      const { owner, workspaceId, packageId, subscriberId, routerId } = await setupHotspot(t);
      const stored = await t.run(async (ctx) => ctx.db.get(subscriberId));
      expect(stored).toMatchObject({ packageId });
      expect(stored?.hotspotPassword).toBeUndefined();
      expect(stored?.hotspotPasswordCiphertext).toBeTruthy();
      expect(stored?.hotspotPasswordIv).toBeTruthy();
      expect(stored?.pppoeUsername).toBeUndefined();

      const publicSubscriber = await owner.query(api.subscribers.getById, {
        workspaceId,
        id: subscriberId,
      });
      expect(publicSubscriber).toMatchObject({ hotspotUsername: "hotspot-user" });
      expect(publicSubscriber).not.toHaveProperty("hotspotPassword");
      expect(publicSubscriber).not.toHaveProperty("hotspotPasswordCiphertext");
      expect(publicSubscriber).not.toHaveProperty("hotspotPasswordIv");
      const subscriberPage = await owner.query(api.subscribers.list, {
        workspaceId,
        paginationOpts: { numItems: 10, cursor: null },
      });
      expect(subscriberPage.page[0]).not.toHaveProperty("hotspotUsername");
      expect(subscriberPage.page[0]).not.toHaveProperty("hotspotPasswordCiphertext");

      await owner.action(api.subscribers.setHotspotCredentials, {
        workspaceId,
        id: subscriberId,
        username: "hotspot-user-updated",
        password: "updated-hotspot-password",
      });
      await expect(
        t.action(internal.radius_helpers.authorizeSubscriber, {
          routerId,
          username: "hotspot-user-updated",
          password: "updated-hotspot-password",
          connectionType: "hotspot",
        }),
      ).resolves.toMatchObject({
        accepted: true,
        subscriberId,
        downloadMbps: 10,
        uploadMbps: 5,
      });
      await expect(
        t.action(internal.radius_helpers.authorizeSubscriber, {
          routerId,
          username: "hotspot-user",
          password: "temporary-hotspot-password",
          connectionType: "pppoe",
        }),
      ).resolves.toMatchObject({ accepted: false });

      const otherHotspotPackage = await owner.mutation(api.packages.create, {
        workspaceId,
        name: "Hotspot inactive",
        speed: "1 Mbps",
        price: 100,
        type: "hotspot",
        downloadSpeed: 1,
        uploadSpeed: 1,
        isActive: false,
      });
      await t.run(async (ctx) => ctx.db.patch(subscriberId, { packageId: otherHotspotPackage }));
      await expect(
        t.action(internal.radius_helpers.authorizeSubscriber, {
          routerId,
          username: "hotspot-user-updated",
          password: "updated-hotspot-password",
          connectionType: "hotspot",
        }),
      ).resolves.toMatchObject({ accepted: false });

      const pppoePackage = await owner.mutation(api.packages.create, {
        workspaceId,
        name: "PPPoE 10",
        speed: "10 Mbps",
        price: 500,
        type: "pppoe",
        downloadSpeed: 10,
        uploadSpeed: 5,
        isActive: true,
      });
      await t.run(async (ctx) => ctx.db.patch(subscriberId, { packageId: pppoePackage }));
      await expect(
        t.action(internal.radius_helpers.authorizeSubscriber, {
          routerId,
          username: "hotspot-user-updated",
          password: "updated-hotspot-password",
          connectionType: "hotspot",
        }),
      ).resolves.toMatchObject({ accepted: false });
    });

    it("prevents PPPoE and Hotspot credentials from colliding in a workspace", async () => {
      const t = convexTest(schema, modules);
      const { owner, workspaceId } = await setupHotspot(t);
      await expect(
        owner.action(api.subscribers.createPppoe, {
          workspaceId,
          name: "Conflicting PPPoE subscriber",
          phone: "+254700000012",
          status: "active",
          packageId: await owner.mutation(api.packages.create, {
            workspaceId,
            name: "PPPoE 10",
            speed: "10 Mbps",
            price: 500,
            type: "pppoe",
            downloadSpeed: 10,
            uploadSpeed: 5,
            isActive: true,
          }),
          monthlyFee: 500,
          balance: 0,
          pppoeUsername: "hotspot-user",
          pppoePassword: "temporary-pppoe-password",
        }),
      ).rejects.toThrow(/username is already in use/i);
    });
  });

  it("rejects invalid credentials and unavailable subscriber services", async () => {
    const t = convexTest(schema, modules);
    const { routerId, subscriberId } = await setupPppoe(t);
    const credentials = {
      routerId,
      username: "subscriber-1",
      password: "temporary-test-password",
      connectionType: "pppoe" as const,
    };

    await expect(
      t.action(internal.radius_helpers.authorizeSubscriber, {
        ...credentials,
        password: "incorrect",
      }),
    ).resolves.toMatchObject({ accepted: false });

    await t.run(async (ctx) =>
      ctx.db.patch(subscriberId, { status: "suspended" }),
    );
    await expect(
      t.action(internal.radius_helpers.authorizeSubscriber, credentials),
    ).resolves.toMatchObject({ accepted: false });
  });

  it("rejects credentials when the subscriber belongs to a different workspace", async () => {
    const t = convexTest(schema, modules);
    const { owner, routerId, packageId } = await setupPppoe(t);
    const otherWorkspaceId = await createWorkspaceFixture(t, owner, "Other workspace");
    const foreignCredential = await encryptSubscriberPassword(
      "temporary-test-password",
      testEncryptionKey,
    );
    const subscriberId = await t.run(async (ctx) =>
      ctx.db.insert("subscribers", {
        workspaceId: otherWorkspaceId,
        name: "Foreign subscriber",
        phone: "+254700000002",
        status: "active",
        connectionType: "pppoe",
        packageId,
        monthlyFee: 1000,
        balance: 0,
        isOnline: false,
        createdAt: new Date().toISOString(),
        pppoeUsername: "foreign-subscriber",
        pppoePasswordCiphertext: foreignCredential.ciphertext,
        pppoePasswordIv: foreignCredential.iv,
      }),
    );

    await expect(
      t.action(internal.radius_helpers.authorizeSubscriber, {
        routerId,
        username: "foreign-subscriber",
        password: "temporary-test-password",
        connectionType: "pppoe",
      }),
    ).resolves.toMatchObject({ accepted: false });
  });
});

describe("PPPoE credential storage", () => {
  it("stores encrypted credentials and never returns ciphertext or a password to the client", async () => {
    const t = convexTest(schema, modules);
    const { owner, workspaceId, subscriberId } = await setupPppoe(t);
    const stored = await t.run(async (ctx) => ctx.db.get(subscriberId));

    expect(stored?.pppoePassword).toBeUndefined();
    expect(stored?.pppoePasswordCiphertext).toBeTruthy();
    expect(stored?.pppoePasswordIv).toBeTruthy();
    expect(stored?.pppoePasswordCiphertext).not.toContain(
      "temporary-test-password",
    );

    const publicSubscriber = await owner.query(api.subscribers.getById, {
      workspaceId,
      id: subscriberId,
    });
    expect(publicSubscriber).toMatchObject({ pppoeUsername: "subscriber-1" });
    expect(publicSubscriber).not.toHaveProperty("pppoePassword");
    expect(publicSubscriber).not.toHaveProperty("pppoePasswordCiphertext");
    expect(publicSubscriber).not.toHaveProperty("pppoePasswordIv");
  });

  it("rejects duplicate PPPoE usernames across subscribers", async () => {
    const t = convexTest(schema, modules);
    const { owner, workspaceId, packageId } = await setupPppoe(t);

    await expect(
      owner.action(api.subscribers.createPppoe, {
        workspaceId,
        name: "Duplicate subscriber",
        phone: "+254700000099",
        status: "active",
        packageId,
        monthlyFee: 1000,
        balance: 0,
        pppoeUsername: "subscriber-1",
        pppoePassword: "another-temporary-password",
      }),
    ).rejects.toThrow(/already in use/i);
  });

  it("replaces legacy plaintext credentials and clears the plaintext field", async () => {
    const t = convexTest(schema, modules);
    const { owner, workspaceId, subscriberId, routerId } = await setupPppoe(t);
    await t.run(async (ctx) =>
      ctx.db.patch(subscriberId, {
        pppoePassword: "legacy-plaintext-password",
      }),
    );

    await owner.action(api.subscribers.setPppoeCredentials, {
      workspaceId,
      id: subscriberId,
      username: "subscriber-1",
      password: "new-temporary-password",
    });

    const stored = await t.run(async (ctx) => ctx.db.get(subscriberId));
    expect(stored?.pppoePassword).toBeUndefined();
    await expect(
      t.action(internal.radius_helpers.authorizeSubscriber, {
        routerId,
        username: "subscriber-1",
        password: "new-temporary-password",
        connectionType: "pppoe",
      }),
    ).resolves.toMatchObject({ accepted: true });
  });
});

describe("RADIUS accounting", () => {
  it("keeps interim accounting updates in the live session counts", async () => {
    const t = convexTest(schema, modules);
    const { owner, workspaceId, routerId } = await setupPppoe(t);
    const accountingRequest = {
      "NAS-Identifier": restAttribute("pppoe-nas"),
      "NAS-IP-Address": restAttribute("10.77.0.2", "ipaddr"),
      "User-Name": restAttribute("subscriber-1"),
      "Acct-Session-Id": restAttribute("live-session"),
    };
    const headers = {
      Authorization: `Bearer ${testGatewayToken}`,
      "Content-Type": "application/json",
    };

    const startResponse = await t.fetch("/api/radius/accounting", {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...accountingRequest,
        "Acct-Status-Type": restAttribute("Start", "integer"),
      }),
    });
    const interimResponse = await t.fetch("/api/radius/accounting", {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...accountingRequest,
        "Acct-Status-Type": restAttribute("Interim-Update", "integer"),
        "Acct-Session-Time": restAttribute(300, "integer"),
      }),
    });

    expect(startResponse.status).toBe(200);
    expect(interimResponse.status).toBe(200);
    const session = await t.run(async (ctx) =>
      ctx.db
        .query("router_sessions")
        .withIndex("by_workspace_and_router_and_session_id", (index) =>
          index
            .eq("workspaceId", workspaceId)
            .eq("routerId", routerId)
            .eq("sessionId", "live-session"),
        )
        .unique(),
    );
    expect(session?.status).toBe("active");

    await t.mutation(internal.radius.upsertSession, {
      sessionId: "legacy-interim-session",
      routerId,
      username: "subscriber-1",
      nasIdentifier: "pppoe-nas",
      status: "interim",
      startTime: new Date().toISOString(),
      connectionType: "pppoe",
    });

    await expect(
      owner.query(api.sessions.getActiveSummary, { workspaceId }),
    ).resolves.toMatchObject({ total: 2 });
    await expect(
      owner.query(api.routers.getStats, { workspaceId, routerId }),
    ).resolves.toMatchObject({ activeSessions: 2 });
    await expect(
      owner.query(api.reports.getNetworkReport, { workspaceId }),
    ).resolves.toMatchObject({ activeSessions: 2 });
  });

  it("does not reopen a stopped session when a delayed interim update arrives", async () => {
    const t = convexTest(schema, modules);
    const { routerId, workspaceId } = await setupPppoe(t);
    const started = {
      sessionId: "session-1",
      routerId,
      username: "subscriber-1",
      nasIdentifier: "pppoe-nas",
      status: "active" as const,
      startTime: "2026-10-16T00:00:00.000Z",
      connectionType: "pppoe" as const,
    };

    await t.mutation(internal.radius.upsertSession, started);
    await t.mutation(internal.radius.upsertSession, {
      ...started,
      status: "stopped",
      stopTime: "2026-10-16T00:10:00.000Z",
      terminateCause: "User-Request",
    });
    await t.mutation(internal.radius.upsertSession, {
      ...started,
      status: "interim",
      sessionTime: 300,
    });

    const session = await t.run(async (ctx) =>
      ctx.db
        .query("router_sessions")
        .withIndex("by_workspace_and_router_and_session_id", (index) =>
          index
            .eq("workspaceId", workspaceId)
            .eq("routerId", routerId)
            .eq("sessionId", "session-1"),
        )
        .unique(),
    );
    expect(session).toMatchObject({
      status: "stopped",
      stopTime: "2026-10-16T00:10:00.000Z",
      terminateCause: "User-Request",
    });
  });
});

describe("RADIUS HTTP gateway", () => {
  it("rejects requests without the configured gateway token", async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch("/api/radius/authenticate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nasIdentifier: "pppoe-nas",
        username: "subscriber-1",
        password: "temporary-test-password",
      }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unauthorized RADIUS gateway",
    });
  });

  it("authenticates PPPoE, logs no password, and returns package rate data", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, routerId } = await setupPppoe(t);
    const response = await t.fetch("/api/radius/authenticate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testGatewayToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        "NAS-Identifier": restAttribute("pppoe-nas"),
        "NAS-IP-Address": restAttribute("10.77.0.2", "ipaddr"),
        "User-Name": restAttribute("subscriber-1"),
        "User-Password": restAttribute("temporary-test-password"),
      }),
    });

    expect(response.status).toBe(200);
    const reply: unknown = await response.json();
    expect(reply).toMatchObject({
      "control:Auth-Type": { value: ["Accept"], op: ":=" },
      "reply:Reply-Message": { value: ["Access-Accept"], op: ":=" },
      "reply:Mikrotik-Rate-Limit": { value: ["10M/20M"], op: ":=" },
    });
    const log = await t.run(async (ctx) =>
      ctx.db
        .query("radius_logs")
        .withIndex("by_workspace_and_type", (index) =>
          index.eq("workspaceId", workspaceId).eq("type", "authenticate"),
        )
        .first(),
    );
    expect(log?.routerId).toBe(routerId);
    expect(log?.requestAttrs).not.toContain("temporary-test-password");
    expect(log?.responseCode).toBe("accept");
  });

  it("authenticates Hotspot requests from Service-Type and logs the service without passwords", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, routerId } = await setupHotspot(t);
    const response = await t.fetch("/api/radius/authenticate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testGatewayToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        "NAS-Identifier": restAttribute("hotspot-nas"),
        "NAS-IP-Address": restAttribute("10.77.0.2", "ipaddr"),
        "Service-Type": restAttribute(1, "integer"),
        "User-Name": restAttribute("hotspot-user"),
        "User-Password": restAttribute("temporary-hotspot-password"),
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      "control:Auth-Type": { value: ["Accept"], op: ":=" },
      "reply:Mikrotik-Rate-Limit": { value: ["5M/10M"], op: ":=" },
    });
    const inferredResponse = await t.fetch("/api/radius/authenticate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testGatewayToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nasIdentifier: "hotspot-nas",
        username: "hotspot-user",
        password: "temporary-hotspot-password",
      }),
    });
    expect(inferredResponse.status).toBe(200);
    const log = await t.run(async (ctx) =>
      ctx.db
        .query("radius_logs")
        .withIndex("by_workspace_and_type", (index) =>
          index.eq("workspaceId", workspaceId).eq("type", "authenticate"),
        )
        .first(),
    );
    expect(log?.routerId).toBe(routerId);
    expect(log?.requestAttrs).toContain('"service":"hotspot"');
    expect(log?.requestAttrs).not.toContain("temporary-hotspot-password");
  });

  it("links Hotspot accounting to the Hotspot subscriber and records its service type", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, subscriberId, routerId } = await setupHotspot(t);
    const response = await t.fetch("/api/radius/accounting", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testGatewayToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        "NAS-Identifier": restAttribute("hotspot-nas"),
        "User-Name": restAttribute("hotspot-user"),
        "Acct-Session-Id": restAttribute("hotspot-session"),
        "Acct-Status-Type": restAttribute("Start", "integer"),
        "Calling-Station-Id": restAttribute("AA:BB:CC:DD:EE:FF"),
        "Called-Station-Id": restAttribute("lobby-wifi"),
      }),
    });

    expect(response.status).toBe(200);
    const session = await t.run(async (ctx) =>
      ctx.db
        .query("router_sessions")
        .withIndex("by_workspace_and_router_and_session_id", (index) =>
          index
            .eq("workspaceId", workspaceId)
            .eq("routerId", routerId)
            .eq("sessionId", "hotspot-session"),
        )
        .unique(),
    );
    expect(session).toMatchObject({
      routerId,
      subscriberId,
      connectionType: "hotspot",
      status: "active",
      callingStationId: "AA:BB:CC:DD:EE:FF",
      calledStationId: "lobby-wifi",
    });
  });

  it("fails closed for ambiguous NAS identifiers unless the NAS IP disambiguates them", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId } = await setupPppoe(t);
    const secondRouterId = await t.run(async (ctx) =>
      ctx.db.insert("routers", {
        workspaceId,
        name: "Second PPPoE NAS",
        publicKey: "second-router-public-key",
        privateKey: "second-router-private-key",
        tunnelIp: "10.77.0.3/32",
        serverPublicKey: "server-public-key",
        serverEndpoint: "192.0.2.1:51820",
        serverTunnelIp: "10.77.0.1/32",
        allowedIPs: "10.77.0.0/24",
        status: "unknown",
        radiusSecret: "another-test-radius-secret",
        nasIdentifier: "pppoe-nas",
        createdAt: new Date().toISOString(),
      }),
    );
    const requestHeaders = {
      Authorization: `Bearer ${testGatewayToken}`,
      "Content-Type": "application/json",
    };
    const ambiguousResponse = await t.fetch("/api/radius/authenticate", {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        nasIdentifier: "pppoe-nas",
        username: "subscriber-1",
        password: "temporary-test-password",
      }),
    });
    expect(ambiguousResponse.status).toBe(401);

    const disambiguatedResponse = await t.fetch("/api/radius/authenticate", {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        nasIdentifier: "pppoe-nas",
        nasIpAddress: "10.77.0.3",
        username: "subscriber-1",
        password: "temporary-test-password",
      }),
    });
    expect(disambiguatedResponse.status).toBe(200);
    const log = await t.run(async (ctx) =>
      ctx.db
        .query("radius_logs")
        .withIndex("by_workspace_and_type", (index) =>
          index.eq("workspaceId", workspaceId).eq("type", "authenticate"),
        )
        .first(),
    );
    expect(log?.routerId).toBe(secondRouterId);
  });

  it("logs authorize endpoint requests as authorize events", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId } = await setupPppoe(t);
    const response = await t.fetch("/api/radius/authorize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testGatewayToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        "NAS-Identifier": restAttribute("pppoe-nas"),
        "User-Name": restAttribute("subscriber-1"),
        "User-Password": restAttribute("temporary-test-password"),
      }),
    });
    expect(response.status).toBe(200);
    const log = await t.run(async (ctx) =>
      ctx.db
        .query("radius_logs")
        .withIndex("by_workspace_and_type", (index) =>
          index.eq("workspaceId", workspaceId).eq("type", "authorize"),
        )
        .first(),
    );
    expect(log?.responseCode).toBe("accept");
  });

  it("returns a FreeRADIUS reject attribute for invalid subscriber credentials", async () => {
    const t = convexTest(schema, modules);
    await setupPppoe(t);
    const response = await t.fetch("/api/radius/authorize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testGatewayToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        "NAS-Identifier": restAttribute("pppoe-nas"),
        "User-Name": restAttribute("subscriber-1"),
        "User-Password": restAttribute("incorrect-password"),
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      "control:Auth-Type": { value: ["Reject"], op: ":=" },
      "reply:Reply-Message": { value: ["Access-Reject"], op: ":=" },
    });
  });

  it("rejects unrecognized RADIUS service types", async () => {
    const t = convexTest(schema, modules);
    await setupHotspot(t);
    const response = await t.fetch("/api/radius/authorize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testGatewayToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        "NAS-Identifier": restAttribute("hotspot-nas"),
        "Service-Type": restAttribute("Call-Check"),
        "User-Name": restAttribute("hotspot-user"),
        "User-Password": restAttribute("temporary-hotspot-password"),
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid RADIUS authentication request",
    });
  });

  it("records accounting updates as subscriber sessions", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, subscriberId, routerId } = await setupPppoe(t);
    const response = await t.fetch("/api/radius/accounting", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testGatewayToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        "NAS-Identifier": restAttribute("pppoe-nas"),
        "NAS-IP-Address": restAttribute("10.77.0.2", "ipaddr"),
        "User-Name": restAttribute("subscriber-1"),
        "Acct-Session-Id": restAttribute("http-accounting-session"),
        "Acct-Status-Type": restAttribute("Start", "integer"),
        "Acct-Input-Octets": restAttribute(1234, "integer"),
        "Acct-Output-Octets": restAttribute(5678, "integer"),
      }),
    });

    expect(response.status).toBe(200);
    const session = await t.run(async (ctx) =>
      ctx.db
        .query("router_sessions")
        .withIndex("by_workspace_and_router_and_session_id", (index) =>
          index
            .eq("workspaceId", workspaceId)
            .eq("routerId", routerId)
            .eq("sessionId", "http-accounting-session"),
        )
        .unique(),
    );
    expect(session).toMatchObject({
      routerId,
      subscriberId,
      status: "active",
      inputOctets: 1234,
      outputOctets: 5678,
    });
  });
});
