/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function authenticatedTestUser(t: ReturnType<typeof convexTest>) {
  return t.withIdentity({
    issuer: "https://issuer.example.test",
    subject: "router-gateway-owner",
    tokenIdentifier: "issuer|router-gateway-owner",
    email: "router-gateway-owner@example.test",
    name: "Router Gateway Owner",
  });
}

describe("Router gateway operations", () => {
  it("scopes gateway tokens to a workspace and leases API-SSL checks without exposing secrets", async () => {
    const t = convexTest(schema, modules);
    const owner = authenticatedTestUser(t);
    const workspaceId = await owner.mutation(api.workspaces.create, {
      name: "Gateway workspace",
    });
    const otherWorkspaceId = await owner.mutation(api.workspaces.create, {
      name: "Other gateway workspace",
    });
    const routerId: Id<"routers"> = await t.run(async (ctx) =>
      ctx.db.insert("routers", {
        workspaceId,
        name: "Gateway test router",
        publicKey: "gateway-router-public-key",
        nasIdentifier: "gateway-router",
        status: "unknown",
        createdAt: new Date().toISOString(),
      }),
    );
    const setupId = await owner.mutation(api.routers.recordManagementSetup, {
      workspaceId,
      routerId,
      managementAddress: "10.77.0.2",
      gatewaySourceAddress: "10.77.0.1",
      apiUsername: "astrid-api-a1b2c3d4e5f6",
      certificateName: "astrid-api-ssl",
      scriptSha256: "a".repeat(64),
    });
    await expect(
      owner.mutation(api.routerGateway.enqueueManagementVerification, {
        workspaceId,
        routerId,
        setupId,
      }),
    ).rejects.toThrow(/mark the API-SSL setup as applied/i);
    await owner.mutation(api.routers.markManagementSetupApplied, { workspaceId, setupId });

    const credential = await owner.action(api.routerGateway.rotateGatewayCredential, {
      workspaceId,
    });
    const storedCredential = await t.run(async (ctx) =>
      ctx.db.query("router_gateway_credentials")
        .withIndex("by_workspace", (index) => index.eq("workspaceId", workspaceId))
        .first(),
    );
    expect(storedCredential?.tokenHash).not.toBe(credential.token);
    expect(storedCredential?.tokenHash).toHaveLength(64);
    await expect(
      owner.query(api.routerGateway.getCredentialStatus, { workspaceId }),
    ).resolves.toMatchObject({ configured: true });

    const operationId = await owner.mutation(
      api.routerGateway.enqueueManagementVerification,
      { workspaceId, routerId, setupId },
    );
    await expect(
      owner.mutation(api.routerGateway.enqueueManagementVerification, {
        workspaceId,
        routerId,
        setupId,
      }),
    ).resolves.toBe(operationId);

    const claimResponse = await t.fetch("/api/router-gateway/operations/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ workspaceId }),
    });
    expect(claimResponse.status).toBe(200);
    const claimed = await claimResponse.json();
    expect(claimed.operation).toMatchObject({
      operationId,
      routerId,
      managementAddress: "10.77.0.2",
      gatewaySourceAddress: "10.77.0.1",
      apiPort: 8729,
      apiUsername: "astrid-api-a1b2c3d4e5f6",
      certificateName: "astrid-api-ssl",
    });
    expect(claimed.operation).not.toHaveProperty("claimTokenHash");
    expect(claimed.operation).not.toHaveProperty("apiPassword");
    expect(claimed.claimToken).toMatch(/^[a-f0-9]{64}$/);

    const otherWorkspaceResponse = await t.fetch("/api/router-gateway/operations/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ workspaceId: otherWorkspaceId }),
    });
    expect(otherWorkspaceResponse.status).toBe(401);

    const invalidCompletion = await t.fetch("/api/router-gateway/operations/complete", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceId,
        operationId,
        claimToken: "0".repeat(64),
        status: "succeeded",
      }),
    });
    expect(invalidCompletion.status).toBe(409);

    const completionResponse = await t.fetch("/api/router-gateway/operations/complete", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceId,
        operationId,
        claimToken: claimed.claimToken,
        status: "succeeded",
        detail: "Router identity check passed",
      }),
    });
    expect(completionResponse.status).toBe(200);
    await expect(
      owner.query(api.routerGateway.listOperations, { workspaceId, routerId }),
    ).resolves.toMatchObject([
      {
        _id: operationId,
        status: "succeeded",
        detail: "Router identity check passed",
      },
    ]);

    const rotatedCredential = await owner.action(api.routerGateway.rotateGatewayCredential, {
      workspaceId,
    });
    expect(rotatedCredential.token).not.toBe(credential.token);
    const oldCredentialResponse = await t.fetch("/api/router-gateway/operations/claim", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ workspaceId }),
    });
    expect(oldCredentialResponse.status).toBe(401);
  });

  it("rejects credential rotation from read-only members", async () => {
    const t = convexTest(schema, modules);
    const owner = authenticatedTestUser(t);
    const workspaceId = await owner.mutation(api.workspaces.create, {
      name: "Read-only gateway workspace",
    });
    const reader = t.withIdentity({
      issuer: "https://issuer.example.test",
      subject: "gateway-reader",
      tokenIdentifier: "issuer|gateway-reader",
      email: "gateway-reader@example.test",
      name: "Gateway Reader",
    });
    const readerId = await reader.mutation(api.users.updateCurrentUser, {});
    await t.run(async (ctx) => {
      await ctx.db.insert("workspace_members", {
        workspaceId,
        userId: readerId,
        role: "read_only",
        joinedAt: new Date().toISOString(),
      });
    });

    await expect(
      reader.action(api.routerGateway.rotateGatewayCredential, { workspaceId }),
    ).rejects.toThrow();
  });
});
