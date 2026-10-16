import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requirePlatformAdmin } from "./platformAdmin";

const requestStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);

const requestSummary = v.object({
  requestId: v.id("workspace_creation_requests"),
  name: v.string(),
  status: requestStatus,
  createdAt: v.string(),
  reviewedAt: v.union(v.string(), v.null()),
  workspaceId: v.union(v.id("workspaces"), v.null()),
  requesterName: v.union(v.string(), v.null()),
  requesterEmail: v.union(v.string(), v.null()),
});

async function getOrCreateRequester(ctx: MutationCtx) {
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
  return (
    user?._id ??
    (await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name,
      email: identity.email,
    }))
  );
}

export const request = mutation({
  args: { name: v.string() },
  returns: v.id("workspace_creation_requests"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (name.length < 2 || name.length > 80) {
      throw new ConvexError({
        code: "INVALID_WORKSPACE_NAME",
        message: "Workspace name must be between 2 and 80 characters",
      });
    }

    const requesterUserId = await getOrCreateRequester(ctx);
    const existing = await ctx.db
      .query("workspace_creation_requests")
      .withIndex("by_requester_and_status", (q) =>
        q.eq("requesterUserId", requesterUserId).eq("status", "pending"),
      )
      .first();
    if (existing) {
      throw new ConvexError({
        code: "PENDING_REQUEST_EXISTS",
        message: "You already have a workspace request awaiting review",
      });
    }

    return await ctx.db.insert("workspace_creation_requests", {
      requesterUserId,
      name,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  },
});

export const listMine = query({
  args: {},
  returns: v.array(requestSummary),
  handler: async (ctx) => {
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
    if (!user) return [];

    const requests = await ctx.db
      .query("workspace_creation_requests")
      .withIndex("by_requester", (q) => q.eq("requesterUserId", user._id))
      .order("desc")
      .take(20);
    return await Promise.all(
      requests.map(async (request) => ({
        requestId: request._id,
        name: request.name,
        status: request.status,
        createdAt: request.createdAt,
        reviewedAt: request.reviewedAt ?? null,
        workspaceId: request.workspaceId ?? null,
        requesterName: user.name ?? null,
        requesterEmail: user.email ?? null,
      })),
    );
  },
});

export const listPending = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(requestSummary),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    requirePlatformAdmin(identity?.tokenIdentifier, identity?.email);
    const page = await ctx.db
      .query("workspace_creation_requests")
      .withIndex("by_status_and_created_at", (q) => q.eq("status", "pending"))
      .order("asc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (request) => {
          const user = await ctx.db.get(request.requesterUserId);
          return {
            requestId: request._id,
            name: request.name,
            status: request.status,
            createdAt: request.createdAt,
            reviewedAt: request.reviewedAt ?? null,
            workspaceId: request.workspaceId ?? null,
            requesterName: user?.name ?? null,
            requesterEmail: user?.email ?? null,
          };
        }),
      ),
    };
  },
});

export const approve = mutation({
  args: { requestId: v.id("workspace_creation_requests") },
  returns: v.id("workspaces"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    requirePlatformAdmin(identity?.tokenIdentifier, identity?.email);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "pending") {
      throw new ConvexError({
        code: "REQUEST_NOT_PENDING",
        message: "Workspace request is no longer pending",
      });
    }
    const reviewerUserId = await getOrCreateRequester(ctx);
    const now = new Date().toISOString();
    const workspaceId = await ctx.db.insert("workspaces", {
      name: request.name,
      createdBy: request.requesterUserId,
      createdAt: now,
      platformStatus: "active",
    });
    await ctx.db.insert("workspace_members", {
      workspaceId,
      userId: request.requesterUserId,
      role: "owner",
      joinedAt: now,
    });
    await ctx.db.patch(args.requestId, {
      status: "approved",
      reviewedAt: now,
      reviewedBy: reviewerUserId,
      workspaceId,
    });
    await ctx.db.insert("audit_logs", {
      userId: reviewerUserId,
      action: "workspace_creation_request.approved",
      resource: "workspace_creation_request",
      resourceId: args.requestId,
      details: workspaceId,
      createdAt: now,
    });
    return workspaceId;
  },
});

export const reject = mutation({
  args: { requestId: v.id("workspace_creation_requests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    requirePlatformAdmin(identity?.tokenIdentifier, identity?.email);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "pending") {
      throw new ConvexError({
        code: "REQUEST_NOT_PENDING",
        message: "Workspace request is no longer pending",
      });
    }
    const reviewerUserId = await getOrCreateRequester(ctx);
    const now = new Date().toISOString();
    await ctx.db.patch(args.requestId, {
      status: "rejected",
      reviewedAt: now,
      reviewedBy: reviewerUserId,
    });
    await ctx.db.insert("audit_logs", {
      userId: reviewerUserId,
      action: "workspace_creation_request.rejected",
      resource: "workspace_creation_request",
      resourceId: args.requestId,
      createdAt: now,
    });
    return null;
  },
});
