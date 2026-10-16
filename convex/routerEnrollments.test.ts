/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function authenticatedTestUser(t: ReturnType<typeof convexTest>, subject: string) {
  return t.withIdentity({
    issuer: "https://issuer.example.test",
    subject,
    tokenIdentifier: `issuer|${subject}`,
    email: `${subject}@example.test`,
    name: subject,
  });
}

describe("router enrollment staging", () => {
  it("creates a high-entropy one-time token and stores only its hash", async () => {
    const t = convexTest(schema, modules);
    const owner = authenticatedTestUser(t, "router-enrollment-owner");
    const workspaceId = await owner.mutation(api.workspaces.create, { name: "Router workspace" });

    const enrollment = await owner.action(api.routerEnrollments.create, {
      workspaceId,
      name: "  Branch Router  ",
      location: "Branch office",
      model: "RB5009",
      routerOsVersion: "v7",
    });

    expect(enrollment.token).toMatch(/^[a-f0-9]{64}$/);
    expect(enrollment.expiresAt).toBeGreaterThan(Date.now());
    const stored = await t.run(async (ctx) =>
      ctx.db
        .query("router_enrollments")
        .withIndex("by_workspace", (index) => index.eq("workspaceId", workspaceId))
        .first(),
    );
    expect(stored).not.toBeNull();
    expect(stored?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.tokenHash).not.toBe(enrollment.token);
    expect(stored).not.toHaveProperty("token");
    expect(await owner.query(api.routerEnrollments.list, { workspaceId })).toMatchObject([
      {
        _id: enrollment.enrollmentId,
        name: "Branch Router",
        location: "Branch office",
        model: "RB5009",
        status: "pending",
      },
    ]);
    expect(await owner.query(api.routerEnrollments.list, { workspaceId })).not.toContainEqual(
      expect.objectContaining({ token: enrollment.token }),
    );
  });

  it("rejects unauthorized roles and isolates records and revocation by workspace", async () => {
    const t = convexTest(schema, modules);
    const owner = authenticatedTestUser(t, "router-enrollment-owner-two");
    const reader = authenticatedTestUser(t, "router-enrollment-reader");
    const workspaceA = await owner.mutation(api.workspaces.create, { name: "Workspace A" });
    const workspaceB = await owner.mutation(api.workspaces.create, { name: "Workspace B" });
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
      reader.action(api.routerEnrollments.create, {
        workspaceId: workspaceA,
        name: "Unauthorized router",
        routerOsVersion: "v7",
      }),
    ).rejects.toThrow();
    const enrollment = await owner.action(api.routerEnrollments.create, {
      workspaceId: workspaceA,
      name: "Workspace A router",
      routerOsVersion: "v7",
    });
    await expect(
      owner.query(api.routerEnrollments.list, { workspaceId: workspaceB }),
    ).resolves.toEqual([]);
    await expect(
      owner.mutation(api.routerEnrollments.revoke, {
        workspaceId: workspaceB,
        enrollmentId: enrollment.enrollmentId,
      }),
    ).rejects.toThrow();
    await expect(
      reader.query(api.routerEnrollments.list, { workspaceId: workspaceA }),
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.routerEnrollments.revoke, {
        workspaceId: workspaceA,
        enrollmentId: enrollment.enrollmentId,
      }),
    ).resolves.toBeNull();
    await expect(owner.query(api.routerEnrollments.list, { workspaceId: workspaceA })).resolves
      .toMatchObject([{ status: "revoked" }]);
  });

  it("rejects reused token hashes and permits a new enrollment after expiry", async () => {
    const t = convexTest(schema, modules);
    const owner = authenticatedTestUser(t, "router-enrollment-expiry-owner");
    const workspaceId = await owner.mutation(api.workspaces.create, { name: "Expiry workspace" });
    const commonArgs = {
      workspaceId,
      name: "Expiry router",
      routerOsVersion: "v7" as const,
      tokenHash: "a".repeat(64),
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    await owner.mutation(internal.routerEnrollments.createInternal, commonArgs);
    await expect(
      owner.mutation(internal.routerEnrollments.createInternal, {
        ...commonArgs,
        name: "A different router",
      }),
    ).rejects.toThrow(/already been used/i);

    const firstEnrollment = await t.run(async (ctx) => {
      const row = await ctx.db
        .query("router_enrollments")
        .withIndex("by_workspace", (index) => index.eq("workspaceId", workspaceId))
        .first();
      if (!row) throw new Error("Expected enrollment row");
      await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 });
      return row._id;
    });
    await expect(owner.query(api.routerEnrollments.list, { workspaceId })).resolves.toMatchObject([
      { _id: firstEnrollment, status: "pending", expiresAt: expect.any(Number) },
    ]);
    await expect(
      owner.action(api.routerEnrollments.create, {
        workspaceId,
        name: "Expiry router",
        routerOsVersion: "v7",
      }),
    ).resolves.toMatchObject({ token: expect.any(String) });
    await expect(owner.query(api.routerEnrollments.list, { workspaceId })).resolves.toMatchObject([
      { name: "Expiry router", status: "pending" },
      { _id: firstEnrollment, status: "expired" },
    ]);
  });

  it("does not create a second live enrollment for the same router name", async () => {
    const t = convexTest(schema, modules);
    const owner = authenticatedTestUser(t, "router-enrollment-duplicate-owner");
    const workspaceId = await owner.mutation(api.workspaces.create, { name: "Duplicate workspace" });
    await owner.action(api.routerEnrollments.create, {
      workspaceId,
      name: "same-router",
      routerOsVersion: "v7",
    });
    await expect(
      owner.action(api.routerEnrollments.create, {
        workspaceId,
        name: " Same-Router ",
        routerOsVersion: "v7",
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it("binds a RouterOS-generated public key once and never stores private-key material", async () => {
    const t = convexTest(schema, modules);
    const owner = authenticatedTestUser(t, "router-enrollment-key-owner");
    const workspaceId = await owner.mutation(api.workspaces.create, { name: "Key workspace" });
    const enrollment = await owner.action(api.routerEnrollments.create, {
      workspaceId,
      name: "Key router",
      routerOsVersion: "v7",
    });
    const routerPublicKey = `${"A".repeat(43)}=`;
    const radiusSecret = "b".repeat(64);

    await expect(
      owner.action(api.routerEnrollments.redeem, {
        workspaceId,
        enrollmentId: enrollment.enrollmentId,
        token: "0".repeat(64),
        routerPublicKey,
        radiusSecret,
      }),
    ).rejects.toThrow(/token is invalid/i);

    const credentials = await owner.action(
      api.routerEnrollments.redeem,
      {
        workspaceId,
        enrollmentId: enrollment.enrollmentId,
        token: enrollment.token,
        routerPublicKey,
        radiusSecret,
      },
    );
    expect(credentials.nasIdentifier).toMatch(/^astrid-[a-f0-9]{32}$/);
    expect(credentials).not.toHaveProperty("radiusSecret");
    const createdRouter = await t.run(async (ctx) => ctx.db.get(credentials.routerId));
    expect(createdRouter).toMatchObject({
      _id: credentials.routerId,
      workspaceId,
      name: "Key router",
      publicKey: routerPublicKey,
      nasIdentifier: credentials.nasIdentifier,
      status: "unknown",
    });
    expect(createdRouter?.radiusSecretHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createdRouter?.radiusSecretHash).not.toBe(radiusSecret);
    expect(createdRouter).not.toHaveProperty("privateKey");
    expect(createdRouter).not.toHaveProperty("radiusSecret");
    const listedRouters = await owner.query(api.routers.list, { workspaceId });
    expect(listedRouters).toMatchObject([
      { _id: credentials.routerId, nasIdentifier: credentials.nasIdentifier },
    ]);
    expect(listedRouters[0]).not.toHaveProperty("radiusSecretHash");
    expect(listedRouters[0]).not.toHaveProperty("privateKey");

    await expect(
      owner.action(api.routerEnrollments.redeem, {
        workspaceId,
        enrollmentId: enrollment.enrollmentId,
        token: enrollment.token,
        routerPublicKey,
        radiusSecret,
      }),
    ).resolves.toEqual({ routerId: credentials.routerId, nasIdentifier: credentials.nasIdentifier });

    const redeemed = await owner.query(api.routerEnrollments.list, { workspaceId });
    expect(redeemed).toMatchObject([
      {
        _id: enrollment.enrollmentId,
        status: "redeemed",
        routerPublicKey,
        routerId: credentials.routerId,
      },
    ]);

    const stored = await t.run(async (ctx) => ctx.db.get(enrollment.enrollmentId));
    expect(stored).not.toHaveProperty("privateKey");
    expect(stored).not.toHaveProperty("presharedKey");
    await expect(
      owner.action(api.routerEnrollments.redeem, {
        workspaceId,
        enrollmentId: enrollment.enrollmentId,
        token: enrollment.token,
        routerPublicKey,
        radiusSecret: "c".repeat(64),
      }),
    ).rejects.toThrow(/different credentials/i);

    const secondEnrollment = await owner.action(api.routerEnrollments.create, {
      workspaceId,
      name: "Second key router",
      routerOsVersion: "v7",
    });
    await expect(
      owner.action(api.routerEnrollments.redeem, {
        workspaceId,
        enrollmentId: secondEnrollment.enrollmentId,
        token: secondEnrollment.token,
        routerPublicKey,
        radiusSecret,
      }),
    ).rejects.toThrow(/already enrolled/i);
  });

  it("does not allow a new enrollment to reuse a registered router name", async () => {
    const t = convexTest(schema, modules);
    const owner = authenticatedTestUser(t, "router-enrollment-existing-router-owner");
    const workspaceId = await owner.mutation(api.workspaces.create, { name: "Existing router workspace" });
    const enrollment = await owner.action(api.routerEnrollments.create, {
      workspaceId,
      name: "Core Router",
      routerOsVersion: "v7",
    });
    await owner.action(api.routerEnrollments.redeem, {
      workspaceId,
      enrollmentId: enrollment.enrollmentId,
      token: enrollment.token,
      routerPublicKey: `${"B".repeat(43)}=`,
      radiusSecret: "d".repeat(64),
    });

    await expect(
      owner.action(api.routerEnrollments.create, {
        workspaceId,
        name: " core router ",
        routerOsVersion: "v7",
      }),
    ).rejects.toThrow(/already registered/i);
  });
});
