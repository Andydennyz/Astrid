import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireWorkspaceRole } from "./model/workspace";

const workspaceRoleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("billing"),
  v.literal("network"),
  v.literal("read_only"),
);

export const listMine = query({
  args: {},
  returns: v.array(
    v.object({
      workspaceId: v.id("workspaces"),
      name: v.string(),
      role: workspaceRoleValidator,
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Authentication required" });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return [];

    const memberships = await ctx.db
      .query("workspace_members")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(100);
    const workspaces = await Promise.all(
      memberships.map(async (membership) => {
        const workspace = await ctx.db.get(membership.workspaceId);
        return workspace
          ? {
              workspaceId: workspace._id,
              name: workspace.name,
              role: membership.role,
            }
          : null;
      }),
    );
    return workspaces.filter((workspace) => workspace !== null);
  },
});

export const create = mutation({
  args: { name: v.string() },
  returns: v.id("workspaces"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Authentication required" });
    }

    const name = args.name.trim();
    if (name.length < 2 || name.length > 80) {
      throw new ConvexError({
        code: "INVALID_WORKSPACE_NAME",
        message: "Workspace name must be between 2 and 80 characters",
      });
    }

    let user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: identity.tokenIdentifier,
        name: identity.name,
        email: identity.email,
      });
      user = await ctx.db.get(userId);
      if (!user) throw new Error("Failed to initialize the authenticated user profile");
    }

    const now = new Date().toISOString();
    const workspaceId = await ctx.db.insert("workspaces", {
      name,
      createdBy: user._id,
      createdAt: now,
    });
    await ctx.db.insert("workspace_members", {
      workspaceId,
      userId: user._id,
      role: "owner",
      joinedAt: now,
    });

    return workspaceId;
  },
});

export const listMembers = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(
    v.object({
      userId: v.id("users"),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      role: workspaceRoleValidator,
      joinedAt: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, ["owner", "admin"]);

    const memberships = await ctx.db
      .query("workspace_members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(200);
    const members = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get(membership.userId);
        return user
          ? {
              userId: user._id,
              name: user.name,
              email: user.email,
              role: membership.role,
              joinedAt: membership.joinedAt,
            }
          : null;
      }),
    );
    return members.filter((member) => member !== null);
  },
});

export const rename = mutation({
  args: { workspaceId: v.id("workspaces"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, ["owner", "admin"]);
    const name = args.name.trim();
    if (name.length < 2 || name.length > 80) {
      throw new ConvexError({
        code: "INVALID_WORKSPACE_NAME",
        message: "Workspace name must be between 2 and 80 characters",
      });
    }
    await ctx.db.patch(args.workspaceId, { name });
    return null;
  },
});
