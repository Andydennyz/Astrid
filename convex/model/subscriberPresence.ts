import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

type SubscriberServiceState = {
  status: "active" | "suspended" | "expired" | "pending";
  serviceExpiresAt?: string;
};

export function isSubscriberServiceAvailable(
  subscriber: SubscriberServiceState,
  now = Date.now(),
) {
  if (subscriber.status !== "active") return false;
  if (subscriber.serviceExpiresAt === undefined) return true;
  const expiresAt = Date.parse(subscriber.serviceExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export async function getRadiusOnlineSubscriberIds(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
) {
  const [activeSessions, interimSessions] = await Promise.all(
    (["active", "interim"] as const).map((status) =>
      ctx.db
        .query("router_sessions")
        .withIndex("by_workspace_and_status", (index) =>
          index.eq("workspaceId", workspaceId).eq("status", status),
        )
        .take(8192),
    ),
  );
  return new Set(
    [...activeSessions, ...interimSessions]
      .map((session) => session.subscriberId)
      .filter((id): id is Id<"subscribers"> => id !== undefined),
  );
}

export function isSubscriberOnline(
  subscriber: Pick<
    Doc<"subscribers">,
    | "_id"
    | "status"
    | "serviceExpiresAt"
    | "connectionType"
    | "isOnline"
  >,
  radiusOnlineSubscriberIds: ReadonlySet<Id<"subscribers">>,
) {
  if (!isSubscriberServiceAvailable(subscriber)) return false;
  return subscriber.connectionType === "static"
    ? subscriber.isOnline
    : radiusOnlineSubscriberIds.has(subscriber._id);
}
