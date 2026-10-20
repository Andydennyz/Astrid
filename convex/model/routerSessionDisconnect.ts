import type { Doc } from "../_generated/dataModel";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

async function enqueueSessionDisconnect(
  ctx: MutationCtx,
  session: Doc<"router_sessions">,
  setup: Doc<"router_management_setups">,
  reason: string,
  serviceExpiryAt?: string,
) {
  const routerId = session.routerId;
  if (!routerId || session.connectionType !== "pppoe" || !session.sessionId) {
    return { operationId: null, created: false };
  }

  const existing = await ctx.db
    .query("router_gateway_operations")
    .withIndex("by_ws_router_op_session", (index) =>
      index
        .eq("workspaceId", session.workspaceId)
        .eq("routerId", routerId)
        .eq("operationType", "disconnect_ppp_session")
        .eq("targetSessionId", session.sessionId),
    )
    .first();
  if (
    existing &&
    (existing.status === "pending" ||
      existing.status === "leased" ||
      existing.status === "succeeded")
  ) {
    return { operationId: existing._id, created: false };
  }

  const operationId = await ctx.db.insert("router_gateway_operations", {
    workspaceId: session.workspaceId,
    routerId,
    setupId: setup._id,
    operationType: "disconnect_ppp_session",
    connectionType: "pppoe",
    targetSessionId: session.sessionId,
    targetUsername: session.username,
    ...(serviceExpiryAt === undefined ? {} : { serviceExpiryAt }),
    status: "pending",
    attemptCount: 0,
    createdAt: new Date().toISOString(),
  });
  await ctx.db.insert("audit_logs", {
    workspaceId: session.workspaceId,
    userId: "system:subscriber-access",
    action: "subscriber_disconnect_queued",
    resource: "router_session",
    resourceId: session._id,
    details: reason,
    createdAt: new Date().toISOString(),
  });
  return { operationId, created: true };
}

async function findAppliedSetup(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  routerId: Id<"routers">,
) {
  const setups = await ctx.db
    .query("router_management_setups")
    .withIndex("by_workspace_and_router", (index) =>
      index.eq("workspaceId", workspaceId).eq("routerId", routerId),
    )
    .order("desc")
    .take(10);
  return setups.find((setup) => setup.status === "operator_applied") ?? null;
}

export async function queuePppoeSessionDisconnect(
  ctx: MutationCtx,
  session: Doc<"router_sessions">,
  reason: string,
) {
  if (
    session.status === "stopped" ||
    session.connectionType !== "pppoe" ||
    !session.routerId ||
    !session.sessionId
  ) {
    return null;
  }
  const gatewayCredential = await ctx.db
    .query("router_gateway_credentials")
    .withIndex("by_workspace", (index) =>
      index.eq("workspaceId", session.workspaceId),
    )
    .first();
  const setup = await findAppliedSetup(
    ctx,
    session.workspaceId,
    session.routerId,
  );
  if (!setup || !gatewayCredential) {
    await ctx.db.insert("audit_logs", {
      workspaceId: session.workspaceId,
      userId: "system:subscriber-access",
      action: "subscriber_disconnect_unavailable",
      resource: "router_session",
      resourceId: session._id,
      details: `${reason}: API-SSL gateway setup or workspace gateway credential is unavailable`,
      createdAt: new Date().toISOString(),
    });
    return null;
  }
  const queued = await enqueueSessionDisconnect(ctx, session, setup, reason);
  return queued.operationId;
}

export async function queueSubscriberPppoeDisconnects(
  ctx: MutationCtx,
  subscriber: Doc<"subscribers">,
  reason: string,
  serviceExpiryAt?: string,
) {
  const [activeSessions, interimSessions] = await Promise.all(
    (["active", "interim"] as const).map((status) =>
      ctx.db
        .query("router_sessions")
        .withIndex("by_workspace_and_subscriber_and_status", (index) =>
          index
            .eq("workspaceId", subscriber.workspaceId)
            .eq("subscriberId", subscriber._id)
            .eq("status", status),
        )
        .take(100),
    ),
  );
  const sessions = [...activeSessions, ...interimSessions].filter(
    (session) =>
      session.connectionType === "pppoe" &&
      session.routerId !== undefined &&
      session.sessionId.length > 0,
  );
  if (sessions.length === 0) return 0;

  const gatewayCredential = await ctx.db
    .query("router_gateway_credentials")
    .withIndex("by_workspace", (index) =>
      index.eq("workspaceId", subscriber.workspaceId),
    )
    .first();
  const setupsByRouter = new Map<
    Doc<"routers">["_id"],
    Doc<"router_management_setups"> | null
  >();
  const unavailableRouters = new Set<Doc<"routers">["_id"]>();
  let queued = 0;

  for (const session of sessions) {
    const routerId = session.routerId!;
    if (!setupsByRouter.has(routerId)) {
      setupsByRouter.set(
        routerId,
        await findAppliedSetup(ctx, subscriber.workspaceId, routerId),
      );
    }

    const setup = setupsByRouter.get(routerId);
    if (!setup || !gatewayCredential) {
      if (!unavailableRouters.has(routerId)) {
        await ctx.db.insert("audit_logs", {
          workspaceId: subscriber.workspaceId,
          userId: "system:subscriber-access",
          action: "subscriber_disconnect_unavailable",
          resource: "router_session",
          resourceId: session._id,
          details: `${reason}: active PPPoE session could not be queued for disconnect because the API-SSL gateway setup or workspace gateway credential is unavailable`,
          createdAt: new Date().toISOString(),
        });
        unavailableRouters.add(routerId);
      }
      continue;
    }

    const queuedOperation = await enqueueSessionDisconnect(
      ctx,
      session,
      setup,
      reason,
      serviceExpiryAt,
    );
    if (queuedOperation.created) queued += 1;
  }
  return queued;
}
