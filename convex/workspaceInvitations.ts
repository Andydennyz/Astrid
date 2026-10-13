import { ConvexError, v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireWorkspaceRole } from "./model/workspace";

const invitationRole = v.union(
  v.literal("admin"),
  v.literal("billing"),
  v.literal("network"),
  v.literal("read_only"),
);
const readableInvitation = v.object({
  _id: v.id("workspace_invitations"),
  email: v.string(),
  role: invitationRole,
  expiresAt: v.number(),
  createdAt: v.string(),
});
const managerRoles = ["owner", "admin"] as const;

export const listPending = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(readableInvitation),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, managerRoles);
    const pending = await ctx.db
      .query("workspace_invitations")
      .withIndex("by_workspace_and_status", (index) =>
        index.eq("workspaceId", args.workspaceId).eq("status", "pending"),
      )
      .take(100);
    return pending
      .filter((invitation) => invitation.expiresAt > Date.now())
      .map(({ _id, email, role, expiresAt, createdAt }) => ({
        _id,
        email,
        role,
        expiresAt,
        createdAt,
      }));
  },
});

export const revoke = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    invitationId: v.id("workspace_invitations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, managerRoles);
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.workspaceId !== args.workspaceId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Invitation not found" });
    }
    if (invitation.status === "pending") {
      await ctx.db.patch(args.invitationId, { status: "revoked" });
    }
    return null;
  },
});

export const createInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    email: v.string(),
    role: invitationRole,
    tokenHash: v.string(),
    expiresAt: v.number(),
  },
  returns: v.id("workspace_invitations"),
  handler: async (ctx, args) => {
    const { user } = await requireWorkspaceRole(ctx, args.workspaceId, managerRoles);
    if (args.expiresAt <= Date.now()) {
      throw new ConvexError({ code: "INVITATION_EXPIRED", message: "Invitation expiry is invalid" });
    }
    const invitationsForEmail = await ctx.db
      .query("workspace_invitations")
      .withIndex("by_workspace_and_email", (index) =>
        index.eq("workspaceId", args.workspaceId).eq("email", args.email),
      )
      .take(100);

    for (const invitation of invitationsForEmail) {
      if (invitation.status === "pending") {
        await ctx.db.patch(invitation._id, { status: "revoked" });
      }
    }

    return await ctx.db.insert("workspace_invitations", {
      ...args,
      invitedBy: user._id,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  },
});

export const acceptInternal = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.id("workspaces"),
  handler: async (ctx, args): Promise<Id<"workspaces">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in to accept this invitation" });
    }
    if (!identity.email) {
      throw new ConvexError({
        code: "EMAIL_REQUIRED",
        message: "Your authenticated account does not provide an email address",
      });
    }

    const invitation = await ctx.db
      .query("workspace_invitations")
      .withIndex("by_token_hash", (index) => index.eq("tokenHash", args.tokenHash))
      .unique();
    if (!invitation || invitation.status !== "pending") {
      throw new ConvexError({ code: "INVALID_INVITATION", message: "Invitation is invalid or already used" });
    }
    if (invitation.expiresAt <= Date.now()) {
      throw new ConvexError({ code: "INVITATION_EXPIRED", message: "Invitation has expired" });
    }

    const email = identity.email.trim().toLowerCase();
    if (email !== invitation.email) {
      throw new ConvexError({
        code: "INVITATION_EMAIL_MISMATCH",
        message: "Sign in with the email address that received this invitation",
      });
    }

    let user = await ctx.db
      .query("users")
      .withIndex("by_token", (index) => index.eq("tokenIdentifier", identity.tokenIdentifier))
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

    const membership = await ctx.db
      .query("workspace_members")
      .withIndex("by_workspace_and_user", (index) =>
        index.eq("workspaceId", invitation.workspaceId).eq("userId", user._id),
      )
      .unique();
    if (!membership) {
      await ctx.db.insert("workspace_members", {
        workspaceId: invitation.workspaceId,
        userId: user._id,
        role: invitation.role,
        joinedAt: new Date().toISOString(),
      });
    }
    await ctx.db.patch(invitation._id, { status: "accepted" });
    return invitation.workspaceId;
  },
});
