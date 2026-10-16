/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { createWorkspaceFixture } from "../src/test/workspace-fixtures";

const modules = import.meta.glob("./**/*.ts");

function testIdentity(subject: string, email: string) {
  return {
    issuer: "https://issuer.example.test",
    subject,
    tokenIdentifier: `issuer|${subject}`,
    email,
    name: subject,
  };
}

beforeEach(() => {
  vi.stubEnv("PLATFORM_ADMIN_TOKEN_IDENTIFIERS", "issuer|platform-admin");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function createTenantAndAdminMember(t: ReturnType<typeof convexTest>) {
  const owner = t.withIdentity(
    testIdentity("tenant-owner", "owner@example.test"),
  );
  const member = t.withIdentity(
    testIdentity("tenant-member", "member@example.test"),
  );
  const platformOwner = t.withIdentity(
    testIdentity("platform-admin", "andywesonga43@gmail.com"),
  );
  const workspaceId = await createWorkspaceFixture(
    t,
    owner,
    "Lifecycle tenant",
  );
  const memberId = await member.mutation(api.users.updateCurrentUser, {});
  await t.run(async (ctx) => {
    await ctx.db.insert("workspace_members", {
      workspaceId,
      userId: memberId,
      role: "admin",
      joinedAt: new Date().toISOString(),
    });
  });
  return { owner, member, memberId, platformOwner, workspaceId };
}

describe("platform tenant management", () => {
  it("suspends only the owner and leaves other tenant members active with an account alert", async () => {
    const t = convexTest(schema, modules);
    const { owner, member, memberId, platformOwner, workspaceId } =
      await createTenantAndAdminMember(t);

    await platformOwner.mutation(
      api.platformManagement.setOwnerAccessSuspended,
      { workspaceId, suspended: true },
    );

    await expect(
      owner.query(api.workspaces.listMembers, { workspaceId }),
    ).rejects.toThrow("Your access to this workspace has been suspended");
    await expect(
      member.query(api.workspaces.listMembers, { workspaceId }),
    ).resolves.toHaveLength(2);
    const memberAlerts = await member.query(
      api.platformManagement.listAccountAlerts,
      {
        paginationOpts: { numItems: 20, cursor: null },
      },
    );
    const ownerAlerts = await owner.query(
      api.platformManagement.listAccountAlerts,
      {
        paginationOpts: { numItems: 20, cursor: null },
      },
    );
    expect(memberAlerts.page).toHaveLength(0);
    expect(ownerAlerts.page).toMatchObject([
      {
        title: "Tenant owner access suspended",
        workspaceName: "Lifecycle tenant",
        read: false,
      },
    ]);
    expect(memberId).toBeTruthy();
  });

  it("archives and restores tenant access and alerts every member", async () => {
    const t = convexTest(schema, modules);
    const { member, platformOwner, workspaceId } =
      await createTenantAndAdminMember(t);

    await platformOwner.mutation(api.platformManagement.setTenantStatus, {
      workspaceId,
      status: "archived",
    });
    await expect(
      member.query(api.workspaces.listMembers, { workspaceId }),
    ).rejects.toThrow("This workspace has been archived");
    await expect(
      member.query(api.platformManagement.listAccountAlerts, {
        paginationOpts: { numItems: 20, cursor: null },
      }),
    ).resolves.toMatchObject({
      page: [
        expect.objectContaining({
          title: "Tenant archived",
          workspaceName: "Lifecycle tenant",
        }),
      ],
    });

    await platformOwner.mutation(api.platformManagement.restoreTenant, {
      workspaceId,
    });
    await expect(
      member.query(api.workspaces.listMembers, { workspaceId }),
    ).resolves.toHaveLength(2);
  });

  it("automatically suspends an expired tenant and retains its tenant alert", async () => {
    const t = convexTest(schema, modules);
    const { member, platformOwner, workspaceId } =
      await createTenantAndAdminMember(t);
    const expiresAt = Date.now() + 60_000;
    await platformOwner.mutation(api.platformManagement.setExpiry, {
      workspaceId,
      expiresAt,
    });
    const routerId = await t.run(async (ctx) =>
      ctx.db.insert("routers", {
        workspaceId,
        name: "Expiry test router",
        publicKey: "expiry-router-key",
        nasIdentifier: "expiry-test-router",
        status: "unknown",
        createdAt: new Date().toISOString(),
      }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("router_gateway_credentials", {
        workspaceId,
        tokenHash: "a".repeat(64),
        createdBy: await ctx.db
          .query("users")
          .withIndex("by_token", (q) =>
            q.eq("tokenIdentifier", "issuer|tenant-owner"),
          )
          .unique()
          .then((user) => user!._id),
        createdAt: new Date().toISOString(),
      }),
    );

    vi.useFakeTimers();
    vi.setSystemTime(expiresAt + 1);
    await t.mutation(internal.platformManagement.expireTenant, {
      workspaceId,
      expiresAt,
    });

    await expect(
      member.query(api.workspaces.listMembers, { workspaceId }),
    ).rejects.toThrow("subscription has expired");
    await expect(
      t.query(internal.radius_helpers.getRouterForRadius, { routerId }),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.routerGateway.verifyGatewayCredential, {
        workspaceId,
        tokenHash: "a".repeat(64),
      }),
    ).resolves.toBeNull();
    const alerts = await member.query(
      api.platformManagement.listAccountAlerts,
      {
        paginationOpts: { numItems: 20, cursor: null },
      },
    );
    expect(alerts.page.map((alert) => alert.title)).toContain(
      "Tenant access expired",
    );
  });

  it("extends duration and sends a custom alert only to the selected tenant member", async () => {
    const t = convexTest(schema, modules);
    const { owner, member, memberId, platformOwner, workspaceId } =
      await createTenantAndAdminMember(t);
    const expiry = await platformOwner.mutation(
      api.platformManagement.extendDuration,
      { workspaceId, days: 20 },
    );
    expect(expiry).toBeGreaterThan(Date.now());
    await platformOwner.mutation(api.platformManagement.sendAlert, {
      workspaceId,
      userId: memberId,
      title: "Planned maintenance",
      message: "The portal will be unavailable briefly this weekend.",
    });
    const memberAlerts = await member.query(
      api.platformManagement.listAccountAlerts,
      {
        paginationOpts: { numItems: 20, cursor: null },
      },
    );
    const ownerAlerts = await owner.query(
      api.platformManagement.listAccountAlerts,
      {
        paginationOpts: { numItems: 20, cursor: null },
      },
    );
    expect(memberAlerts.page.map((alert) => alert.title)).toEqual([
      "Planned maintenance",
      "Tenant duration extended",
    ]);
    expect(ownerAlerts.page).toHaveLength(1);
  });

  it("revokes a member from one tenant, sends a persistent account alert, and transfers ownership", async () => {
    const t = convexTest(schema, modules);
    const { owner, member, memberId, platformOwner, workspaceId } =
      await createTenantAndAdminMember(t);
    const ownerId = await owner.mutation(api.users.updateCurrentUser, {});

    await platformOwner.mutation(api.platformManagement.revokeMemberAccess, {
      workspaceId,
      userId: memberId,
    });
    await expect(
      member.query(api.workspaces.listMembers, { workspaceId }),
    ).rejects.toThrow("Workspace access denied");
    await expect(
      member.query(api.platformManagement.listAccountAlerts, {
        paginationOpts: { numItems: 20, cursor: null },
      }),
    ).resolves.toMatchObject({
      page: [expect.objectContaining({ title: "Tenant access revoked" })],
    });

    const successorId = await member.mutation(api.users.updateCurrentUser, {});
    await t.run(async (ctx) => {
      await ctx.db.insert("workspace_members", {
        workspaceId,
        userId: successorId,
        role: "admin",
        joinedAt: new Date().toISOString(),
      });
    });
    await platformOwner.mutation(api.platformManagement.transferOwnership, {
      workspaceId,
      newOwnerId: successorId,
    });
    const updated = await t.run(async (ctx) => ({
      workspace: await ctx.db.get(workspaceId),
      oldOwner: await ctx.db
        .query("workspace_members")
        .withIndex("by_workspace_and_user", (q) =>
          q.eq("workspaceId", workspaceId).eq("userId", ownerId),
        )
        .first(),
    }));
    expect(updated.workspace?.createdBy).toBe(successorId);
  });

  it("permanently deletes tenant data in bounded batches but preserves account-level notice", async () => {
    const t = convexTest(schema, modules);
    const { owner, platformOwner, workspaceId } =
      await createTenantAndAdminMember(t);
    const packageId = await owner.mutation(api.packages.create, {
      workspaceId,
      name: "Deletion test package",
      speed: "10 Mbps",
      price: 1000,
      type: "pppoe",
      downloadSpeed: 10,
      uploadSpeed: 5,
      isActive: true,
    });

    vi.useFakeTimers();
    await expect(
      platformOwner.mutation(api.platformManagement.permanentlyDeleteTenant, {
        workspaceId,
        confirmWorkspaceName: "wrong name",
      }),
    ).rejects.toThrow("Enter the exact tenant name");

    await platformOwner.mutation(
      api.platformManagement.permanentlyDeleteTenant,
      {
        workspaceId,
        confirmWorkspaceName: "Lifecycle tenant",
      },
    );
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    const state = await t.run(async (ctx) => ({
      workspace: await ctx.db.get(workspaceId),
      package: await ctx.db.get(packageId),
      ownerAlerts: await ctx.db
        .query("account_alerts")
        .withIndex("by_user", (q) =>
          q.eq("userTokenIdentifier", "issuer|tenant-owner"),
        )
        .collect(),
      deletionAudit: await ctx.db
        .query("audit_logs")
        .withIndex("by_user", (q) => q.eq("userId", "issuer|platform-admin"))
        .collect(),
    }));
    expect(state.workspace).toBeNull();
    expect(state.package).toBeNull();
    expect(state.ownerAlerts).toMatchObject([
      expect.objectContaining({
        title: "Tenant permanently deleted",
        read: false,
      }),
    ]);
    expect(state.deletionAudit).toMatchObject([
      expect.objectContaining({ action: "tenant.permanently_deleted" }),
    ]);
  });
});
