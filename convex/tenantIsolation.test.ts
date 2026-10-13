/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function authenticatedTestUser(
  t: ReturnType<typeof convexTest>,
  subject: string,
  email: string,
) {
  return t.withIdentity({
    issuer: "https://issuer.example.test",
    subject,
    tokenIdentifier: `issuer|${subject}`,
    email,
    name: subject,
  });
}

describe("workspace tenant boundaries", () => {
  it("prevents cross-workspace reads and foreign parent references", async () => {
    const t = convexTest(schema, modules);
    const ownerA = authenticatedTestUser(t, "owner-a", "owner-a@example.test");
    const ownerB = authenticatedTestUser(t, "owner-b", "owner-b@example.test");
    const workspaceA = await ownerA.mutation(api.workspaces.create, { name: "Network A" });
    const workspaceB = await ownerB.mutation(api.workspaces.create, { name: "Network B" });
    await expect(
      t.query(api.packages.listActive, { workspaceId: workspaceA }),
    ).rejects.toThrow();

    const packageA = await ownerA.mutation(api.packages.create, {
      workspaceId: workspaceA,
      name: "Home 20",
      speed: "20 Mbps",
      price: 1000,
      type: "pppoe",
      downloadSpeed: 20,
      uploadSpeed: 10,
      isActive: true,
    });

    await expect(
      ownerB.query(api.packages.getById, { workspaceId: workspaceB, id: packageA }),
    ).resolves.toBeNull();
    await expect(
      ownerB.mutation(api.subscribers.create, {
        workspaceId: workspaceB,
        name: "Foreign package subscriber",
        phone: "+254700000001",
        status: "active",
        connectionType: "pppoe",
        packageId: packageA,
        monthlyFee: 1000,
        balance: 0,
      }),
    ).rejects.toThrow();
  });

  it("allows read-only members to read but not change workspace records", async () => {
    const t = convexTest(schema, modules);
    const owner = authenticatedTestUser(t, "owner", "owner@example.test");
    const reader = authenticatedTestUser(t, "reader", "reader@example.test");
    const workspaceId = await owner.mutation(api.workspaces.create, { name: "Read-only test" });
    await owner.mutation(api.packages.create, {
      workspaceId,
      name: "Home 20",
      speed: "20 Mbps",
      price: 1000,
      type: "pppoe",
      downloadSpeed: 20,
      uploadSpeed: 10,
      isActive: true,
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
      reader.query(api.packages.listActive, { workspaceId }),
    ).resolves.toHaveLength(1);
    await expect(
      reader.mutation(api.packages.create, {
        workspaceId,
        name: "Unauthorized",
        speed: "1 Mbps",
        price: 1,
        type: "pppoe",
        downloadSpeed: 1,
        uploadSpeed: 1,
        isActive: true,
      }),
    ).rejects.toThrow();
  });

  it("does not return router credentials from client-facing queries", async () => {
    const t = convexTest(schema, modules);
    const owner = authenticatedTestUser(t, "router-owner", "router-owner@example.test");
    const workspaceId = await owner.mutation(api.workspaces.create, { name: "Router security" });
    await owner.mutation(api.routers.create, {
      workspaceId,
      name: "Test router",
      publicKey: "public-key",
      privateKey: "private-key",
      presharedKey: "preshared-key",
      tunnelIp: "10.77.0.2/32",
      serverPublicKey: "server-public-key",
      serverEndpoint: "vpn.example.test:51820",
      serverTunnelIp: "10.77.0.1/32",
      allowedIPs: "10.77.0.0/24",
      radiusSecret: "radius-secret",
      nasIdentifier: "test-router",
    });

    const routers = await owner.query(api.routers.list, { workspaceId });
    expect(routers).toHaveLength(1);
    expect(routers[0]).not.toHaveProperty("privateKey");
    expect(routers[0]).not.toHaveProperty("presharedKey");
    expect(routers[0]).not.toHaveProperty("radiusSecret");
  });

  it("accepts an invitation only for the invited email and grants its assigned role", async () => {
    const t = convexTest(schema, modules);
    const owner = authenticatedTestUser(t, "invite-owner", "owner@example.test");
    const invitedUser = authenticatedTestUser(t, "invitee", "staff@example.test");
    const wrongUser = authenticatedTestUser(t, "wrong-user", "other@example.test");
    const workspaceId = await owner.mutation(api.workspaces.create, { name: "Invited workspace" });
    const invitation = await owner.action(api.workspaceInvitationsActions.create, {
      workspaceId,
      email: " Staff@Example.Test ",
      role: "network",
    });

    await expect(
      wrongUser.action(api.workspaceInvitationsActions.accept, { token: invitation.token }),
    ).rejects.toThrow();
    await expect(
      invitedUser.action(api.workspaceInvitationsActions.accept, { token: invitation.token }),
    ).resolves.toBe(workspaceId);

    await expect(
      invitedUser.query(api.workspaces.listMine, {}),
    ).resolves.toMatchObject([{ workspaceId, role: "network" }]);
    await expect(
      invitedUser.action(api.workspaceInvitationsActions.accept, { token: invitation.token }),
    ).rejects.toThrow();

    const revokedInvitation = await owner.action(api.workspaceInvitationsActions.create, {
      workspaceId,
      email: "revoked@example.test",
      role: "read_only",
    });
    await owner.mutation(api.workspaceInvitations.revoke, {
      workspaceId,
      invitationId: revokedInvitation.invitationId,
    });
    const revokedUser = authenticatedTestUser(t, "revoked-user", "revoked@example.test");
    await expect(
      revokedUser.action(api.workspaceInvitationsActions.accept, { token: revokedInvitation.token }),
    ).rejects.toThrow();
  });
});
