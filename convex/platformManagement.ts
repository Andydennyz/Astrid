import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Id, TableNames } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  createAccountAlert,
  notifyWorkspaceMembers,
} from "./model/accountAlerts";
import { requirePlatformAdmin } from "./platformAdmin";
import schema from "./schema";

const workspaceRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("billing"),
  v.literal("network"),
  v.literal("read_only"),
);
const memberSummary = v.object({
  userId: v.id("users"),
  name: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  role: workspaceRole,
  accessSuspended: v.boolean(),
});

const workspaceDataTables = [
  "workspace_members",
  "workspace_invitations",
  "workspace_creation_requests",
  "subscribers",
  "packages",
  "invoices",
  "transactions",
  "tickets",
  "sms_logs",
  "notifications",
  "audit_logs",
  "network_devices",
  "routers",
  "router_management_setups",
  "router_gateway_credentials",
  "router_gateway_operations",
  "router_enrollments",
  "router_sessions",
  "radius_logs",
] as const satisfies readonly TableNames[];

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  requirePlatformAdmin(identity?.tokenIdentifier, identity?.email);
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
    });
  }
  return identity;
}

async function getWorkspace(ctx: MutationCtx, workspaceId: Id<"workspaces">) {
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) {
    throw new ConvexError({
      code: "WORKSPACE_NOT_FOUND",
      message: "Tenant workspace not found",
    });
  }
  if (workspace.deletionPending || workspace.platformStatus === "deleting") {
    throw new ConvexError({
      code: "WORKSPACE_DELETION_PENDING",
      message: "Permanent deletion is already in progress",
    });
  }
  return workspace;
}

function audit(
  ctx: MutationCtx,
  args: {
    userId: string;
    action: string;
    workspaceId?: Id<"workspaces">;
    details?: string;
  },
) {
  return ctx.db.insert("audit_logs", {
    ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
    userId: args.userId,
    action: args.action,
    resource: "platform_tenant",
    ...(args.workspaceId ? { resourceId: args.workspaceId } : {}),
    ...(args.details ? { details: args.details } : {}),
    createdAt: new Date().toISOString(),
  });
}

async function notifySpecificUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  workspaceId: Id<"workspaces">,
  workspaceName: string,
  title: string,
  message: string,
  type: "info" | "success" | "warning" | "error",
) {
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new ConvexError({
      code: "USER_NOT_FOUND",
      message: "Tenant member not found",
    });
  }
  await createAccountAlert(ctx, {
    userTokenIdentifier: user.tokenIdentifier,
    workspaceId,
    workspaceName,
    title,
    message,
    type,
  });
}

export const listMembers = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(memberSummary),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) {
      throw new ConvexError({
        code: "WORKSPACE_NOT_FOUND",
        message: "Tenant workspace not found",
      });
    }
    const page = await ctx.db
      .query("workspace_members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (membership) => {
          const user = await ctx.db.get(membership.userId);
          return {
            userId: membership.userId,
            name: user?.name ?? null,
            email: user?.email ?? null,
            role: membership.role,
            accessSuspended: membership.platformAccessSuspended ?? false,
          };
        }),
      ),
    };
  },
});

export const setOwnerAccessSuspended = mutation({
  args: { workspaceId: v.id("workspaces"), suspended: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    const workspace = await getWorkspace(ctx, args.workspaceId);
    const ownerMembership = await ctx.db
      .query("workspace_members")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", workspace.createdBy),
      )
      .unique();
    if (!ownerMembership) {
      throw new ConvexError({
        code: "OWNER_MEMBERSHIP_MISSING",
        message: "Tenant owner membership was not found",
      });
    }
    await ctx.db.patch(ownerMembership._id, {
      platformAccessSuspended: args.suspended,
    });
    const verb = args.suspended ? "suspended" : "restored";
    await notifySpecificUser(
      ctx,
      workspace.createdBy,
      workspace._id,
      workspace.name,
      `Tenant owner access ${verb}`,
      `Your owner access to ${workspace.name} was ${verb} by the platform administrator.`,
      args.suspended ? "warning" : "success",
    );
    await audit(ctx, {
      userId: identity.tokenIdentifier,
      action: `tenant.owner_access.${verb}`,
      workspaceId: workspace._id,
    });
    return null;
  },
});

export const setTenantStatus = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    status: v.union(v.literal("archived"), v.literal("active")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    const workspace = await getWorkspace(ctx, args.workspaceId);
    if (
      args.status === "active" &&
      workspace.expiresAt !== undefined &&
      workspace.expiresAt <= Date.now()
    ) {
      throw new ConvexError({
        code: "TENANT_EXPIRY_PASSED",
        message: "Extend the expiry date before restoring this tenant",
      });
    }
    const now = new Date().toISOString();
    await ctx.db.patch(workspace._id, {
      platformStatus: args.status,
      platformStatusUpdatedAt: now,
    });
    const restoring = args.status === "active";
    await notifyWorkspaceMembers(ctx, {
      workspaceId: workspace._id,
      workspaceName: workspace.name,
      title: restoring ? "Tenant access restored" : "Tenant archived",
      message: restoring
        ? `Access to ${workspace.name} has been restored by the platform administrator.`
        : `${workspace.name} has been archived by the platform administrator. Contact support if you believe this is a mistake.`,
      type: restoring ? "success" : "warning",
    });
    await audit(ctx, {
      userId: identity.tokenIdentifier,
      action: restoring ? "tenant.restored" : "tenant.archived",
      workspaceId: workspace._id,
    });
    return null;
  },
});

export const setExpiry = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    expiresAt: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    const workspace = await getWorkspace(ctx, args.workspaceId);
    if (args.expiresAt !== null && args.expiresAt <= Date.now()) {
      throw new ConvexError({
        code: "INVALID_EXPIRY",
        message: "Expiry must be a future date",
      });
    }
    const now = new Date().toISOString();
    const status =
      workspace.platformStatus === "expired"
        ? "active"
        : (workspace.platformStatus ?? "active");
    await ctx.db.patch(workspace._id, {
      expiresAt: args.expiresAt ?? undefined,
      platformStatus: status,
      platformStatusUpdatedAt: now,
    });
    if (args.expiresAt !== null) {
      await ctx.scheduler.runAt(
        args.expiresAt,
        internal.platformManagement.expireTenant,
        {
          workspaceId: workspace._id,
          expiresAt: args.expiresAt,
        },
      );
    }
    const message =
      args.expiresAt === null
        ? `The expiry date for ${workspace.name} was removed by the platform administrator.`
        : `Access to ${workspace.name} is scheduled to expire on ${new Date(args.expiresAt).toLocaleString()}. Contact the platform owner to extend your subscription.`;
    await notifyWorkspaceMembers(ctx, {
      workspaceId: workspace._id,
      workspaceName: workspace.name,
      title:
        args.expiresAt === null
          ? "Tenant expiry removed"
          : "Tenant expiry updated",
      message,
      type: args.expiresAt === null ? "info" : "warning",
    });
    await audit(ctx, {
      userId: identity.tokenIdentifier,
      action:
        args.expiresAt === null ? "tenant.expiry_removed" : "tenant.expiry_set",
      workspaceId: workspace._id,
      details:
        args.expiresAt === null
          ? undefined
          : new Date(args.expiresAt).toISOString(),
    });
    return null;
  },
});

export const extendDuration = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    days: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    if (!Number.isInteger(args.days) || args.days < 1 || args.days > 3650) {
      throw new ConvexError({
        code: "INVALID_EXTENSION",
        message: "Extension must be between 1 and 3650 days",
      });
    }
    const workspace = await getWorkspace(ctx, args.workspaceId);
    const nextExpiry =
      Math.max(workspace.expiresAt ?? Date.now(), Date.now()) +
      args.days * 86_400_000;
    await ctx.db.patch(workspace._id, {
      expiresAt: nextExpiry,
      platformStatus:
        workspace.platformStatus === "expired"
          ? "active"
          : (workspace.platformStatus ?? "active"),
      platformStatusUpdatedAt: new Date().toISOString(),
    });
    await ctx.scheduler.runAt(
      nextExpiry,
      internal.platformManagement.expireTenant,
      {
        workspaceId: workspace._id,
        expiresAt: nextExpiry,
      },
    );
    await notifyWorkspaceMembers(ctx, {
      workspaceId: workspace._id,
      workspaceName: workspace.name,
      title: "Tenant duration extended",
      message: `The expiry date for ${workspace.name} has been extended to ${new Date(nextExpiry).toLocaleString()}.`,
      type: "success",
    });
    await audit(ctx, {
      userId: identity.tokenIdentifier,
      action: "tenant.duration_extended",
      workspaceId: workspace._id,
      details: new Date(nextExpiry).toISOString(),
    });
    return nextExpiry;
  },
});

export const expireTenant = internalMutation({
  args: { workspaceId: v.id("workspaces"), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (
      !workspace ||
      workspace.expiresAt !== args.expiresAt ||
      workspace.deletionPending
    )
      return null;
    if (args.expiresAt > Date.now()) {
      await ctx.scheduler.runAt(
        args.expiresAt,
        internal.platformManagement.expireTenant,
        args,
      );
      return null;
    }
    const now = new Date().toISOString();
    const wasActive = (workspace.platformStatus ?? "active") === "active";
    if (wasActive) {
      await ctx.db.patch(workspace._id, {
        platformStatus: "expired",
        platformStatusUpdatedAt: now,
      });
    }
    await notifyWorkspaceMembers(ctx, {
      workspaceId: workspace._id,
      workspaceName: workspace.name,
      title: wasActive ? "Tenant access expired" : "Tenant expiry date reached",
      message: wasActive
        ? `Access to ${workspace.name} has been suspended because its subscription expired. Contact the platform owner to extend it.`
        : `The expiry date for ${workspace.name} has been reached. Contact the platform owner for assistance.`,
      type: "warning",
    });
    await audit(ctx, {
      userId: "system",
      action: wasActive ? "tenant.expired" : "tenant.expiry_reached",
      workspaceId: workspace._id,
    });
    return null;
  },
});

export const sendAlert = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.union(v.id("users"), v.null()),
    title: v.string(),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    const workspace = await getWorkspace(ctx, args.workspaceId);
    const title = args.title.trim();
    const message = args.message.trim();
    if (
      title.length < 2 ||
      title.length > 100 ||
      message.length < 2 ||
      message.length > 2000
    ) {
      throw new ConvexError({
        code: "INVALID_ALERT",
        message:
          "Alert title must be 2–100 characters and message 2–2000 characters",
      });
    }
    if (args.userId === null) {
      await notifyWorkspaceMembers(ctx, {
        workspaceId: workspace._id,
        workspaceName: workspace.name,
        title,
        message,
        type: "info",
      });
    } else {
      const membership = await ctx.db
        .query("workspace_members")
        .withIndex("by_workspace_and_user", (q) =>
          q.eq("workspaceId", workspace._id).eq("userId", args.userId!),
        )
        .unique();
      if (!membership) {
        throw new ConvexError({
          code: "NOT_TENANT_MEMBER",
          message: "Selected recipient is not a member of this tenant",
        });
      }
      await notifySpecificUser(
        ctx,
        args.userId,
        workspace._id,
        workspace.name,
        title,
        message,
        "info",
      );
    }
    await audit(ctx, {
      userId: identity.tokenIdentifier,
      action: "tenant.alert_sent",
      workspaceId: workspace._id,
      details: args.userId ?? "all_members",
    });
    return null;
  },
});

export const revokeMemberAccess = mutation({
  args: { workspaceId: v.id("workspaces"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    const workspace = await getWorkspace(ctx, args.workspaceId);
    if (workspace.createdBy === args.userId) {
      throw new ConvexError({
        code: "TRANSFER_OWNER_FIRST",
        message: "Transfer ownership before revoking the current owner",
      });
    }
    const membership = await ctx.db
      .query("workspace_members")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", workspace._id).eq("userId", args.userId),
      )
      .unique();
    if (!membership) {
      throw new ConvexError({
        code: "NOT_TENANT_MEMBER",
        message: "User is not a member of this tenant",
      });
    }
    await notifySpecificUser(
      ctx,
      args.userId,
      workspace._id,
      workspace.name,
      "Tenant access revoked",
      `Your access to ${workspace.name} has been revoked by the platform administrator. Your sign-in account remains active.`,
      "warning",
    );
    const user = await ctx.db.get(args.userId);
    if (user?.email) {
      const invitations = await ctx.db
        .query("workspace_invitations")
        .withIndex("by_workspace_and_email", (q) =>
          q
            .eq("workspaceId", workspace._id)
            .eq("email", user.email!.trim().toLowerCase()),
        )
        .take(100);
      await Promise.all(
        invitations
          .filter((invite) => invite.status === "pending")
          .map((invite) => ctx.db.patch(invite._id, { status: "revoked" })),
      );
    }
    await ctx.db.delete(membership._id);
    await audit(ctx, {
      userId: identity.tokenIdentifier,
      action: "tenant.member_access_revoked",
      workspaceId: workspace._id,
      details: user?.email ?? args.userId,
    });
    return null;
  },
});

export const transferOwnership = mutation({
  args: { workspaceId: v.id("workspaces"), newOwnerId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    const workspace = await getWorkspace(ctx, args.workspaceId);
    if (workspace.createdBy === args.newOwnerId) return null;
    const currentOwner = await ctx.db
      .query("workspace_members")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", workspace._id).eq("userId", workspace.createdBy),
      )
      .unique();
    const nextOwner = await ctx.db
      .query("workspace_members")
      .withIndex("by_workspace_and_user", (q) =>
        q.eq("workspaceId", workspace._id).eq("userId", args.newOwnerId),
      )
      .unique();
    if (!currentOwner || !nextOwner) {
      throw new ConvexError({
        code: "OWNER_MEMBERSHIP_MISSING",
        message: "Both current and new owners must be tenant members",
      });
    }
    if (nextOwner.platformAccessSuspended) {
      throw new ConvexError({
        code: "NEW_OWNER_SUSPENDED",
        message: "Restore the new owner's access before transferring ownership",
      });
    }
    await ctx.db.patch(currentOwner._id, {
      role: "admin",
      platformAccessSuspended: false,
    });
    await ctx.db.patch(nextOwner._id, { role: "owner" });
    await ctx.db.patch(workspace._id, { createdBy: args.newOwnerId });
    await notifyWorkspaceMembers(ctx, {
      workspaceId: workspace._id,
      workspaceName: workspace.name,
      title: "Tenant ownership transferred",
      message: `Ownership of ${workspace.name} has been transferred to another tenant member by the platform administrator.`,
      type: "info",
    });
    await notifySpecificUser(
      ctx,
      args.newOwnerId,
      workspace._id,
      workspace.name,
      "You are the new tenant owner",
      `You are now the owner of ${workspace.name}.`,
      "success",
    );
    await audit(ctx, {
      userId: identity.tokenIdentifier,
      action: "tenant.ownership_transferred",
      workspaceId: workspace._id,
      details: args.newOwnerId,
    });
    return null;
  },
});

export const processDeletionBatch = internalMutation({
  args: { jobId: v.id("workspace_deletion_jobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    const workspace = await ctx.db.get(job.workspaceId);
    if (!workspace) {
      await ctx.db.delete(job._id);
      return null;
    }
    const tableName = workspaceDataTables[job.tableIndex];
    if (!tableName) {
      await ctx.db.delete(workspace._id);
      await ctx.db.delete(job._id);
      await ctx.db.insert("audit_logs", {
        userId: job.startedBy,
        action: "tenant.permanently_deleted",
        resource: "platform_tenant",
        resourceId: job.workspaceId,
        details: workspace.name,
        createdAt: new Date().toISOString(),
      });
      return null;
    }
    const rows = await ctx.db
      .query(tableName)
      .withIndex("by_workspace", (q) => q.eq("workspaceId", job.workspaceId))
      .take(100);
    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
    const nextTableIndex =
      rows.length === 100 ? job.tableIndex : job.tableIndex + 1;
    await ctx.db.patch(job._id, { tableIndex: nextTableIndex });
    await ctx.scheduler.runAfter(
      0,
      internal.platformManagement.processDeletionBatch,
      {
        jobId: job._id,
      },
    );
    return null;
  },
});

export const permanentlyDeleteTenant = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    confirmWorkspaceName: v.string(),
  },
  returns: v.id("workspace_deletion_jobs"),
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    const workspace = await getWorkspace(ctx, args.workspaceId);
    if (args.confirmWorkspaceName.trim() !== workspace.name) {
      throw new ConvexError({
        code: "CONFIRMATION_MISMATCH",
        message: "Enter the exact tenant name to confirm permanent deletion",
      });
    }
    const members = await ctx.db
      .query("workspace_members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .take(1001);
    if (members.length > 1000) {
      throw new ConvexError({
        code: "WORKSPACE_MEMBER_ALERT_LIMIT",
        message:
          "This tenant exceeds the supported permanent-deletion alert limit",
      });
    }
    const memberUsers = await Promise.all(
      members.map(async (member) => await ctx.db.get(member.userId)),
    );
    await Promise.all(
      memberUsers.flatMap((user) =>
        user
          ? [
              createAccountAlert(ctx, {
                userTokenIdentifier: user.tokenIdentifier,
                workspaceId: workspace._id,
                workspaceName: workspace.name,
                title: "Tenant permanently deleted",
                message: `The ${workspace.name} tenant is being permanently deleted by the platform administrator. Its workspace data cannot be recovered.`,
                type: "error",
              }),
            ]
          : [],
      ),
    );
    const now = new Date().toISOString();
    await ctx.db.patch(workspace._id, {
      platformStatus: "deleting",
      platformStatusUpdatedAt: now,
      deletionPending: true,
    });
    const jobId = await ctx.db.insert("workspace_deletion_jobs", {
      workspaceId: workspace._id,
      startedBy: identity.tokenIdentifier,
      tableIndex: 0,
      createdAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.platformManagement.processDeletionBatch,
      { jobId },
    );
    return jobId;
  },
});

export const listAccountAlerts = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("account_alerts")),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Authentication required",
      });
    }
    return await ctx.db
      .query("account_alerts")
      .withIndex("by_user", (q) =>
        q.eq("userTokenIdentifier", identity.tokenIdentifier),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const accountAlertUnreadCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Authentication required",
      });
    }
    return (
      await ctx.db
        .query("account_alerts")
        .withIndex("by_user_and_read", (q) =>
          q
            .eq("userTokenIdentifier", identity.tokenIdentifier)
            .eq("read", false),
        )
        .take(1001)
    ).length;
  },
});

export const markAllAccountAlertsRead = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Authentication required",
      });
    }
    const unread = await ctx.db
      .query("account_alerts")
      .withIndex("by_user_and_read", (q) =>
        q.eq("userTokenIdentifier", identity.tokenIdentifier).eq("read", false),
      )
      .take(500);
    await Promise.all(
      unread.map((alert) => ctx.db.patch(alert._id, { read: true })),
    );
    return unread.length;
  },
});

export const markAccountAlertRead = mutation({
  args: { alertId: v.id("account_alerts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Authentication required",
      });
    }
    const alert = await ctx.db.get(args.alertId);
    if (!alert || alert.userTokenIdentifier !== identity.tokenIdentifier) {
      throw new ConvexError({
        code: "ALERT_NOT_FOUND",
        message: "Alert not found",
      });
    }
    if (!alert.read) await ctx.db.patch(alert._id, { read: true });
    return null;
  },
});

export const removeAccountAlert = mutation({
  args: { alertId: v.id("account_alerts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Authentication required",
      });
    }
    const alert = await ctx.db.get(args.alertId);
    if (!alert || alert.userTokenIdentifier !== identity.tokenIdentifier) {
      throw new ConvexError({
        code: "ALERT_NOT_FOUND",
        message: "Alert not found",
      });
    }
    await ctx.db.delete(alert._id);
    return null;
  },
});

export const restoreTenant = mutation({
  args: { workspaceId: v.id("workspaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    const workspace = await getWorkspace(ctx, args.workspaceId);
    if (
      workspace.expiresAt !== undefined &&
      workspace.expiresAt <= Date.now()
    ) {
      throw new ConvexError({
        code: "TENANT_EXPIRY_PASSED",
        message: "Extend the expiry date before restoring this tenant",
      });
    }
    await ctx.db.patch(workspace._id, {
      platformStatus: "active",
      platformStatusUpdatedAt: new Date().toISOString(),
    });
    await notifyWorkspaceMembers(ctx, {
      workspaceId: workspace._id,
      workspaceName: workspace.name,
      title: "Tenant access restored",
      message: `Access to ${workspace.name} has been restored by the platform administrator.`,
      type: "success",
    });
    await audit(ctx, {
      userId: identity.tokenIdentifier,
      action: "tenant.restored",
      workspaceId: workspace._id,
    });
    return null;
  },
});
