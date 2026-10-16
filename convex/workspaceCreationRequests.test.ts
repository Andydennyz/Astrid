/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

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

describe("workspace creation requests", () => {
  it("creates a workspace and owner membership only after platform-owner approval", async () => {
    const t = convexTest(schema, modules);
    const requester = t.withIdentity(
      testIdentity("requester", "requester@example.test"),
    );
    const platformOwner = t.withIdentity(
      testIdentity("platform-admin", "andywesonga43@gmail.com"),
    );

    await expect(
      requester.mutation(api.workspaces.create, {
        name: "Unapproved workspace",
      }),
    ).rejects.toThrow("Platform administrator access required");

    const requestId = await requester.mutation(
      api.workspaceCreationRequests.request,
      {
        name: "Approved workspace",
      },
    );
    await expect(
      t.run(async (ctx) => ctx.db.query("workspaces").collect()),
    ).resolves.toHaveLength(0);

    const pending = await platformOwner.query(
      api.workspaceCreationRequests.listPending,
      { paginationOpts: { numItems: 25, cursor: null } },
    );
    expect(pending.page).toMatchObject([
      {
        requestId,
        name: "Approved workspace",
        status: "pending",
        requesterEmail: "requester@example.test",
      },
    ]);

    const workspaceId = await platformOwner.mutation(
      api.workspaceCreationRequests.approve,
      { requestId },
    );
    const state = await t.run(async (ctx) => ({
      workspace: await ctx.db.get(workspaceId),
      membership: await ctx.db
        .query("workspace_members")
        .withIndex("by_workspace_and_user", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .first(),
      request: await ctx.db.get(requestId),
      workspaces: await ctx.db.query("workspaces").collect(),
    }));

    expect(state.workspace?.name).toBe("Approved workspace");
    expect(state.membership?.role).toBe("owner");
    expect(state.membership?.userId).toBe(state.workspace?.createdBy);
    expect(state.request).toMatchObject({
      status: "approved",
      workspaceId,
      reviewedBy: expect.any(String),
    });
    expect(state.workspaces).toHaveLength(1);
    await expect(
      platformOwner.mutation(api.workspaceCreationRequests.approve, {
        requestId,
      }),
    ).rejects.toThrow("Workspace request is no longer pending");
  });

  it("rejects a request without creating a workspace and prevents duplicate pending requests", async () => {
    const t = convexTest(schema, modules);
    const requester = t.withIdentity(
      testIdentity("requester-two", "requester-two@example.test"),
    );
    const platformOwner = t.withIdentity(
      testIdentity("platform-admin", "andywesonga43@gmail.com"),
    );
    const requestId = await requester.mutation(
      api.workspaceCreationRequests.request,
      {
        name: "Rejected workspace",
      },
    );

    await expect(
      requester.mutation(api.workspaceCreationRequests.request, {
        name: "Second request",
      }),
    ).rejects.toThrow("already have a workspace request");

    await platformOwner.mutation(api.workspaceCreationRequests.reject, {
      requestId,
    });
    const state = await t.run(async (ctx) => ({
      request: await ctx.db.get(requestId),
      workspaces: await ctx.db.query("workspaces").collect(),
    }));
    expect(state.request?.status).toBe("rejected");
    expect(state.workspaces).toHaveLength(0);
  });

  it("denies request approval to a non-owner account", async () => {
    const t = convexTest(schema, modules);
    const requester = t.withIdentity(
      testIdentity("requester-three", "r3@example.test"),
    );
    const otherAccount = t.withIdentity(
      testIdentity("platform-admin", "other@example.test"),
    );
    const requestId = await requester.mutation(
      api.workspaceCreationRequests.request,
      {
        name: "Protected request",
      },
    );

    await expect(
      otherAccount.mutation(api.workspaceCreationRequests.approve, {
        requestId,
      }),
    ).rejects.toThrow("Platform administrator access required");
    await expect(
      otherAccount.mutation(api.workspaceCreationRequests.reject, {
        requestId,
      }),
    ).rejects.toThrow("Platform administrator access required");
  });
});
