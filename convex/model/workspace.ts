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
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Authentication required" });
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "User profile is not initialized" });
  }

  const membership = await ctx.db
    .query("workspace_members")
    .withIndex("by_workspace_and_user", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", user._id),
    )
    .unique();
  if (!membership) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Workspace access denied" });
  }
  if (!allowedRoles.includes(membership.role)) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Insufficient workspace permissions" });
  }

  return { identity, user, membership };
}
