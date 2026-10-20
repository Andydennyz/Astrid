import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

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
      const setups = await ctx.db
        .query("router_management_setups")
        .withIndex("by_workspace_and_router", (index) =>
          index
            .eq("workspaceId", subscriber.workspaceId)
            .eq("routerId", routerId),
        )
        .order("desc")
        .take(10);
      setupsByRouter.set(
        routerId,
        setups.find((setup) => setup.status === "operator_applied") ?? null,
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

    const existing = await ctx.db
      .query("router_gateway_operations")
      .withIndex("by_ws_router_op_session", (index) =>
        index
          .eq("workspaceId", subscriber.workspaceId)
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
      continue;
    }

    await ctx.db.insert("router_gateway_operations", {
      workspaceId: subscriber.workspaceId,
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
    queued += 1;
  }
  return queued;
}
