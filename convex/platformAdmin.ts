import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import {
  isPlatformAdminIdentity,
  isPlatformOwnerIdentity,
} from "./model/platformAdmin";
import { env, query } from "./_generated/server";

const tenantMetadata = v.object({
  workspaceId: v.id("workspaces"),
  name: v.string(),
  createdAt: v.string(),
  ownerId: v.id("users"),
  ownerName: v.union(v.string(), v.null()),
  ownerEmail: v.union(v.string(), v.null()),
  ownerAccessSuspended: v.boolean(),
  status: v.union(
    v.literal("active"),
    v.literal("suspended"),
    v.literal("archived"),
    v.literal("expired"),
    v.literal("deleting"),
  ),
  expiresAt: v.union(v.number(), v.null()),
  deletionPending: v.boolean(),
});

export function requirePlatformAdmin(
  tokenIdentifier: string | undefined,
  email: string | undefined,
) {
  if (
    !isPlatformAdminIdentity(
      tokenIdentifier,
      email,
      env.PLATFORM_ADMIN_TOKEN_IDENTIFIERS,
    )
  ) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Platform administrator access required",
    });
  }
}

export const isCurrentPlatformAdmin = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    return identity
      ? isPlatformAdminIdentity(
          identity.tokenIdentifier,
          identity.email,
          env.PLATFORM_ADMIN_TOKEN_IDENTIFIERS,
        )
      : false;
  },
});

export const isCurrentPlatformOwner = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    return identity ? isPlatformOwnerIdentity(identity.email) : false;
  },
});

export const currentPlatformOwnerTokenIdentifier = query({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    return identity && isPlatformOwnerIdentity(identity.email)
      ? identity.tokenIdentifier
      : null;
  },
});

export const listTenants = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(tenantMetadata),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    requirePlatformAdmin(identity?.tokenIdentifier, identity?.email);

    const page = await ctx.db
      .query("workspaces")
      .order("desc")
      .paginate(args.paginationOpts);
    const tenants = await Promise.all(
      page.page.map(async (workspace) => {
        const owner = await ctx.db.get(workspace.createdBy);
        const ownerMembership = await ctx.db
          .query("workspace_members")
          .withIndex("by_workspace_and_user", (q) =>
            q
              .eq("workspaceId", workspace._id)
              .eq("userId", workspace.createdBy),
          )
          .unique();
        return {
          workspaceId: workspace._id,
          name: workspace.name,
          createdAt: workspace.createdAt,
          ownerId: workspace.createdBy,
          ownerName: owner?.name ?? null,
          ownerEmail: owner?.email ?? null,
          ownerAccessSuspended:
            ownerMembership?.platformAccessSuspended ?? false,
          status:
            workspace.expiresAt !== undefined &&
            workspace.expiresAt <= Date.now() &&
            (workspace.platformStatus ?? "active") === "active"
              ? "expired"
              : (workspace.platformStatus ?? "active"),
          expiresAt: workspace.expiresAt ?? null,
          deletionPending: workspace.deletionPending ?? false,
        };
      }),
    );

    return { ...page, page: tenants };
  },
});
