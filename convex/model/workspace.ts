import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const workspaceRoles = [
  "owner",
  "admin",
  "billing",
  "network",
  "read_only",
] as const;

export type WorkspaceRole = (typeof workspaceRoles)[number];

type WorkspaceCtx = QueryCtx | MutationCtx;

export async function requireWorkspaceRole(
  ctx: WorkspaceCtx,
  workspaceId: Id<"workspaces">,
  allowedRoles: readonly WorkspaceRole[],
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
    });
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  if (!user) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "User profile is not initialized",
    });
  }

  const membership = await ctx.db
    .query("workspace_members")
    .withIndex("by_workspace_and_user", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", user._id),
    )
    .unique();
  if (!membership) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Workspace access denied",
    });
  }
  if (membership.platformAccessSuspended) {
    throw new ConvexError({
      code: "WORKSPACE_ACCESS_SUSPENDED",
      message: "Your access to this workspace has been suspended",
    });
  }
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) {
    throw new ConvexError({
      code: "WORKSPACE_NOT_FOUND",
      message: "Workspace not found",
    });
  }
  const status = workspace.platformStatus ?? "active";
  const isExpired =
    workspace.expiresAt !== undefined && workspace.expiresAt <= Date.now();
  if (status !== "active" || isExpired) {
    throw new ConvexError({
      code:
        status === "archived"
          ? "WORKSPACE_ARCHIVED"
          : status === "expired" || isExpired
            ? "WORKSPACE_EXPIRED"
            : "WORKSPACE_SUSPENDED",
      message:
        status === "archived"
          ? "This workspace has been archived"
          : status === "expired" || isExpired
            ? "This workspace subscription has expired"
            : "This workspace has been suspended",
    });
  }
  if (!allowedRoles.includes(membership.role)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Insufficient workspace permissions",
    });
  }

  return { identity, user, membership };
}
