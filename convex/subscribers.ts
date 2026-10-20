import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import {
  action,
  env,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { requireWorkspaceRole } from "./model/workspace";
import {
  getRadiusOnlineSubscriberIds,
  isSubscriberOnline,
  isSubscriberServiceAvailable,
} from "./model/subscriberPresence";
import {
  createInitialInvoice,
  initialInvoiceValidator,
} from "./model/initialInvoice";
import { encryptSubscriberPassword } from "./subscriberCredentials";
import { queueSubscriberPppoeDisconnects } from "./model/routerSessionDisconnect";

const readRoles = [
  "owner",
  "admin",
  "billing",
  "network",
  "read_only",
] as const;
const writeRoles = ["owner", "admin", "billing"] as const;
const subscriberDoc = schema
  .doc("subscribers")
  .omit(
    "pppoeUsername",
    "pppoePassword",
    "pppoePasswordCiphertext",
    "pppoePasswordIv",
    "hotspotUsername",
    "hotspotPassword",
    "hotspotPasswordCiphertext",
    "hotspotPasswordIv",
  );
const packageDoc = schema.doc("packages");
const invoiceDoc = schema.doc("invoices");
const transactionDoc = schema.doc("transactions");
const subscriberListDoc = subscriberDoc.extend({
  packageName: v.union(v.string(), v.null()),
  packageSpeed: v.union(v.string(), v.null()),
});
const subscriberDetails = subscriberDoc.extend({
  pppoeUsername: v.optional(v.string()),
  hotspotUsername: v.optional(v.string()),
  package: v.union(packageDoc, v.null()),
  invoices: v.array(invoiceDoc),
  transactions: v.array(transactionDoc),
});
const statusValidator = v.union(
  v.literal("active"),
  v.literal("suspended"),
  v.literal("expired"),
  v.literal("pending"),
);
const connectionTypeValidator = v.union(
  v.literal("pppoe"),
  v.literal("hotspot"),
  v.literal("static"),
);

async function hasActiveRadiusSession(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  subscriberId: Id<"subscribers">,
) {
  const [active, interim] = await Promise.all([
    ctx.db
      .query("router_sessions")
      .withIndex("by_workspace_and_subscriber_and_status", (index) =>
        index
          .eq("workspaceId", workspaceId)
          .eq("subscriberId", subscriberId)
          .eq("status", "active"),
      )
      .first(),
    ctx.db
      .query("router_sessions")
      .withIndex("by_workspace_and_subscriber_and_status", (index) =>
        index
          .eq("workspaceId", workspaceId)
          .eq("subscriberId", subscriberId)
          .eq("status", "interim"),
      )
      .first(),
  ]);
  return Boolean(active || interim);
}

function validateServiceCredentials(
  username: string,
  password: string,
  service: "PPPoE" | "Hotspot",
) {
  const normalizedUsername = username.trim();
  if (
    normalizedUsername.length < 1 ||
    normalizedUsername.length > 64 ||
    [...normalizedUsername].some((character) => character.charCodeAt(0) < 0x20)
  ) {
    throw new ConvexError(
      `${service} username must be 1-64 characters without control characters`,
    );
  }
  if (password.length < 8 || password.length > 128) {
    throw new ConvexError(
      `${service} password must be between 8 and 128 characters`,
    );
  }
  return normalizedUsername;
}

type SubscriberActivationFields = {
  workspaceId: Id<"workspaces">;
  connectionType: "pppoe" | "hotspot" | "static";
  packageId?: Id<"packages">;
  serviceExpiresAt?: string;
  pppoeUsername?: string;
  pppoePasswordCiphertext?: string;
  pppoePasswordIv?: string;
  hotspotUsername?: string;
  hotspotPasswordCiphertext?: string;
  hotspotPasswordIv?: string;
};

function normalizeServiceExpiry(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new ConvexError("Service expiry must be a valid date and time");
  }
  return new Date(timestamp).toISOString();
}

async function scheduleServiceExpiry(
  ctx: MutationCtx,
  subscriberId: Id<"subscribers">,
  serviceExpiresAt?: string,
) {
  if (!serviceExpiresAt) return;
  const normalizedExpiry = normalizeServiceExpiry(serviceExpiresAt);
  await ctx.scheduler.runAt(
    Date.parse(normalizedExpiry),
    internal.subscribers.expireService,
    { subscriberId, expectedExpiry: normalizedExpiry },
  );
}

async function markSubscriberExpired(
  ctx: MutationCtx,
  subscriber: Doc<"subscribers">,
) {
  if (subscriber.status !== "expired") {
    await ctx.db.insert("audit_logs", {
      workspaceId: subscriber.workspaceId,
      userId: "system:service-expiry",
      action: "expire_service",
      resource: "subscriber",
      resourceId: subscriber._id,
      details: "Subscriber service expired at its configured expiry time",
      createdAt: new Date().toISOString(),
    });
  }
  await ctx.db.patch(subscriber._id, { status: "expired", isOnline: false });
  await queueSubscriberPppoeDisconnects(
    ctx,
    subscriber,
    "Subscriber service expired",
    subscriber.serviceExpiresAt,
  );
}

async function assertSubscriberCanBeActivated(
  ctx: MutationCtx,
  subscriber: SubscriberActivationFields,
) {
  if (subscriber.serviceExpiresAt !== undefined) {
    const expiry = Date.parse(subscriber.serviceExpiresAt);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      throw new ConvexError(
        "Service has expired; renew the subscriber before restoring access",
      );
    }
  }
  if (subscriber.connectionType === "static") return;

  if (!subscriber.packageId) {
    throw new ConvexError(
      `A ${subscriber.connectionType} subscriber needs a service package before activation`,
    );
  }
  const pkg = await ctx.db.get(subscriber.packageId);
  if (
    !pkg ||
    pkg.workspaceId !== subscriber.workspaceId ||
    pkg.type !== subscriber.connectionType ||
    !pkg.isActive
  ) {
    throw new ConvexError(
      `Select an active ${subscriber.connectionType} package before activation`,
    );
  }

  const hasCredentials =
    subscriber.connectionType === "pppoe"
      ? Boolean(
          subscriber.pppoeUsername &&
          subscriber.pppoePasswordCiphertext &&
          subscriber.pppoePasswordIv,
        )
      : Boolean(
          subscriber.hotspotUsername &&
          subscriber.hotspotPasswordCiphertext &&
          subscriber.hotspotPasswordIv,
        );
  if (!hasCredentials) {
    throw new ConvexError(
      `Set encrypted ${subscriber.connectionType} credentials before activation`,
    );
  }
}

async function credentialUsernameInUse(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  username: string,
  excludeId?: Id<"subscribers">,
) {
  const [pppoe, hotspot] = await Promise.all([
    ctx.db
      .query("subscribers")
      .withIndex("by_workspace_and_pppoe_username", (index) =>
        index.eq("workspaceId", workspaceId).eq("pppoeUsername", username),
      )
      .first(),
    ctx.db
      .query("subscribers")
      .withIndex("by_workspace_and_hotspot_username", (index) =>
        index.eq("workspaceId", workspaceId).eq("hotspotUsername", username),
      )
      .first(),
  ]);
  return [pppoe, hotspot].some(
    (subscriber) => subscriber && subscriber._id !== excludeId,
  );
}

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.union(statusValidator, v.literal("all"))),
    connectionType: v.optional(
      v.union(connectionTypeValidator, v.literal("all")),
    ),
    search: v.optional(v.string()),
  },
  returns: paginationResultValidator(subscriberListDoc),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const page =
      args.status && args.status !== "all"
        ? await ctx.db
            .query("subscribers")
            .withIndex("by_workspace_and_status", (q) =>
              q
                .eq("workspaceId", args.workspaceId)
                .eq(
                  "status",
                  args.status as "active" | "suspended" | "expired" | "pending",
                ),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("subscribers")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", args.workspaceId),
            )
            .order("desc")
            .paginate(args.paginationOpts);
    const search = args.search?.toLowerCase();
    const filtered = page.page.filter((subscriber) => {
      if (
        args.connectionType &&
        args.connectionType !== "all" &&
        subscriber.connectionType !== args.connectionType
      )
        return false;
      return (
        !search ||
        subscriber.name.toLowerCase().includes(search) ||
        subscriber.phone.toLowerCase().includes(search) ||
        (subscriber.email?.toLowerCase().includes(search) ?? false) ||
        (subscriber.ipAddress?.toLowerCase().includes(search) ?? false)
      );
    });
    const enriched = await Promise.all(
      filtered.map(async (subscriber) => {
        const [pkg, sessionOnline] = await Promise.all([
          subscriber.packageId ? ctx.db.get(subscriber.packageId) : null,
          subscriber.connectionType === "static"
            ? Promise.resolve(false)
            : hasActiveRadiusSession(ctx, args.workspaceId, subscriber._id),
        ]);
        const safePackage = pkg?.workspaceId === args.workspaceId ? pkg : null;
        const {
          pppoeUsername: _username,
          pppoePassword: _password,
          pppoePasswordCiphertext: _ciphertext,
          pppoePasswordIv: _iv,
          hotspotUsername: _hotspotUsername,
          hotspotPassword: _hotspotPassword,
          hotspotPasswordCiphertext: _hotspotCiphertext,
          hotspotPasswordIv: _hotspotIv,
          ...safeSubscriber
        } = subscriber;
        return {
          ...safeSubscriber,
          isOnline:
            isSubscriberServiceAvailable(subscriber) &&
            (subscriber.connectionType === "static"
              ? subscriber.isOnline
              : sessionOnline),
          packageName: safePackage?.name ?? null,
          packageSpeed: safePackage?.speed ?? null,
        };
      }),
    );
    return { ...page, page: enriched };
  },
});

export const getById = query({
  args: { workspaceId: v.id("workspaces"), id: v.id("subscribers") },
  returns: v.union(subscriberDetails, v.null()),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const subscriber = await ctx.db.get(args.id);
    if (!subscriber || subscriber.workspaceId !== args.workspaceId) return null;
    const [pkg, invoices, transactions, sessionOnline] = await Promise.all([
      subscriber.packageId ? ctx.db.get(subscriber.packageId) : null,
      ctx.db
        .query("invoices")
        .withIndex("by_workspace_and_subscriber", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("subscriberId", args.id),
        )
        .order("desc")
        .take(5),
      ctx.db
        .query("transactions")
        .withIndex("by_workspace_and_subscriber", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("subscriberId", args.id),
        )
        .order("desc")
        .take(5),
      subscriber.connectionType === "static"
        ? Promise.resolve(
            subscriber.isOnline && isSubscriberServiceAvailable(subscriber),
          )
        : hasActiveRadiusSession(ctx, args.workspaceId, args.id),
    ]);
    const {
      pppoeUsername,
      pppoePassword: _password,
      pppoePasswordCiphertext: _ciphertext,
      pppoePasswordIv: _iv,
      hotspotUsername,
      hotspotPassword: _hotspotPassword,
      hotspotPasswordCiphertext: _hotspotCiphertext,
      hotspotPasswordIv: _hotspotIv,
      ...safeSubscriber
    } = subscriber;
    return {
      ...safeSubscriber,
      isOnline: sessionOnline && isSubscriberServiceAvailable(subscriber),
      ...(pppoeUsername === undefined ? {} : { pppoeUsername }),
      ...(hotspotUsername === undefined ? {} : { hotspotUsername }),
      package: pkg?.workspaceId === args.workspaceId ? pkg : null,
      invoices,
      transactions,
    };
  },
});

export const getPackages = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(packageDoc),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    return await ctx.db
      .query("packages")
      .withIndex("by_workspace_and_is_active", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("isActive", true),
      )
      .take(200);
  },
});

export const getStats = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    total: v.number(),
    active: v.number(),
    suspended: v.number(),
    expired: v.number(),
    pending: v.number(),
    online: v.number(),
    pppoe: v.number(),
    hotspot: v.number(),
    staticConn: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const [all, radiusOnlineSubscriberIds] = await Promise.all([
      ctx.db
        .query("subscribers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .take(8192),
      getRadiusOnlineSubscriberIds(ctx, args.workspaceId),
    ]);
    return {
      total: all.length,
      active: all.filter((s) => s.status === "active").length,
      suspended: all.filter((s) => s.status === "suspended").length,
      expired: all.filter((s) => s.status === "expired").length,
      pending: all.filter((s) => s.status === "pending").length,
      online: all.filter((subscriber) =>
        isSubscriberOnline(subscriber, radiusOnlineSubscriberIds),
      ).length,
      pppoe: all.filter((s) => s.connectionType === "pppoe").length,
      hotspot: all.filter((s) => s.connectionType === "hotspot").length,
      staticConn: all.filter((s) => s.connectionType === "static").length,
    };
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.string(),
    status: statusValidator,
    connectionType: v.literal("static"),
    packageId: v.optional(v.id("packages")),
    ipAddress: v.optional(v.string()),
    macAddress: v.optional(v.string()),
    monthlyFee: v.number(),
    balance: v.number(),
    serviceExpiresAt: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.id("subscribers"),
  handler: async (ctx, args): Promise<Id<"subscribers">> => {
    const { identity } = await requireWorkspaceRole(
      ctx,
      args.workspaceId,
      writeRoles,
    );
    if (args.packageId) {
      const pkg = await ctx.db.get(args.packageId);
      if (
        !pkg ||
        pkg.workspaceId !== args.workspaceId ||
        pkg.type !== args.connectionType
      ) {
        throw new ConvexError(
          "Select a package matching the subscriber connection type",
        );
      }
    }
    const id = await ctx.db.insert("subscribers", {
      ...args,
      ...(args.serviceExpiresAt === undefined
        ? {}
        : { serviceExpiresAt: normalizeServiceExpiry(args.serviceExpiresAt) }),
      isOnline: false,
      createdAt: new Date().toISOString(),
    });
    await scheduleServiceExpiry(ctx, id, args.serviceExpiresAt);
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId,
      userId: identity.tokenIdentifier,
      action: "create",
      resource: "subscriber",
      resourceId: id,
      details: `Created subscriber: ${args.name}`,
      createdAt: new Date().toISOString(),
    });
    return id;
  },
});

export const createPppoe = action({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.string(),
    status: statusValidator,
    packageId: v.optional(v.id("packages")),
    ipAddress: v.optional(v.string()),
    macAddress: v.optional(v.string()),
    monthlyFee: v.number(),
    balance: v.number(),
    serviceExpiresAt: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
    pppoeUsername: v.string(),
    pppoePassword: v.string(),
    initialInvoice: v.optional(initialInvoiceValidator),
  },
  returns: v.id("subscribers"),
  handler: async (ctx, args): Promise<Id<"subscribers">> => {
    const encryptionKey = env.PPPOE_CREDENTIAL_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new ConvexError(
        "Subscriber credential storage is not configured; set PPPOE_CREDENTIAL_ENCRYPTION_KEY on the server",
      );
    }
    const username = validateServiceCredentials(
      args.pppoeUsername,
      args.pppoePassword,
      "PPPoE",
    );
    const credential = await encryptSubscriberPassword(
      args.pppoePassword,
      encryptionKey,
    );
    const {
      pppoeUsername: _username,
      pppoePassword: _password,
      initialInvoice,
      ...subscriberFields
    } = args;
    const id: Id<"subscribers"> = await ctx.runMutation(
      internal.subscribers.createCredentialSubscriberInternal,
      {
        ...subscriberFields,
        connectionType: "pppoe",
        username,
        passwordCiphertext: credential.ciphertext,
        passwordIv: credential.iv,
        ...(initialInvoice ? { initialInvoice } : {}),
      },
    );
    return id;
  },
});

export const createHotspot = action({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.string(),
    status: statusValidator,
    packageId: v.optional(v.id("packages")),
    ipAddress: v.optional(v.string()),
    macAddress: v.optional(v.string()),
    monthlyFee: v.number(),
    balance: v.number(),
    serviceExpiresAt: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
    hotspotUsername: v.string(),
    hotspotPassword: v.string(),
    initialInvoice: v.optional(initialInvoiceValidator),
  },
  returns: v.id("subscribers"),
  handler: async (ctx, args): Promise<Id<"subscribers">> => {
    const encryptionKey = env.PPPOE_CREDENTIAL_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new ConvexError(
        "Subscriber credential storage is not configured; set PPPOE_CREDENTIAL_ENCRYPTION_KEY on the server",
      );
    }
    const username = validateServiceCredentials(
      args.hotspotUsername,
      args.hotspotPassword,
      "Hotspot",
    );
    const credential = await encryptSubscriberPassword(
      args.hotspotPassword,
      encryptionKey,
    );
    const {
      hotspotUsername: _username,
      hotspotPassword: _password,
      initialInvoice,
      ...subscriberFields
    } = args;
    const id: Id<"subscribers"> = await ctx.runMutation(
      internal.subscribers.createCredentialSubscriberInternal,
      {
        ...subscriberFields,
        connectionType: "hotspot",
        username,
        passwordCiphertext: credential.ciphertext,
        passwordIv: credential.iv,
        ...(initialInvoice ? { initialInvoice } : {}),
      },
    );
    return id;
  },
});

export const createCredentialSubscriberInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.string(),
    status: statusValidator,
    packageId: v.optional(v.id("packages")),
    ipAddress: v.optional(v.string()),
    macAddress: v.optional(v.string()),
    monthlyFee: v.number(),
    balance: v.number(),
    serviceExpiresAt: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
    connectionType: v.union(v.literal("pppoe"), v.literal("hotspot")),
    username: v.string(),
    passwordCiphertext: v.string(),
    passwordIv: v.string(),
    initialInvoice: v.optional(initialInvoiceValidator),
  },
  returns: v.id("subscribers"),
  handler: async (ctx, args): Promise<Id<"subscribers">> => {
    const { identity } = await requireWorkspaceRole(
      ctx,
      args.workspaceId,
      writeRoles,
    );
    if (!args.packageId) {
      throw new ConvexError(
        `A ${args.connectionType} subscriber must have a matching service package`,
      );
    }
    const pkg = await ctx.db.get(args.packageId);
    if (
      !pkg ||
      pkg.workspaceId !== args.workspaceId ||
      pkg.type !== args.connectionType
    ) {
      throw new ConvexError(
        `Select a ${args.connectionType} package in this workspace`,
      );
    }
    if (!pkg.isActive && args.status === "active") {
      throw new ConvexError(
        `Select an active ${args.connectionType} package before activation`,
      );
    }
    if (await credentialUsernameInUse(ctx, args.workspaceId, args.username)) {
      throw new ConvexError(
        `${args.connectionType} username is already in use`,
      );
    }

    const {
      workspaceId,
      connectionType,
      username,
      passwordCiphertext,
      passwordIv,
      initialInvoice,
      ...subscriberFields
    } = args;
    const id = await ctx.db.insert("subscribers", {
      ...subscriberFields,
      ...(subscriberFields.serviceExpiresAt === undefined
        ? {}
        : {
            serviceExpiresAt: normalizeServiceExpiry(
              subscriberFields.serviceExpiresAt,
            ),
          }),
      workspaceId,
      connectionType,
      ...(connectionType === "pppoe"
        ? {
            pppoeUsername: username,
            pppoePasswordCiphertext: passwordCiphertext,
            pppoePasswordIv: passwordIv,
          }
        : {
            hotspotUsername: username,
            hotspotPasswordCiphertext: passwordCiphertext,
            hotspotPasswordIv: passwordIv,
          }),
      isOnline: false,
      createdAt: new Date().toISOString(),
    });
    await scheduleServiceExpiry(ctx, id, subscriberFields.serviceExpiresAt);
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId,
      userId: identity.tokenIdentifier,
      action: "create",
      resource: "subscriber",
      resourceId: id,
      details: `Created ${connectionType} subscriber: ${args.name}`,
      createdAt: new Date().toISOString(),
    });
    if (initialInvoice) {
      await createInitialInvoice(ctx, {
        workspaceId,
        subscriberId: id,
        amount: args.monthlyFee,
        ...initialInvoice,
        userId: identity.tokenIdentifier,
      });
    }
    return id;
  },
});

export const setPppoeCredentials = action({
  args: {
    workspaceId: v.id("workspaces"),
    id: v.id("subscribers"),
    username: v.string(),
    password: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const encryptionKey = env.PPPOE_CREDENTIAL_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new ConvexError(
        "Subscriber credential storage is not configured; set PPPOE_CREDENTIAL_ENCRYPTION_KEY on the server",
      );
    }
    const username = validateServiceCredentials(
      args.username,
      args.password,
      "PPPoE",
    );
    const credential = await encryptSubscriberPassword(
      args.password,
      encryptionKey,
    );
    await ctx.runMutation(internal.subscribers.setCredentialInternal, {
      workspaceId: args.workspaceId,
      id: args.id,
      connectionType: "pppoe",
      username,
      passwordCiphertext: credential.ciphertext,
      passwordIv: credential.iv,
    });
    return null;
  },
});

export const setHotspotCredentials = action({
  args: {
    workspaceId: v.id("workspaces"),
    id: v.id("subscribers"),
    username: v.string(),
    password: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const encryptionKey = env.PPPOE_CREDENTIAL_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new ConvexError(
        "Subscriber credential storage is not configured; set PPPOE_CREDENTIAL_ENCRYPTION_KEY on the server",
      );
    }
    const username = validateServiceCredentials(
      args.username,
      args.password,
      "Hotspot",
    );
    const credential = await encryptSubscriberPassword(
      args.password,
      encryptionKey,
    );
    await ctx.runMutation(internal.subscribers.setCredentialInternal, {
      workspaceId: args.workspaceId,
      id: args.id,
      connectionType: "hotspot",
      username,
      passwordCiphertext: credential.ciphertext,
      passwordIv: credential.iv,
    });
    return null;
  },
});

export const setCredentialInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    id: v.id("subscribers"),
    connectionType: v.union(v.literal("pppoe"), v.literal("hotspot")),
    username: v.string(),
    passwordCiphertext: v.string(),
    passwordIv: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(
      ctx,
      args.workspaceId,
      writeRoles,
    );
    const subscriber = await ctx.db.get(args.id);
    if (
      !subscriber ||
      subscriber.workspaceId !== args.workspaceId ||
      subscriber.connectionType !== args.connectionType
    ) {
      throw new ConvexError(
        `${args.connectionType} subscriber not found in this workspace`,
      );
    }
    if (
      await credentialUsernameInUse(
        ctx,
        args.workspaceId,
        args.username,
        args.id,
      )
    ) {
      throw new ConvexError(
        `${args.connectionType} username is already in use`,
      );
    }
    await ctx.db.patch(
      args.id,
      args.connectionType === "pppoe"
        ? {
            pppoeUsername: args.username,
            pppoePassword: undefined,
            pppoePasswordCiphertext: args.passwordCiphertext,
            pppoePasswordIv: args.passwordIv,
          }
        : {
            hotspotUsername: args.username,
            hotspotPassword: undefined,
            hotspotPasswordCiphertext: args.passwordCiphertext,
            hotspotPasswordIv: args.passwordIv,
          },
    );
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId,
      userId: identity.tokenIdentifier,
      action: "update",
      resource: "subscriber_credentials",
      resourceId: args.id,
      details: `Updated ${args.connectionType} credentials`,
      createdAt: new Date().toISOString(),
    });
    return null;
  },
});

export const update = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    id: v.id("subscribers"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    status: v.optional(statusValidator),
    connectionType: v.optional(connectionTypeValidator),
    packageId: v.optional(v.id("packages")),
    ipAddress: v.optional(v.string()),
    macAddress: v.optional(v.string()),
    monthlyFee: v.optional(v.number()),
    balance: v.optional(v.number()),
    serviceExpiresAt: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(
      ctx,
      args.workspaceId,
      writeRoles,
    );
    const subscriber = await ctx.db.get(args.id);
    if (!subscriber || subscriber.workspaceId !== args.workspaceId)
      throw new Error("Subscriber not found");
    const nextConnectionType = args.connectionType ?? subscriber.connectionType;
    const nextPackageId = args.packageId ?? subscriber.packageId;
    const nextStatus = args.status ?? subscriber.status;
    if (nextPackageId) {
      const pkg = await ctx.db.get(nextPackageId);
      if (
        !pkg ||
        pkg.workspaceId !== args.workspaceId ||
        pkg.type !== nextConnectionType
      ) {
        throw new ConvexError(
          "Select a package matching the subscriber connection type",
        );
      }
    }
    if (
      nextStatus === "active" &&
      (subscriber.status !== "active" ||
        args.status !== undefined ||
        args.connectionType !== undefined ||
        args.packageId !== undefined)
    ) {
      await assertSubscriberCanBeActivated(ctx, {
        ...subscriber,
        connectionType: nextConnectionType,
        packageId: nextPackageId,
        serviceExpiresAt: args.serviceExpiresAt ?? subscriber.serviceExpiresAt,
      });
    }
    const { workspaceId: _workspaceId, id, ...fields } = args;
    const normalizedExpiry =
      args.serviceExpiresAt === undefined
        ? undefined
        : normalizeServiceExpiry(args.serviceExpiresAt);
    if (normalizedExpiry !== undefined) {
      fields.serviceExpiresAt = normalizedExpiry;
    }
    const updates: Partial<
      Pick<
        Doc<"subscribers">,
        | "name"
        | "email"
        | "phone"
        | "status"
        | "connectionType"
        | "packageId"
        | "ipAddress"
        | "macAddress"
        | "monthlyFee"
        | "balance"
        | "serviceExpiresAt"
        | "address"
        | "notes"
        | "isOnline"
      >
    > = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    );
    if (
      !isSubscriberServiceAvailable({
        status: nextStatus,
        serviceExpiresAt: normalizedExpiry ?? subscriber.serviceExpiresAt,
      })
    ) {
      updates.isOnline = false;
    }
    await ctx.db.patch(id, updates);
    if (nextStatus !== "active") {
      await queueSubscriberPppoeDisconnects(
        ctx,
        { ...subscriber, ...updates },
        `Subscriber status changed to ${nextStatus}`,
      );
    }
    if (normalizedExpiry !== undefined) {
      if (Date.parse(normalizedExpiry) <= Date.now()) {
        const updatedSubscriber = await ctx.db.get(id);
        if (updatedSubscriber) {
          await markSubscriberExpired(ctx, updatedSubscriber);
        }
      } else {
        await scheduleServiceExpiry(ctx, id, normalizedExpiry);
      }
    }
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId,
      userId: identity.tokenIdentifier,
      action: "update",
      resource: "subscriber",
      resourceId: id,
      details: `Updated subscriber fields: ${Object.keys(updates).join(", ")}`,
      createdAt: new Date().toISOString(),
    });
    return null;
  },
});

export const updateStatus = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    ids: v.array(v.id("subscribers")),
    status: statusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(
      ctx,
      args.workspaceId,
      writeRoles,
    );
    for (const id of args.ids) {
      const subscriber = await ctx.db.get(id);
      if (!subscriber || subscriber.workspaceId !== args.workspaceId)
        throw new Error("Subscriber not found");
      if (args.status === "active") {
        await assertSubscriberCanBeActivated(ctx, subscriber);
      }
      await ctx.db.patch(id, {
        status: args.status,
        ...(args.status === "active" ? {} : { isOnline: false }),
      });
      if (args.status !== "active") {
        await queueSubscriberPppoeDisconnects(
          ctx,
          { ...subscriber, status: args.status, isOnline: false },
          `Subscriber status changed to ${args.status}`,
        );
      }
    }
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId,
      userId: identity.tokenIdentifier,
      action: "bulk_status_update",
      resource: "subscriber",
      details: `Updated ${args.ids.length} subscribers to status: ${args.status}`,
      createdAt: new Date().toISOString(),
    });
    return null;
  },
});

export const extendService = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    id: v.id("subscribers"),
    mode: v.union(v.literal("extend"), v.literal("renew")),
    days: v.optional(v.number()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(
      ctx,
      args.workspaceId,
      writeRoles,
    );
    const subscriber = await ctx.db.get(args.id);
    if (!subscriber || subscriber.workspaceId !== args.workspaceId) {
      throw new ConvexError("Subscriber not found");
    }
    const days = args.mode === "renew" ? 30 : args.days;
    if (
      days === undefined ||
      !Number.isInteger(days) ||
      days < 1 ||
      days > 3650
    ) {
      throw new ConvexError(
        "Service extension must be between 1 and 3650 days",
      );
    }

    const currentExpiry = subscriber.serviceExpiresAt
      ? Date.parse(subscriber.serviceExpiresAt)
      : Number.NaN;
    if (subscriber.serviceExpiresAt && !Number.isFinite(currentExpiry)) {
      throw new ConvexError("Subscriber service expiry is invalid");
    }
    const now = Date.now();
    const nextExpiry = new Date(
      Math.max(now, Number.isFinite(currentExpiry) ? currentExpiry : now) +
        days * 24 * 60 * 60 * 1000,
    ).toISOString();
    const updates: {
      serviceExpiresAt: string;
      status?: "active";
    } = { serviceExpiresAt: nextExpiry };
    if (args.mode === "renew" && subscriber.status === "expired") {
      await assertSubscriberCanBeActivated(ctx, {
        ...subscriber,
        serviceExpiresAt: nextExpiry,
      });
      updates.status = "active";
    }
    await ctx.db.patch(args.id, updates);
    await scheduleServiceExpiry(ctx, args.id, nextExpiry);
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId,
      userId: identity.tokenIdentifier,
      action: args.mode === "renew" ? "renew_service" : "extend_service",
      resource: "subscriber",
      resourceId: args.id,
      details: `${args.mode === "renew" ? "Renewed" : "Extended"} service by ${days} days`,
      createdAt: new Date().toISOString(),
    });
    return nextExpiry;
  },
});

export const expireService = internalMutation({
  args: {
    subscriberId: v.id("subscribers"),
    expectedExpiry: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const subscriber = await ctx.db.get(args.subscriberId);
    if (!subscriber || subscriber.serviceExpiresAt !== args.expectedExpiry) {
      return null;
    }
    const expiryTimestamp = Date.parse(args.expectedExpiry);
    if (!Number.isFinite(expiryTimestamp)) {
      throw new ConvexError("Scheduled service expiry is invalid");
    }
    if (expiryTimestamp > Date.now()) {
      await scheduleServiceExpiry(ctx, args.subscriberId, args.expectedExpiry);
      return null;
    }
    await markSubscriberExpired(ctx, subscriber);
    return null;
  },
});

export const remove = mutation({
  args: { workspaceId: v.id("workspaces"), id: v.id("subscribers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(
      ctx,
      args.workspaceId,
      writeRoles,
    );
    const subscriber = await ctx.db.get(args.id);
    if (!subscriber || subscriber.workspaceId !== args.workspaceId)
      throw new Error("Subscriber not found");
    const [invoices, transactions, tickets] = await Promise.all([
      ctx.db
        .query("invoices")
        .withIndex("by_workspace_and_subscriber", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("subscriberId", args.id),
        )
        .take(1),
      ctx.db
        .query("transactions")
        .withIndex("by_workspace_and_subscriber", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("subscriberId", args.id),
        )
        .take(1),
      ctx.db
        .query("tickets")
        .withIndex("by_workspace_and_subscriber", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("subscriberId", args.id),
        )
        .take(1),
    ]);
    if (invoices.length || transactions.length || tickets.length) {
      throw new ConvexError(
        "This subscriber has linked invoices, payments, or support tickets, so permanent deletion is blocked to preserve billing history. Suspend the subscriber instead.",
      );
    }
    await queueSubscriberPppoeDisconnects(
      ctx,
      subscriber,
      "Subscriber deleted",
    );
    await ctx.db.delete(args.id);
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId,
      userId: identity.tokenIdentifier,
      action: "delete",
      resource: "subscriber",
      resourceId: args.id,
      details: `Deleted subscriber: ${subscriber.name}`,
      createdAt: new Date().toISOString(),
    });
    return null;
  },
});
