import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";

type AlertType = "info" | "success" | "warning" | "error";

export async function createAccountAlert(
  ctx: MutationCtx,
  args: {
    userTokenIdentifier: string;
    workspaceId?: Id<"workspaces">;
    workspaceName: string;
    title: string;
    message: string;
    type: AlertType;
  },
) {
  return await ctx.db.insert("account_alerts", {
    ...args,
    read: false,
    createdAt: new Date().toISOString(),
  });
}

export async function notifyWorkspaceMembers(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    workspaceName: string;
    title: string;
    message: string;
    type: AlertType;
    excludeTokenIdentifier?: string;
  },
) {
  const memberships = await ctx.db
    .query("workspace_members")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
    .take(1001);
  if (memberships.length > 1000) {
    throw new ConvexError({
      code: "WORKSPACE_MEMBER_ALERT_LIMIT",
      message: "This action exceeds the supported member alert limit",
    });
  }

  const recipients = await Promise.all(
    memberships.map(async (membership) => await ctx.db.get(membership.userId)),
  );
  await Promise.all(
    recipients.flatMap((recipient) =>
      recipient && recipient.tokenIdentifier !== args.excludeTokenIdentifier
        ? [
            createAccountAlert(ctx, {
              userTokenIdentifier: recipient.tokenIdentifier,
              workspaceId: args.workspaceId,
              workspaceName: args.workspaceName,
              title: args.title,
              message: args.message,
              type: args.type,
            }),
          ]
        : [],
    ),
  );
}
