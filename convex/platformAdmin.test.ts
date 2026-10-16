/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
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
  vi.unstubAllEnvs();
});

describe("platform tenant directory", () => {
  it("allows only the configured platform admin to list workspace metadata", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(
      testIdentity("tenant-owner", "owner@example.test"),
    );
    const admin = t.withIdentity(
      testIdentity("platform-admin", "andywesonga43@gmail.com"),
    );
    const workspaceId = await createWorkspaceFixture(
      t,
      owner,
      "Disposable tenant",
    );

    await expect(
      admin.query(api.platformAdmin.isCurrentPlatformAdmin, {}),
    ).resolves.toBe(true);
    const page = await admin.query(api.platformAdmin.listTenants, {
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(page.page).toMatchObject([
      {
        workspaceId,
        name: "Disposable tenant",
        createdAt: expect.any(String),
        ownerName: "tenant-owner",
        ownerEmail: "owner@example.test",
        status: "active",
        expiresAt: null,
        deletionPending: false,
      },
    ]);
    expect(page.isDone).toBe(true);
  });

  it("does not grant platform access to an ordinary workspace owner", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(
      testIdentity("tenant-owner", "owner@example.test"),
    );

    await expect(
      owner.query(api.platformAdmin.isCurrentPlatformAdmin, {}),
    ).resolves.toBe(false);
    await expect(
      owner.query(api.platformAdmin.listTenants, {
        paginationOpts: { numItems: 25, cursor: null },
      }),
    ).rejects.toThrow("Platform administrator access required");
  });

  it("fails closed when no platform-admin allowlist is configured", async () => {
    vi.stubEnv("PLATFORM_ADMIN_TOKEN_IDENTIFIERS", "");
    const t = convexTest(schema, modules);
    const wouldBeAdmin = t.withIdentity(
      testIdentity("platform-admin", "andywesonga43@gmail.com"),
    );

    await expect(
      wouldBeAdmin.query(api.platformAdmin.isCurrentPlatformAdmin, {}),
    ).resolves.toBe(false);
    await expect(
      wouldBeAdmin.query(api.platformAdmin.listTenants, {
        paginationOpts: { numItems: 25, cursor: null },
      }),
    ).rejects.toThrow("Platform administrator access required");
  });

  it("does not grant platform access to another email even when its token is allowlisted", async () => {
    const t = convexTest(schema, modules);
    const differentAccount = t.withIdentity(
      testIdentity("platform-admin", "someone-else@example.test"),
    );

    await expect(
      differentAccount.query(api.platformAdmin.isCurrentPlatformAdmin, {}),
    ).resolves.toBe(false);
    await expect(
      differentAccount.query(
        api.platformAdmin.currentPlatformOwnerTokenIdentifier,
        {},
      ),
    ).resolves.toBeNull();
  });

  it("returns the configured identity key only to the exact platform-owner email", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(
      testIdentity("platform-admin", "andywesonga43@gmail.com"),
    );

    await expect(
      owner.query(api.platformAdmin.currentPlatformOwnerTokenIdentifier, {}),
    ).resolves.toBe("issuer|platform-admin");
  });
});
