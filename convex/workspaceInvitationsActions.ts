"use node";

import { createHash, randomBytes } from "node:crypto";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const invitationRole = v.union(
  v.literal("admin"),
  v.literal("billing"),
  v.literal("network"),
  v.literal("read_only"),
);

export const create = action({
  args: {
    workspaceId: v.id("workspaces"),
    email: v.string(),
    role: invitationRole,
  },
  returns: v.object({
    invitationId: v.id("workspace_invitations"),
    token: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError({ code: "INVALID_EMAIL", message: "Enter a valid email address" });
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const invitationId: Id<"workspace_invitations"> = await ctx.runMutation(
      internal.workspaceInvitations.createInternal,
      {
        workspaceId: args.workspaceId,
        email,
        role: args.role,
        tokenHash,
        expiresAt,
      },
    );
    return { invitationId, token, expiresAt };
  },
});

export const accept = action({
  args: { token: v.string() },
  returns: v.id("workspaces"),
  handler: async (ctx, args): Promise<Id<"workspaces">> => {
    if (args.token.length < 32 || args.token.length > 128) {
      throw new ConvexError({ code: "INVALID_INVITATION", message: "Invitation token is invalid" });
    }
    const tokenHash = createHash("sha256").update(args.token).digest("hex");
    return await ctx.runMutation(internal.workspaceInvitations.acceptInternal, {
      tokenHash,
    });
  },
});
