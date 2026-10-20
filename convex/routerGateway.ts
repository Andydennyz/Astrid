import { ConvexError, v } from "convex/values";
import {
  action,
  env,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireWorkspaceRole } from "./model/workspace";
import { isSubscriberServiceAvailable } from "./model/subscriberPresence";
import { encryptSubscriberPassword } from "./subscriberCredentials";

const managerRoles = ["owner", "admin", "network"] as const;
const operationStatus = v.union(
  v.literal("pending"),
  v.literal("leased"),
  v.literal("succeeded"),
  v.literal("failed"),
);
const operationType = v.union(
  v.literal("verify_management"),
  v.literal("disconnect_ppp_session"),
  v.literal("configure_radius"),
);
const publicOperation = v.object({
  _id: v.id("router_gateway_operations"),
  _creationTime: v.number(),
  routerId: v.id("routers"),
  setupId: v.id("router_management_setups"),
  operationType,
  targetSessionId: v.optional(v.string()),
  radiusServerAddress: v.optional(v.string()),
  routerTunnelAddress: v.optional(v.string()),
  nasIdentifier: v.optional(v.string()),
  status: operationStatus,
  attemptCount: v.number(),
  createdAt: v.string(),
  claimedAt: v.optional(v.string()),
  completedAt: v.optional(v.string()),
  detail: v.optional(v.string()),
});
const claimedOperation = v.object({
  operationId: v.id("router_gateway_operations"),
  routerId: v.id("routers"),
  operationType,
  managementAddress: v.string(),
  gatewaySourceAddress: v.string(),
  apiPort: v.literal(8729),
  apiUsername: v.string(),
  certificateName: v.string(),
  targetSessionId: v.optional(v.string()),
  targetUsername: v.optional(v.string()),
  radiusServerAddress: v.optional(v.string()),
  routerTunnelAddress: v.optional(v.string()),
  nasIdentifier: v.optional(v.string()),
  radiusSecretCiphertext: v.optional(v.string()),
  radiusSecretIv: v.optional(v.string()),
});
const leaseDurationMs = 2 * 60 * 1000;
const maxDisconnectAttempts = 3;

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function sanitizeDetail(value: string) {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f ? " " : character;
    })
    .join("")
    .trim();
}

export const getCredentialStatus = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    configured: v.boolean(),
    createdAt: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, managerRoles);
    const credential = await ctx.db
      .query("router_gateway_credentials")
      .withIndex("by_workspace", (index) =>
        index.eq("workspaceId", args.workspaceId),
      )
      .first();
    return {
      configured: credential !== undefined,
      createdAt: credential?.createdAt ?? null,
    };
  },
});

export const rotateGatewayCredential = action({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({ token: v.string(), createdAt: v.string() }),
  handler: async (ctx, args) => {
    const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    );
    const tokenHash = toHex(new Uint8Array(digest));
    const createdAt = new Date().toISOString();
    await ctx.runMutation(internal.routerGateway.setGatewayCredential, {
      workspaceId: args.workspaceId,
      tokenHash,
      createdAt,
    });
    return { token, createdAt };
  },
});

export const setGatewayCredential = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    tokenHash: v.string(),
    createdAt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await requireWorkspaceRole(
      ctx,
      args.workspaceId,
      managerRoles,
    );
    if (!/^[a-f0-9]{64}$/.test(args.tokenHash)) {
      throw new ConvexError("Gateway credential hash is invalid");
    }
    const existing = await ctx.db
      .query("router_gateway_credentials")
      .withIndex("by_workspace", (index) =>
        index.eq("workspaceId", args.workspaceId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        tokenHash: args.tokenHash,
        createdBy: user._id,
        createdAt: args.createdAt,
      });
    } else {
      await ctx.db.insert("router_gateway_credentials", {
        workspaceId: args.workspaceId,
        tokenHash: args.tokenHash,
        createdBy: user._id,
        createdAt: args.createdAt,
      });
    }
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId,
      userId: user.tokenIdentifier,
      action: "rotate",
      resource: "router_gateway_credential",
      details: "Rotated the workspace router gateway credential",
      createdAt: args.createdAt,
    });
    return null;
  },
});

export const verifyGatewayCredential = internalQuery({
  args: { workspaceId: v.string(), tokenHash: v.string() },
  returns: v.union(v.id("workspaces"), v.null()),
  handler: async (ctx, args) => {
    const workspaceId = ctx.db.normalizeId("workspaces", args.workspaceId);
    if (!workspaceId || !/^[a-f0-9]{64}$/.test(args.tokenHash)) return null;
    const credential = await ctx.db
      .query("router_gateway_credentials")
      .withIndex("by_workspace", (index) =>
        index.eq("workspaceId", workspaceId),
      )
      .first();
    const workspace = await ctx.db.get(workspaceId);
    if (
      !workspace ||
      (workspace.platformStatus ?? "active") !== "active" ||
      (workspace.expiresAt !== undefined && workspace.expiresAt <= Date.now())
    ) {
      return null;
    }
    return credential?.tokenHash === args.tokenHash ? workspaceId : null;
  },
});

export const listOperations = query({
  args: {
    workspaceId: v.id("workspaces"),
    routerId: v.id("routers"),
  },
  returns: v.array(publicOperation),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, managerRoles);
    const router = await ctx.db.get(args.routerId);
    if (!router || router.workspaceId !== args.workspaceId) {
      throw new ConvexError("Router does not belong to this workspace");
    }
    const operations = await ctx.db
      .query("router_gateway_operations")
      .withIndex("by_workspace_and_router_and_created_at", (index) =>
        index.eq("workspaceId", args.workspaceId).eq("routerId", args.routerId),
      )
      .order("desc")
      .take(20);
    return operations.map(
      ({
        _id,
        _creationTime,
        routerId,
        setupId,
        operationType,
        targetSessionId,
        radiusServerAddress,
        routerTunnelAddress,
        nasIdentifier,
        status,
        attemptCount,
        createdAt,
        claimedAt,
        completedAt,
        detail,
      }) => ({
        _id,
        _creationTime,
        routerId,
        setupId,
        operationType,
        ...(targetSessionId === undefined ? {} : { targetSessionId }),
        ...(radiusServerAddress === undefined ? {} : { radiusServerAddress }),
        ...(routerTunnelAddress === undefined ? {} : { routerTunnelAddress }),
        ...(nasIdentifier === undefined ? {} : { nasIdentifier }),
        status,
        attemptCount,
        createdAt,
        ...(claimedAt === undefined ? {} : { claimedAt }),
        ...(completedAt === undefined ? {} : { completedAt }),
        ...(detail === undefined ? {} : { detail }),
      }),
    );
  },
});

export const enqueueManagementVerification = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    routerId: v.id("routers"),
    setupId: v.id("router_management_setups"),
  },
  returns: v.id("router_gateway_operations"),
  handler: async (ctx, args) => {
    const { user } = await requireWorkspaceRole(
      ctx,
      args.workspaceId,
      managerRoles,
    );
    const [router, setup] = await Promise.all([
      ctx.db.get(args.routerId),
      ctx.db.get(args.setupId),
    ]);
    if (!router || router.workspaceId !== args.workspaceId) {
      throw new ConvexError("Router does not belong to this workspace");
    }
    if (
      !setup ||
      setup.workspaceId !== args.workspaceId ||
      setup.routerId !== args.routerId
    ) {
      throw new ConvexError("Management setup does not belong to this router");
    }
    if (setup.status !== "operator_applied") {
      throw new ConvexError(
        "Mark the API-SSL setup as applied before requesting verification",
      );
    }
    const existing = await ctx.db
      .query("router_gateway_operations")
      .withIndex(
        "by_workspace_and_setup_and_operation_type_and_status",
        (index) =>
          index
            .eq("workspaceId", args.workspaceId)
            .eq("setupId", args.setupId)
            .eq("operationType", "verify_management")
            .eq("status", "pending"),
      )
      .first();
    const leased = await ctx.db
      .query("router_gateway_operations")
      .withIndex(
        "by_workspace_and_setup_and_operation_type_and_status",
        (index) =>
          index
            .eq("workspaceId", args.workspaceId)
            .eq("setupId", args.setupId)
            .eq("operationType", "verify_management")
            .eq("status", "leased"),
      )
      .first();
    if (existing) return existing._id;
    if (leased) return leased._id;

    const now = new Date().toISOString();
    const operationId = await ctx.db.insert("router_gateway_operations", {
      workspaceId: args.workspaceId,
      routerId: args.routerId,
      setupId: args.setupId,
      operationType: "verify_management",
      status: "pending",
      attemptCount: 0,
      createdBy: user._id,
      createdAt: now,
    });
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId,
      userId: user.tokenIdentifier,
      action: "enqueue",
      resource: "router_gateway_operation",
      resourceId: operationId,
      details: `Queued API-SSL connectivity verification for ${router.name}`,
      createdAt: now,
    });
    return operationId;
  },
});

export const configureRadius = action({
  args: {
    workspaceId: v.id("workspaces"),
    routerId: v.id("routers"),
    setupId: v.id("router_management_setups"),
    radiusSecret: v.optional(v.string()),
  },
  returns: v.id("router_gateway_operations"),
  handler: async (ctx, args) => {
    if (
      args.radiusSecret !== undefined &&
      !/^[a-f0-9]{64}$/.test(args.radiusSecret)
    ) {
      throw new ConvexError("Enter the 64-character RADIUS shared secret");
    }
    const encryptionKey = env.PPPOE_CREDENTIAL_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new ConvexError(
        "RADIUS secret storage is not configured; set PPPOE_CREDENTIAL_ENCRYPTION_KEY on the server",
      );
    }
    const secretDetails =
      args.radiusSecret === undefined
        ? {}
        : await (async (radiusSecret: string) => {
            const digest = await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(radiusSecret),
            );
            const encryptedSecret = await encryptSubscriberPassword(
              radiusSecret,
              encryptionKey,
            );
            return {
              radiusSecretHash: toHex(new Uint8Array(digest)),
              radiusSecretCiphertext: encryptedSecret.ciphertext,
              radiusSecretIv: encryptedSecret.iv,
            };
          })(args.radiusSecret);
    const operationId: Id<"router_gateway_operations"> = await ctx.runMutation(
      internal.routerGateway.enqueueRadiusConfiguration,
      {
        workspaceId: args.workspaceId,
        routerId: args.routerId,
        setupId: args.setupId,
        ...secretDetails,
      },
    );
    return operationId;
  },
});

export const enqueueRadiusConfiguration = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    routerId: v.id("routers"),
    setupId: v.id("router_management_setups"),
    radiusSecretHash: v.optional(v.string()),
    radiusSecretCiphertext: v.optional(v.string()),
    radiusSecretIv: v.optional(v.string()),
  },
  returns: v.id("router_gateway_operations"),
  handler: async (ctx, args) => {
    const { user } = await requireWorkspaceRole(
      ctx,
      args.workspaceId,
      managerRoles,
    );
    const [router, setup, gatewayCredential] = await Promise.all([
      ctx.db.get(args.routerId),
      ctx.db.get(args.setupId),
      ctx.db
        .query("router_gateway_credentials")
        .withIndex("by_workspace", (index) =>
          index.eq("workspaceId", args.workspaceId),
        )
        .first(),
    ]);
    if (!router || router.workspaceId !== args.workspaceId) {
      throw new ConvexError("Router does not belong to this workspace");
    }
    const suppliedSecretFields = [
      args.radiusSecretHash,
      args.radiusSecretCiphertext,
      args.radiusSecretIv,
    ];
    if (
      suppliedSecretFields.some((field) => field !== undefined) &&
      suppliedSecretFields.some((field) => field === undefined)
    ) {
      throw new ConvexError("Encrypted RADIUS secret data is incomplete");
    }
    if (
      args.radiusSecretHash !== undefined &&
      !/^[a-f0-9]{64}$/.test(args.radiusSecretHash)
    ) {
      throw new ConvexError("RADIUS shared secret hash is invalid");
    }
    const radiusSecretHash = args.radiusSecretHash ?? router.radiusSecretHash;
    const radiusSecretCiphertext =
      args.radiusSecretCiphertext ?? router.radiusSecretCiphertext;
    const radiusSecretIv = args.radiusSecretIv ?? router.radiusSecretIv;
    if (!radiusSecretHash || !radiusSecretCiphertext || !radiusSecretIv) {
      throw new ConvexError(
        "This router has no saved RADIUS secret. Paste the current FreeRADIUS shared secret to continue.",
      );
    }
    if (
      !setup ||
      setup.workspaceId !== args.workspaceId ||
      setup.routerId !== args.routerId ||
      setup.status !== "operator_applied"
    ) {
      throw new ConvexError(
        "Verify an applied API-SSL setup before configuring RADIUS",
      );
    }
    if (!gatewayCredential) {
      throw new ConvexError(
        "Configure the Ubuntu gateway before applying RADIUS",
      );
    }
    const verifiedSetup = await ctx.db
      .query("router_gateway_operations")
      .withIndex(
        "by_workspace_and_setup_and_operation_type_and_status",
        (index) =>
          index
            .eq("workspaceId", args.workspaceId)
            .eq("setupId", args.setupId)
            .eq("operationType", "verify_management")
            .eq("status", "succeeded"),
      )
      .first();
    if (!verifiedSetup) {
      throw new ConvexError(
        "Verify the live API-SSL connection before configuring RADIUS",
      );
    }
    if (!router.tunnelIp) {
      throw new ConvexError(
        "Save the router tunnel address before applying RADIUS",
      );
    }
    if (!/^astrid-[a-f0-9]{32}$/.test(router.nasIdentifier)) {
      throw new ConvexError(
        "Router does not have a registered Astrid NAS-Identifier",
      );
    }
    const radiusServerAddress = setup.gatewaySourceAddress.split("/")[0];
    const routerTunnelAddress = router.tunnelIp.split("/")[0];
    const isIpv4 = (value: string) => {
      const octets = value.split(".");
      return (
        octets.length === 4 &&
        octets.every(
          (octet) =>
            /^\d{1,3}$/.test(octet) &&
            Number(octet) >= 0 &&
            Number(octet) <= 255,
        )
      );
    };
    if (!isIpv4(radiusServerAddress) || !isIpv4(routerTunnelAddress)) {
      throw new ConvexError("Router and RADIUS server addresses must be IPv4");
    }

    await ctx.db.patch(router._id, {
      radiusSecretHash,
      radiusSecretCiphertext,
      radiusSecretIv,
      radiusSecret: undefined,
    });
    const byStatus = (status: "pending" | "leased") =>
      ctx.db
        .query("router_gateway_operations")
        .withIndex(
          "by_workspace_and_setup_and_operation_type_and_status",
          (index) =>
            index
              .eq("workspaceId", args.workspaceId)
              .eq("setupId", args.setupId)
              .eq("operationType", "configure_radius")
              .eq("status", status),
        )
        .first();
    const [pending, leased] = await Promise.all([
      byStatus("pending"),
      byStatus("leased"),
    ]);
    if (pending) return pending._id;
    if (leased) return leased._id;

    const now = new Date().toISOString();
    const operationId = await ctx.db.insert("router_gateway_operations", {
      workspaceId: args.workspaceId,
      routerId: args.routerId,
      setupId: args.setupId,
      operationType: "configure_radius",
      radiusServerAddress,
      routerTunnelAddress,
      nasIdentifier: router.nasIdentifier,
      status: "pending",
      attemptCount: 0,
      createdBy: user._id,
      createdAt: now,
    });
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId,
      userId: user.tokenIdentifier,
      action: "enqueue",
      resource: "router_gateway_operation",
      resourceId: operationId,
      details: `Queued RADIUS provisioning for ${router.name}`,
      createdAt: now,
    });
    return operationId;
  },
});

export const claimNextOperation = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    claimTokenHash: v.string(),
  },
  returns: v.union(claimedOperation, v.null()),
  handler: async (
    ctx,
    args,
  ): Promise<{
    operationId: Id<"router_gateway_operations">;
    routerId: Id<"routers">;
    operationType:
      "verify_management" | "disconnect_ppp_session" | "configure_radius";
    managementAddress: string;
    gatewaySourceAddress: string;
    apiPort: 8729;
    apiUsername: string;
    certificateName: string;
    targetSessionId?: string;
    targetUsername?: string;
    radiusServerAddress?: string;
    routerTunnelAddress?: string;
    nasIdentifier?: string;
    radiusSecretCiphertext?: string;
    radiusSecretIv?: string;
  } | null> => {
    if (!/^[a-f0-9]{64}$/.test(args.claimTokenHash)) {
      throw new ConvexError("Operation lease token hash is invalid");
    }
    const now = Date.now();
    const expired = await ctx.db
      .query("router_gateway_operations")
      .withIndex("by_workspace_and_status_and_lease_expiry", (index) =>
        index
          .eq("workspaceId", args.workspaceId)
          .eq("status", "leased")
          .lte("leaseExpiresAt", now),
      )
      .take(20);
    for (const operation of expired) {
      await ctx.db.patch(operation._id, {
        status: "pending",
        claimTokenHash: undefined,
        leaseExpiresAt: undefined,
        claimedAt: undefined,
      });
    }

    const disconnect = await ctx.db
      .query("router_gateway_operations")
      .withIndex(
        "by_workspace_and_operation_type_and_status_and_created_at",
        (index) =>
          index
            .eq("workspaceId", args.workspaceId)
            .eq("operationType", "disconnect_ppp_session")
            .eq("status", "pending"),
      )
      .order("asc")
      .first();
    const operation =
      disconnect ??
      (await ctx.db
        .query("router_gateway_operations")
        .withIndex("by_workspace_and_status_and_created_at", (index) =>
          index.eq("workspaceId", args.workspaceId).eq("status", "pending"),
        )
        .order("asc")
        .first());
    if (!operation) return null;
    const setup = await ctx.db.get(operation.setupId);
    const router = await ctx.db.get(operation.routerId);
    if (
      !setup ||
      setup.workspaceId !== args.workspaceId ||
      setup.routerId !== operation.routerId ||
      setup.status !== "operator_applied" ||
      !router ||
      router.workspaceId !== args.workspaceId
    ) {
      await ctx.db.patch(operation._id, {
        status: "failed",
        completedAt: new Date(now).toISOString(),
        detail: "Router or applied management setup is unavailable",
      });
      return null;
    }
    if (
      operation.operationType === "configure_radius" &&
      (!operation.radiusServerAddress ||
        !operation.routerTunnelAddress ||
        !operation.nasIdentifier ||
        !router.radiusSecretCiphertext ||
        !router.radiusSecretIv)
    ) {
      await ctx.db.patch(operation._id, {
        status: "failed",
        completedAt: new Date(now).toISOString(),
        detail: "RADIUS settings or encrypted shared secret are missing",
      });
      return null;
    }

    await ctx.db.patch(operation._id, {
      status: "leased",
      attemptCount: operation.attemptCount + 1,
      claimedAt: new Date(now).toISOString(),
      leaseExpiresAt: now + leaseDurationMs,
      claimTokenHash: args.claimTokenHash,
    });
    return {
      operationId: operation._id,
      routerId: router._id,
      operationType: operation.operationType,
      managementAddress: setup.managementAddress,
      gatewaySourceAddress: setup.gatewaySourceAddress,
      apiPort: setup.apiPort,
      apiUsername: setup.apiUsername,
      certificateName: setup.certificateName,
      ...(operation.targetSessionId === undefined
        ? {}
        : { targetSessionId: operation.targetSessionId }),
      ...(operation.targetUsername === undefined
        ? {}
        : { targetUsername: operation.targetUsername }),
      ...(operation.radiusServerAddress === undefined
        ? {}
        : { radiusServerAddress: operation.radiusServerAddress }),
      ...(operation.routerTunnelAddress === undefined
        ? {}
        : { routerTunnelAddress: operation.routerTunnelAddress }),
      ...(operation.nasIdentifier === undefined
        ? {}
        : { nasIdentifier: operation.nasIdentifier }),
      ...(operation.operationType !== "configure_radius"
        ? {}
        : {
            radiusSecretCiphertext: router.radiusSecretCiphertext,
            radiusSecretIv: router.radiusSecretIv,
          }),
    };
  },
});

export const completeOperation = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    operationId: v.string(),
    claimTokenHash: v.string(),
    status: v.union(v.literal("succeeded"), v.literal("failed")),
    detail: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const operationId = ctx.db.normalizeId(
      "router_gateway_operations",
      args.operationId,
    );
    if (
      !operationId ||
      !/^[a-f0-9]{64}$/.test(args.claimTokenHash) ||
      (args.detail !== undefined && args.detail.length > 500)
    ) {
      return false;
    }
    const operation = await ctx.db.get(operationId);
    if (
      !operation ||
      operation.workspaceId !== args.workspaceId ||
      operation.status !== "leased" ||
      operation.claimTokenHash !== args.claimTokenHash ||
      (operation.leaseExpiresAt ?? 0) <= Date.now()
    ) {
      return false;
    }
    const detail =
      args.detail === undefined ? undefined : sanitizeDetail(args.detail);
    const retryDisconnect =
      args.status === "failed" &&
      operation.operationType === "disconnect_ppp_session" &&
      operation.attemptCount < maxDisconnectAttempts;
    await ctx.db.patch(operationId, {
      status: retryDisconnect ? "pending" : args.status,
      completedAt: retryDisconnect ? undefined : new Date().toISOString(),
      claimTokenHash: undefined,
      leaseExpiresAt: undefined,
      ...(retryDisconnect ? { claimedAt: undefined } : {}),
      ...(detail ? { detail } : {}),
    });
    const targetSessionId = operation.targetSessionId;
    if (
      args.status === "succeeded" &&
      operation.operationType === "disconnect_ppp_session" &&
      targetSessionId
    ) {
      const session = await ctx.db
        .query("router_sessions")
        .withIndex("by_workspace_and_router_and_session_id", (index) =>
          index
            .eq("workspaceId", args.workspaceId)
            .eq("routerId", operation.routerId)
            .eq("sessionId", targetSessionId),
        )
        .first();
      if (session && session.status !== "stopped") {
        const stopTime = new Date().toISOString();
        await ctx.db.patch(session._id, {
          status: "stopped",
          stopTime,
          terminateCause: "Service-Expired",
        });
        const subscriberId = session.subscriberId;
        if (subscriberId) {
          const [active, interim] = await Promise.all([
            ctx.db
              .query("router_sessions")
              .withIndex("by_workspace_and_subscriber_and_status", (index) =>
                index
                  .eq("workspaceId", args.workspaceId)
                  .eq("subscriberId", subscriberId)
                  .eq("status", "active"),
              )
              .first(),
            ctx.db
              .query("router_sessions")
              .withIndex("by_workspace_and_subscriber_and_status", (index) =>
                index
                  .eq("workspaceId", args.workspaceId)
                  .eq("subscriberId", subscriberId)
                  .eq("status", "interim"),
              )
              .first(),
          ]);
          const subscriber = await ctx.db.get(subscriberId);
          if (subscriber?.workspaceId === args.workspaceId) {
            await ctx.db.patch(subscriberId, {
              isOnline:
                Boolean(active || interim) &&
                isSubscriberServiceAvailable(subscriber),
            });
          }
        }
      }
    }
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId,
      userId: "router-gateway",
      action:
        args.status === "succeeded" ? "gateway_success" : "gateway_failure",
      resource: "router_gateway_operation",
      resourceId: operationId,
      details: retryDisconnect
        ? "Router gateway failed to disconnect a PPPoE session; operation will be retried"
        : "Router gateway reported an operation result",
      createdAt: new Date().toISOString(),
    });
    return true;
  },
});
