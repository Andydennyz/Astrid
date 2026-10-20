/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { createWorkspaceFixture } from "../src/test/workspace-fixtures";

const modules = import.meta.glob("./**/*.ts");

function authenticatedTestUser(
  t: ReturnType<typeof convexTest>,
  subject: string,
) {
  return t.withIdentity({
    issuer: "https://issuer.example.test",
    subject,
    tokenIdentifier: `issuer|${subject}`,
    email: `${subject}@example.test`,
    name: subject,
  });
}

async function insertRouter(
  t: ReturnType<typeof convexTest>,
  workspaceId: Id<"workspaces">,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("routers", {
      workspaceId,
      name: "Management test router",
      publicKey: "router-public-key",
      nasIdentifier: "management-test-router",
      status: "unknown",
      createdAt: new Date().toISOString(),
    }),
  );
}

const setupArgs = {
  managementAddress: "10.77.0.2",
  gatewaySourceAddress: "10.77.0.1",
  apiUsername: "astrid-api-a1b2c3d4e5f6",
  certificateName: "astrid-api-ssl",
  scriptSha256: "a".repeat(64),
};

describe("router management setup records", () => {
  it("stores metadata only and allows the workspace operator to track manual application", async () => {
    const t = convexTest(schema, modules);
    const owner = authenticatedTestUser(t, "management-owner");
    const workspaceId = await createWorkspaceFixture(
      t,
      owner,
      "Router management workspace",
    );
    const routerId = await insertRouter(t, workspaceId);
    const setupId = await owner.mutation(api.routers.recordManagementSetup, {
      workspaceId,
      routerId,
      ...setupArgs,
    });

    const stored = await t.run(async (ctx) => ctx.db.get(setupId));
    expect(stored).toMatchObject({
      workspaceId,
      routerId,
      ...setupArgs,
      apiPort: 8729,
      scriptVersion: "routeros-v7-api-ssl-v1",
      status: "prepared",
    });
    expect(stored).not.toHaveProperty("apiPassword");
    expect(stored).not.toHaveProperty("script");

    await expect(
      owner.query(api.routers.listManagementSetups, { workspaceId, routerId }),
    ).resolves.toMatchObject([{ _id: setupId, status: "prepared" }]);
    await expect(
      owner.mutation(api.routers.markManagementSetupApplied, {
        workspaceId,
        setupId,
      }),
    ).resolves.toBeNull();
    await expect(
      owner.query(api.routers.listManagementSetups, { workspaceId, routerId }),
    ).resolves.toMatchObject([{ _id: setupId, status: "operator_applied" }]);
  });

  it("saves resumable wizard milestones without storing router credentials", async () => {
    const t = convexTest(schema, modules);
    const owner = authenticatedTestUser(t, "management-progress-owner");
    const workspaceId = await createWorkspaceFixture(
      t,
      owner,
      "Router management progress workspace",
    );
    const routerId = await insertRouter(t, workspaceId);

    await expect(
      owner.query(api.routers.getManagementWizardProgress, {
        workspaceId,
        routerId,
      }),
    ).resolves.toBeNull();

    await owner.mutation(api.routers.saveManagementWizardProgress, {
      workspaceId,
      routerId,
      activeStep: 0,
      gatewayReady: false,
      gatewayConfigSaved: false,
    });
    await expect(
      owner.query(api.routers.getManagementWizardProgress, {
        workspaceId,
        routerId,
      }),
    ).resolves.toMatchObject({
      activeStep: 0,
      gatewayReady: false,
      gatewayConfigSaved: false,
    });

    await expect(
      owner.mutation(api.routers.saveManagementWizardProgress, {
        workspaceId,
        routerId,
        activeStep: 1,
        gatewayReady: true,
        gatewayConfigSaved: false,
      }),
    ).rejects.toThrow(/gateway credential/i);

    const userId = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_token", (index) =>
          index.eq("tokenIdentifier", "issuer|management-progress-owner"),
        )
        .unique();
      if (!user) throw new Error("Test owner was not created");
      await ctx.db.insert("router_gateway_credentials", {
        workspaceId,
        tokenHash: "b".repeat(64),
        createdBy: user._id,
        createdAt: new Date().toISOString(),
      });
      return user._id;
    });
    expect(userId).toBeDefined();

    const setupId = await owner.mutation(api.routers.recordManagementSetup, {
      workspaceId,
      routerId,
      ...setupArgs,
    });
    await owner.mutation(api.routers.markManagementSetupApplied, {
      workspaceId,
      setupId,
    });
    await owner.mutation(api.routers.saveManagementWizardProgress, {
      workspaceId,
      routerId,
      activeStep: 2,
      gatewayReady: true,
      gatewayConfigSaved: false,
    });
    await owner.mutation(api.routers.saveManagementWizardProgress, {
      workspaceId,
      routerId,
      activeStep: 3,
      gatewayReady: true,
      gatewayConfigSaved: true,
    });

    const progress = await owner.query(
      api.routers.getManagementWizardProgress,
      { workspaceId, routerId },
    );
    expect(progress).toMatchObject({
      activeStep: 3,
      gatewayReady: true,
      gatewayConfigSaved: true,
    });
    expect(progress).not.toHaveProperty("password");
    expect(progress).not.toHaveProperty("gatewayToken");

    await expect(
      owner.mutation(api.routers.saveManagementWizardProgress, {
        workspaceId,
        routerId,
        activeStep: 4,
        gatewayReady: true,
        gatewayConfigSaved: true,
      }),
    ).rejects.toThrow(/step is invalid/i);
  });

  it("restarts a step and excludes earlier router setup records from progress", async () => {
    const t = convexTest(schema, modules);
    const owner = authenticatedTestUser(t, "management-restart-owner");
    const workspaceId = await createWorkspaceFixture(
      t,
      owner,
      "Router management restart workspace",
    );
    const routerId = await insertRouter(t, workspaceId);
    const userId = await owner.mutation(api.users.updateCurrentUser, {});
    await t.run(async (ctx) => {
      await ctx.db.insert("router_gateway_credentials", {
        workspaceId,
        tokenHash: "c".repeat(64),
        createdBy: userId,
        createdAt: new Date().toISOString(),
      });
    });
    await owner.mutation(api.routers.saveManagementWizardProgress, {
      workspaceId,
      routerId,
      activeStep: 0,
      gatewayReady: true,
      gatewayConfigSaved: false,
    });
    const oldSetupId = await owner.mutation(api.routers.recordManagementSetup, {
      workspaceId,
      routerId,
      ...setupArgs,
    });
    await owner.mutation(api.routers.markManagementSetupApplied, {
      workspaceId,
      setupId: oldSetupId,
    });
    await owner.mutation(api.routers.saveManagementWizardProgress, {
      workspaceId,
      routerId,
      activeStep: 2,
      gatewayReady: true,
      gatewayConfigSaved: false,
    });

    await owner.mutation(api.routers.restartManagementWizardStep, {
      workspaceId,
      routerId,
      step: 1,
    });
    await expect(
      owner.query(api.routers.getManagementWizardProgress, {
        workspaceId,
        routerId,
      }),
    ).resolves.toMatchObject({
      activeStep: 1,
      gatewayReady: true,
      gatewayConfigSaved: false,
      setupResetAt: expect.any(String),
      verificationResetAt: expect.any(String),
    });
    await expect(
      owner.mutation(api.routers.saveManagementWizardProgress, {
        workspaceId,
        routerId,
        activeStep: 2,
        gatewayReady: true,
        gatewayConfigSaved: false,
      }),
    ).rejects.toThrow(/mark the RouterOS API-SSL script as applied/i);

    const newSetupId = await owner.mutation(api.routers.recordManagementSetup, {
      workspaceId,
      routerId,
      ...setupArgs,
    });
    await owner.mutation(api.routers.markManagementSetupApplied, {
      workspaceId,
      setupId: newSetupId,
    });
    await expect(
      owner.mutation(api.routers.saveManagementWizardProgress, {
        workspaceId,
        routerId,
        activeStep: 2,
        gatewayReady: true,
        gatewayConfigSaved: false,
      }),
    ).resolves.toBeNull();
    await expect(
      owner.query(api.routers.listManagementSetups, { workspaceId, routerId }),
    ).resolves.toMatchObject([
      { _id: newSetupId, status: "operator_applied" },
      { _id: oldSetupId, status: "operator_applied" },
    ]);
  });

  it("rejects invalid addresses, read-only writes, and cross-workspace setup access", async () => {
    const t = convexTest(schema, modules);
    const owner = authenticatedTestUser(t, "management-boundary-owner");
    const reader = authenticatedTestUser(t, "management-boundary-reader");
    const workspaceA = await createWorkspaceFixture(t, owner, "Workspace A");
    const workspaceB = await createWorkspaceFixture(t, owner, "Workspace B");
    const routerId = await insertRouter(t, workspaceA);
    const readerId = await reader.mutation(api.users.updateCurrentUser, {});
    await t.run(async (ctx) => {
      await ctx.db.insert("workspace_members", {
        workspaceId: workspaceA,
        userId: readerId,
        role: "read_only",
        joinedAt: new Date().toISOString(),
      });
    });

    await expect(
      owner.mutation(api.routers.recordManagementSetup, {
        workspaceId: workspaceA,
        routerId,
        ...setupArgs,
        managementAddress: "10.77.0.2; /user add name=attacker",
      }),
    ).rejects.toThrow(/valid IPv4/i);
    await expect(
      reader.mutation(api.routers.recordManagementSetup, {
        workspaceId: workspaceA,
        routerId,
        ...setupArgs,
      }),
    ).rejects.toThrow();

    const setupId = await owner.mutation(api.routers.recordManagementSetup, {
      workspaceId: workspaceA,
      routerId,
      ...setupArgs,
    });
    await expect(
      owner.query(api.routers.listManagementSetups, {
        workspaceId: workspaceB,
        routerId,
      }),
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.routers.markManagementSetupApplied, {
        workspaceId: workspaceB,
        setupId,
      }),
    ).rejects.toThrow();
  });
});
