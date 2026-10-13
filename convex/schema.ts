import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(v.union(v.literal("admin"), v.literal("staff"), v.literal("operator"))),
    avatar: v.optional(v.string()),
    companyName: v.optional(v.string()),
  }).index("by_token", ["tokenIdentifier"]),

  subscribers: defineTable({
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
    notes: v.optional(v.string()),
    address: v.optional(v.string()),
    // PPPoE / Hotspot credentials for RADIUS authentication
    pppoeUsername: v.optional(v.string()),
    pppoePassword: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_connection_type", ["connectionType"])
    .index("by_is_online", ["isOnline"]),

  packages: defineTable({
    name: v.string(),
    speed: v.string(),
    price: v.number(),
    type: v.union(v.literal("pppoe"), v.literal("hotspot"), v.literal("static")),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    downloadSpeed: v.number(),
    uploadSpeed: v.number(),
    createdAt: v.string(),
  })
    .index("by_type", ["type"])
    .index("by_is_active", ["isActive"]),

  invoices: defineTable({
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
    .index("by_due_date", ["dueDate"]),

  transactions: defineTable({
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
    status: v.union(v.literal("completed"), v.literal("pending"), v.literal("failed")),
    notes: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_subscriber", ["subscriberId"])
    .index("by_status", ["status"]),

  tickets: defineTable({
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
    .index("by_priority", ["priority"]),

  sms_logs: defineTable({
    recipient: v.string(),
    message: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed"), v.literal("pending")),
    type: v.union(
      v.literal("invoice"),
      v.literal("reminder"),
      v.literal("custom"),
      v.literal("system"),
    ),
    subscriberId: v.optional(v.id("subscribers")),
    cost: v.optional(v.number()),
    sentAt: v.string(),
  }).index("by_status", ["status"]),

  notifications: defineTable({
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
    .index("by_user_and_read", ["userId", "read"]),

  audit_logs: defineTable({
    userId: v.string(),
    action: v.string(),
    resource: v.string(),
    resourceId: v.optional(v.string()),
    details: v.optional(v.string()),
    createdAt: v.string(),
  }).index("by_user", ["userId"]),

  network_devices: defineTable({
    name: v.string(),
    type: v.union(
      v.literal("router"),
      v.literal("switch"),
      v.literal("access_point"),
      v.literal("server"),
      v.literal("other"),
    ),
    ipAddress: v.string(),
    status: v.union(v.literal("online"), v.literal("offline"), v.literal("maintenance")),
    location: v.optional(v.string()),
    lastSeen: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.string(),
  }).index("by_status", ["status"]),

  // MikroTik routers managed via WireGuard tunnel
  routers: defineTable({
    name: v.string(),
    // WireGuard config
    publicKey: v.string(),
    privateKey: v.string(), // stored encrypted; shown once
    presharedKey: v.optional(v.string()),
    // Addressing
    tunnelIp: v.string(),        // e.g. 10.200.0.2/32 — peer tunnel IP
    serverPublicKey: v.string(), // billing-server WireGuard public key
    serverEndpoint: v.string(),  // e.g. billing.example.com:51820
    serverTunnelIp: v.string(),  // e.g. 10.200.0.1/32
    allowedIPs: v.string(),      // e.g. 0.0.0.0/0 or specific subnets
    dns: v.optional(v.string()),
    // Device info
    ipAddress: v.optional(v.string()), // LAN IP of router
    location: v.optional(v.string()),
    model: v.optional(v.string()),     // e.g. RB750Gr3
    status: v.union(v.literal("online"), v.literal("offline"), v.literal("unknown")),
    lastSeen: v.optional(v.string()),
    notes: v.optional(v.string()),
    // RADIUS / billing link
    radiusSecret: v.string(),   // shared secret for this router ↔ RADIUS
    nasIdentifier: v.string(),  // NAS-Identifier sent by this router
    // RouterOS version — drives provisioning script syntax
    routerOsVersion: v.optional(v.union(v.literal("v6"), v.literal("v7"))),
    createdAt: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_nas_identifier", ["nasIdentifier"]),

  // PPPoE / Hotspot sessions reported via RADIUS accounting
  router_sessions: defineTable({
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
    sessionTime: v.optional(v.number()),     // seconds
    // traffic
    inputOctets: v.optional(v.number()),
    outputOctets: v.optional(v.number()),
    inputGigawords: v.optional(v.number()),
    outputGigawords: v.optional(v.number()),
    // status
    status: v.union(v.literal("active"), v.literal("stopped"), v.literal("interim")),
    terminateCause: v.optional(v.string()),
    connectionType: v.union(v.literal("pppoe"), v.literal("hotspot"), v.literal("static")),
    createdAt: v.string(),
  })
    .index("by_router", ["routerId"])
    .index("by_subscriber", ["subscriberId"])
    .index("by_session_id", ["sessionId"])
    .index("by_username", ["username"])
    .index("by_status", ["status"]),

  // RADIUS auth/acct request log for debugging
  radius_logs: defineTable({
    routerId: v.optional(v.id("routers")),
    type: v.union(v.literal("authorize"), v.literal("authenticate"), v.literal("accounting")),
    username: v.string(),
    nasIdentifier: v.optional(v.string()),
    nasIpAddress: v.optional(v.string()),
    requestAttrs: v.optional(v.string()),  // JSON string
    responseCode: v.union(v.literal("accept"), v.literal("reject"), v.literal("error")),
    responseAttrs: v.optional(v.string()), // JSON string
    rejectReason: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_router", ["routerId"])
    .index("by_username", ["username"])
    .index("by_type", ["type"]),
});
