import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(
      v.union(v.literal("admin"), v.literal("staff"), v.literal("operator")),
    ),
    avatar: v.optional(v.string()),
    companyName: v.optional(v.string()),
  }).index("by_token", ["tokenIdentifier"]),

  workspaces: defineTable({
    name: v.string(),
    createdBy: v.id("users"),
    createdAt: v.string(),
    platformStatus: v.optional(
      v.union(
        v.literal("active"),
        v.literal("suspended"),
        v.literal("archived"),
        v.literal("expired"),
        v.literal("deleting"),
      ),
    ),
    platformStatusUpdatedAt: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    deletionPending: v.optional(v.boolean()),
  }).index("by_creator", ["createdBy"]),

  workspace_members: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("billing"),
      v.literal("network"),
      v.literal("read_only"),
    ),
    joinedAt: v.string(),
    platformAccessSuspended: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_user", ["workspaceId", "userId"]),

  workspace_invitations: defineTable({
    workspaceId: v.id("workspaces"),
    email: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("billing"),
      v.literal("network"),
      v.literal("read_only"),
    ),
    tokenHash: v.string(),
    invitedBy: v.id("users"),
    expiresAt: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("revoked"),
    ),
    createdAt: v.string(),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_email", ["workspaceId", "email"])
    .index("by_workspace_and_status", ["workspaceId", "status"]),

  workspace_creation_requests: defineTable({
    requesterUserId: v.id("users"),
    name: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    createdAt: v.string(),
    reviewedAt: v.optional(v.string()),
    reviewedBy: v.optional(v.id("users")),
    workspaceId: v.optional(v.id("workspaces")),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_requester", ["requesterUserId"])
    .index("by_requester_and_status", ["requesterUserId", "status"])
    .index("by_status_and_created_at", ["status", "createdAt"]),

  subscribers: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("expired"),
      v.literal("pending"),
    ),
    connectionType: v.union(
      v.literal("pppoe"),
      v.literal("hotspot"),
      v.literal("static"),
    ),
    packageId: v.optional(v.id("packages")),
    ipAddress: v.optional(v.string()),
    macAddress: v.optional(v.string()),
    monthlyFee: v.number(),
    balance: v.number(),
    isOnline: v.boolean(),
    lastSeen: v.optional(v.string()),
    serviceExpiresAt: v.optional(v.string()),
    notes: v.optional(v.string()),
    address: v.optional(v.string()),
    // Service credentials for RADIUS authentication
    pppoeUsername: v.optional(v.string()),
    pppoePassword: v.optional(v.string()),
    pppoePasswordCiphertext: v.optional(v.string()),
    pppoePasswordIv: v.optional(v.string()),
    hotspotUsername: v.optional(v.string()),
    hotspotPassword: v.optional(v.string()),
    hotspotPasswordCiphertext: v.optional(v.string()),
    hotspotPasswordIv: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_connection_type", ["connectionType"])
    .index("by_is_online", ["isOnline"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_status", ["workspaceId", "status"])
    .index("by_workspace_and_connection_type", [
      "workspaceId",
      "connectionType",
    ])
    .index("by_workspace_and_package", ["workspaceId", "packageId"])
    .index("by_pppoe_username", ["pppoeUsername"])
    .index("by_workspace_and_pppoe_username", ["workspaceId", "pppoeUsername"])
    .index("by_hotspot_username", ["hotspotUsername"])
    .index("by_workspace_and_hotspot_username", [
      "workspaceId",
      "hotspotUsername",
    ]),

  packages: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    speed: v.string(),
    price: v.number(),
    type: v.union(
      v.literal("pppoe"),
      v.literal("hotspot"),
      v.literal("static"),
    ),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    downloadSpeed: v.number(),
    uploadSpeed: v.number(),
    createdAt: v.string(),
  })
    .index("by_type", ["type"])
    .index("by_is_active", ["isActive"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_type", ["workspaceId", "type"])
    .index("by_workspace_and_is_active", ["workspaceId", "isActive"]),

  invoices: defineTable({
    workspaceId: v.id("workspaces"),
    subscriberId: v.id("subscribers"),
    amount: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("overdue"),
      v.literal("cancelled"),
    ),
    dueDate: v.string(),
    paidDate: v.optional(v.string()),
    description: v.string(),
    invoiceNumber: v.string(),
    createdAt: v.string(),
  })
    .index("by_subscriber", ["subscriberId"])
    .index("by_status", ["status"])
    .index("by_due_date", ["dueDate"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_subscriber", ["workspaceId", "subscriberId"])
    .index("by_workspace_and_status", ["workspaceId", "status"])
    .index("by_workspace_and_due_date", ["workspaceId", "dueDate"])
    .index("by_workspace_and_subscriber_and_status", [
      "workspaceId",
      "subscriberId",
      "status",
    ])
    .index("by_workspace_and_status_and_due_date", [
      "workspaceId",
      "status",
      "dueDate",
    ]),

  transactions: defineTable({
    workspaceId: v.id("workspaces"),
    subscriberId: v.optional(v.id("subscribers")),
    invoiceId: v.optional(v.id("invoices")),
    amount: v.number(),
    type: v.union(
      v.literal("payment"),
      v.literal("refund"),
      v.literal("credit"),
      v.literal("debit"),
    ),
    method: v.union(
      v.literal("mpesa"),
      v.literal("cash"),
      v.literal("bank"),
      v.literal("card"),
      v.literal("paypal"),
    ),
    reference: v.optional(v.string()),
    status: v.union(
      v.literal("completed"),
      v.literal("pending"),
      v.literal("failed"),
    ),
    notes: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_subscriber", ["subscriberId"])
    .index("by_status", ["status"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_subscriber", ["workspaceId", "subscriberId"])
    .index("by_workspace_and_status", ["workspaceId", "status"])
    .index("by_workspace_and_invoice", ["workspaceId", "invoiceId"]),

  tickets: defineTable({
    workspaceId: v.id("workspaces"),
    subscriberId: v.optional(v.id("subscribers")),
    title: v.string(),
    description: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("resolved"),
      v.literal("closed"),
    ),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical"),
    ),
    category: v.union(
      v.literal("connectivity"),
      v.literal("billing"),
      v.literal("hardware"),
      v.literal("other"),
    ),
    assignedTo: v.optional(v.string()),
    resolvedAt: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_priority", ["priority"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_status", ["workspaceId", "status"])
    .index("by_workspace_and_subscriber", ["workspaceId", "subscriberId"]),

  sms_logs: defineTable({
    workspaceId: v.id("workspaces"),
    recipient: v.string(),
    message: v.string(),
    status: v.union(
      v.literal("sent"),
      v.literal("failed"),
      v.literal("pending"),
    ),
    type: v.union(
      v.literal("invoice"),
      v.literal("reminder"),
      v.literal("custom"),
      v.literal("system"),
    ),
    subscriberId: v.optional(v.id("subscribers")),
    cost: v.optional(v.number()),
    sentAt: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_status", ["workspaceId", "status"])
    .index("by_workspace_and_sent_at", ["workspaceId", "sentAt"])
    .index("by_workspace_and_subscriber", ["workspaceId", "subscriberId"]),

  notifications: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    title: v.string(),
    message: v.string(),
    type: v.union(
      v.literal("info"),
      v.literal("success"),
      v.literal("warning"),
      v.literal("error"),
    ),
    read: v.boolean(),
    link: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_read", ["userId", "read"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_user", ["workspaceId", "userId"])
    .index("by_workspace_and_user_and_read", ["workspaceId", "userId", "read"]),

  account_alerts: defineTable({
    userTokenIdentifier: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    workspaceName: v.string(),
    title: v.string(),
    message: v.string(),
    type: v.union(
      v.literal("info"),
      v.literal("success"),
      v.literal("warning"),
      v.literal("error"),
    ),
    read: v.boolean(),
    createdAt: v.string(),
  })
    .index("by_user", ["userTokenIdentifier"])
    .index("by_user_and_read", ["userTokenIdentifier", "read"])
    .index("by_workspace", ["workspaceId"]),

  workspace_deletion_jobs: defineTable({
    workspaceId: v.id("workspaces"),
    startedBy: v.string(),
    tableIndex: v.number(),
    createdAt: v.string(),
  }).index("by_workspace", ["workspaceId"]),

  audit_logs: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    userId: v.string(),
    action: v.string(),
    resource: v.string(),
    resourceId: v.optional(v.string()),
    details: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_created_at", ["workspaceId", "createdAt"]),

  network_devices: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    type: v.union(
      v.literal("router"),
      v.literal("switch"),
      v.literal("access_point"),
      v.literal("server"),
      v.literal("other"),
    ),
    ipAddress: v.string(),
    status: v.union(
      v.literal("online"),
      v.literal("offline"),
      v.literal("maintenance"),
    ),
    location: v.optional(v.string()),
    lastSeen: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_status", ["workspaceId", "status"]),

  // MikroTik routers managed via WireGuard tunnel
  routers: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    normalizedName: v.optional(v.string()),
    // WireGuard config
    publicKey: v.string(),
    privateKey: v.optional(v.string()),
    presharedKey: v.optional(v.string()),
    // Addressing
    tunnelIp: v.optional(v.string()), // e.g. 10.200.0.2/32 — peer tunnel IP
    serverPublicKey: v.optional(v.string()), // billing-server WireGuard public key
    serverEndpoint: v.optional(v.string()), // e.g. billing.example.com:51820
    serverTunnelIp: v.optional(v.string()), // e.g. 10.200.0.1/32
    allowedIPs: v.optional(v.string()), // e.g. 0.0.0.0/0 or specific subnets
    dns: v.optional(v.string()),
    // Device info
    ipAddress: v.optional(v.string()), // LAN IP of router
    location: v.optional(v.string()),
    model: v.optional(v.string()), // e.g. RB750Gr3
    status: v.union(
      v.literal("online"),
      v.literal("offline"),
      v.literal("unknown"),
    ),
    lastSeen: v.optional(v.string()),
    notes: v.optional(v.string()),
    // RADIUS / billing link
    radiusSecret: v.optional(v.string()),
    radiusSecretHash: v.optional(v.string()),
    radiusSecretCiphertext: v.optional(v.string()),
    radiusSecretIv: v.optional(v.string()),
    nasIdentifier: v.string(), // NAS-Identifier sent by this router
    // RouterOS version — drives provisioning script syntax
    routerOsVersion: v.optional(v.union(v.literal("v6"), v.literal("v7"))),
    createdAt: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_public_key", ["publicKey"])
    .index("by_nas_identifier", ["nasIdentifier"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_name", ["workspaceId", "name"])
    .index("by_workspace_and_normalized_name", [
      "workspaceId",
      "normalizedName",
    ])
    .index("by_workspace_and_status", ["workspaceId", "status"])
    .index("by_workspace_and_nas_identifier", ["workspaceId", "nasIdentifier"]),

  router_management_setups: defineTable({
    workspaceId: v.id("workspaces"),
    routerId: v.id("routers"),
    managementAddress: v.string(),
    gatewaySourceAddress: v.string(),
    apiPort: v.literal(8729),
    apiUsername: v.string(),
    certificateName: v.string(),
    scriptVersion: v.literal("routeros-v7-api-ssl-v1"),
    scriptSha256: v.string(),
    status: v.union(v.literal("prepared"), v.literal("operator_applied")),
    createdBy: v.id("users"),
    createdAt: v.string(),
    operatorAppliedAt: v.optional(v.string()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_router", ["workspaceId", "routerId"])
    .index("by_workspace_and_status", ["workspaceId", "status"]),

  router_api_ssl_progress: defineTable({
    workspaceId: v.id("workspaces"),
    routerId: v.id("routers"),
    activeStep: v.number(),
    gatewayReady: v.boolean(),
    gatewayConfigSaved: v.boolean(),
    activeSetupId: v.optional(v.id("router_management_setups")),
    setupResetAt: v.optional(v.string()),
    verificationResetAt: v.optional(v.string()),
    updatedAt: v.string(),
  }).index("by_workspace_and_router", ["workspaceId", "routerId"]),

  router_gateway_credentials: defineTable({
    workspaceId: v.id("workspaces"),
    tokenHash: v.string(),
    createdBy: v.id("users"),
    createdAt: v.string(),
  }).index("by_workspace", ["workspaceId"]),

  router_gateway_operations: defineTable({
    workspaceId: v.id("workspaces"),
    routerId: v.id("routers"),
    setupId: v.id("router_management_setups"),
    operationType: v.union(
      v.literal("verify_management"),
      v.literal("disconnect_ppp_session"),
      v.literal("configure_radius"),
    ),
    connectionType: v.optional(
      v.union(v.literal("pppoe"), v.literal("hotspot")),
    ),
    radiusServerAddress: v.optional(v.string()),
    routerTunnelAddress: v.optional(v.string()),
    nasIdentifier: v.optional(v.string()),
    targetSessionId: v.optional(v.string()),
    targetUsername: v.optional(v.string()),
    serviceExpiryAt: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("leased"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    attemptCount: v.number(),
    createdBy: v.optional(v.id("users")),
    createdAt: v.string(),
    claimedAt: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    claimTokenHash: v.optional(v.string()),
    completedAt: v.optional(v.string()),
    detail: v.optional(v.string()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_router_and_created_at", [
      "workspaceId",
      "routerId",
      "createdAt",
    ])
    .index("by_workspace_and_setup_and_status", [
      "workspaceId",
      "setupId",
      "status",
    ])
    .index("by_workspace_and_setup_and_operation_type_and_status", [
      "workspaceId",
      "setupId",
      "operationType",
      "status",
    ])
    .index("by_ws_router_op_session_expiry", [
      "workspaceId",
      "routerId",
      "operationType",
      "targetSessionId",
      "serviceExpiryAt",
    ])
    .index("by_ws_router_op_session", [
      "workspaceId",
      "routerId",
      "operationType",
      "targetSessionId",
    ])
    .index("by_workspace_and_status_and_created_at", [
      "workspaceId",
      "status",
      "createdAt",
    ])
    .index("by_workspace_and_operation_type_and_status_and_created_at", [
      "workspaceId",
      "operationType",
      "status",
      "createdAt",
    ])
    .index("by_workspace_and_status_and_lease_expiry", [
      "workspaceId",
      "status",
      "leaseExpiresAt",
    ]),

  router_enrollments: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    normalizedName: v.string(),
    location: v.optional(v.string()),
    model: v.optional(v.string()),
    routerOsVersion: v.literal("v7"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("expired"),
      v.literal("revoked"),
      v.literal("redeemed"),
    ),
    createdAt: v.string(),
    createdBy: v.id("users"),
    routerPublicKey: v.optional(v.string()),
    routerId: v.optional(v.id("routers")),
    redeemedAt: v.optional(v.string()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_workspace", ["workspaceId"])
    .index("by_router_public_key", ["routerPublicKey"])
    .index("by_workspace_and_name_and_status_and_expiry", [
      "workspaceId",
      "normalizedName",
      "status",
      "expiresAt",
    ]),

  // PPPoE / Hotspot sessions reported via RADIUS accounting
  router_sessions: defineTable({
    workspaceId: v.id("workspaces"),
    routerId: v.optional(v.id("routers")),
    subscriberId: v.optional(v.id("subscribers")),
    username: v.string(),
    nasIdentifier: v.string(),
    nasIpAddress: v.optional(v.string()),
    framedIpAddress: v.optional(v.string()),
    calledStationId: v.optional(v.string()),
    callingStationId: v.optional(v.string()),
    sessionId: v.string(),
    // timing
    startTime: v.string(),
    stopTime: v.optional(v.string()),
    sessionTime: v.optional(v.number()), // seconds
    // traffic
    inputOctets: v.optional(v.number()),
    outputOctets: v.optional(v.number()),
    inputGigawords: v.optional(v.number()),
    outputGigawords: v.optional(v.number()),
    // status
    status: v.union(
      v.literal("active"),
      v.literal("stopped"),
      v.literal("interim"),
    ),
    terminateCause: v.optional(v.string()),
    connectionType: v.union(
      v.literal("pppoe"),
      v.literal("hotspot"),
      v.literal("static"),
    ),
    createdAt: v.string(),
  })
    .index("by_router", ["routerId"])
    .index("by_subscriber", ["subscriberId"])
    .index("by_session_id", ["sessionId"])
    .index("by_username", ["username"])
    .index("by_status", ["status"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_router", ["workspaceId", "routerId"])
    .index("by_workspace_and_router_and_status", [
      "workspaceId",
      "routerId",
      "status",
    ])
    .index("by_workspace_and_subscriber_and_status", [
      "workspaceId",
      "subscriberId",
      "status",
    ])
    .index("by_workspace_and_router_and_session_id", [
      "workspaceId",
      "routerId",
      "sessionId",
    ])
    .index("by_workspace_and_session_id", ["workspaceId", "sessionId"])
    .index("by_workspace_and_status", ["workspaceId", "status"])
    .index("by_workspace_and_start_time", ["workspaceId", "startTime"]),

  // RADIUS auth/acct request log for debugging
  radius_logs: defineTable({
    workspaceId: v.id("workspaces"),
    routerId: v.optional(v.id("routers")),
    type: v.union(
      v.literal("authorize"),
      v.literal("authenticate"),
      v.literal("accounting"),
    ),
    username: v.string(),
    nasIdentifier: v.optional(v.string()),
    nasIpAddress: v.optional(v.string()),
    requestAttrs: v.optional(v.string()), // JSON string
    responseCode: v.union(
      v.literal("accept"),
      v.literal("reject"),
      v.literal("error"),
    ),
    responseAttrs: v.optional(v.string()), // JSON string
    rejectReason: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_router", ["routerId"])
    .index("by_username", ["username"])
    .index("by_type", ["type"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_type", ["workspaceId", "type"])
    .index("by_workspace_and_type_and_response_code", [
      "workspaceId",
      "type",
      "responseCode",
    ])
    .index("by_workspace_and_created_at", ["workspaceId", "createdAt"]),
});
