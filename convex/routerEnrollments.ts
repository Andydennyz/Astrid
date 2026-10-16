import { ConvexError, v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireWorkspaceRole } from "./model/workspace";

const managerRoles = ["owner", "admin", "network"] as const;
const enrollmentStatus = v.union(
  v.literal("pending"),
  v.literal("expired"),
  v.literal("revoked"),
  v.literal("redeemed"),
);
const enrollmentLifetimeMs = 30 * 60 * 1000;

const publicEnrollment = v.object({
  _id: v.id("router_enrollments"),
  name: v.string(),
  location: v.optional(v.string()),
  model: v.optional(v.string()),
  routerOsVersion: v.literal("v7"),
  expiresAt: v.number(),
  status: enrollmentStatus,
  createdAt: v.string(),
  routerPublicKey: v.optional(v.string()),
  routerId: v.optional(v.id("routers")),
});

function hasControlCharacters(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function validateMetadata(name: string, location?: string, model?: string) {
  const normalizedName = name.trim();
  if (
    normalizedName.length < 1 ||
    normalizedName.length > 100 ||
    hasControlCharacters(normalizedName)
  ) {
    throw new ConvexError({ code: "INVALID_NAME", message: "Router name must be 1-100 characters" });
  }
  for (const [fieldName, value, maximumLength] of [
    ["location", location, 200],
    ["model", model, 100],
  ] as const) {
    if (
      value !== undefined &&
      (value.trim().length === 0 ||
        value.trim().length > maximumLength ||
        hasControlCharacters(value))
    ) {
      throw new ConvexError({
        code: "INVALID_METADATA",
        message: `${fieldName} must be 1-${maximumLength} characters`,
      });
    }
  }
  return normalizedName;
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const create = action({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    location: v.optional(v.string()),
    model: v.optional(v.string()),
    routerOsVersion: v.literal("v7"),
  },
  returns: v.object({
    enrollmentId: v.id("router_enrollments"),
    token: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const name = validateMetadata(args.name, args.location, args.model);
    const randomTokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = toHex(randomTokenBytes);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = toHex(new Uint8Array(digest));
    const expiresAt = Date.now() + enrollmentLifetimeMs;
    const enrollmentId: Id<"router_enrollments"> = await ctx.runMutation(
      internal.routerEnrollments.createInternal,
      {
        workspaceId: args.workspaceId,
        name,
        ...(args.location === undefined ? {} : { location: args.location.trim() }),
        ...(args.model === undefined ? {} : { model: args.model.trim() }),
        routerOsVersion: args.routerOsVersion,
        tokenHash,
        expiresAt,
      },
    );
    return { enrollmentId, token, expiresAt };
  },
});

export const redeem = action({
  args: {
    workspaceId: v.id("workspaces"),
    enrollmentId: v.id("router_enrollments"),
    token: v.string(),
    routerPublicKey: v.string(),
    radiusSecret: v.string(),
  },
  returns: v.object({
    routerId: v.id("routers"),
    nasIdentifier: v.string(),
  }),
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{64}$/i.test(args.token)) {
      throw new ConvexError({ code: "INVALID_TOKEN", message: "Enrollment token is invalid" });
    }
    if (!/^[a-f0-9]{64}$/.test(args.radiusSecret)) {
      throw new ConvexError({
        code: "INVALID_RADIUS_SECRET",
        message: "Generated RADIUS secret is invalid",
      });
    }
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(args.token));
    const tokenHash = toHex(new Uint8Array(digest));
    const secretDigest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(args.radiusSecret),
    );
    const keyDigest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(args.routerPublicKey),
    );
    const nasIdentifier = `astrid-${toHex(new Uint8Array(keyDigest)).slice(0, 32)}`;
    const routerId: Id<"routers"> = await ctx.runMutation(
      internal.routerEnrollments.redeemInternal,
      {
        workspaceId: args.workspaceId,
        enrollmentId: args.enrollmentId,
        tokenHash,
        routerPublicKey: args.routerPublicKey,
        radiusSecretHash: toHex(new Uint8Array(secretDigest)),
        nasIdentifier,
      },
    );
    return { routerId, nasIdentifier };
  },
});

export const list = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(publicEnrollment),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, managerRoles);
    const enrollments = await ctx.db
      .query("router_enrollments")
      .withIndex("by_workspace", (index) => index.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(100);
    return enrollments.map(
      ({
        _id,
        name,
        location,
        model,
        routerOsVersion,
        expiresAt,
        status,
        createdAt,
        routerPublicKey,
        routerId,
      }) => ({
        _id,
        name,
        ...(location === undefined ? {} : { location }),
        ...(model === undefined ? {} : { model }),
        routerOsVersion,
        expiresAt,
        status,
        createdAt,
        ...(routerPublicKey === undefined ? {} : { routerPublicKey }),
        ...(routerId === undefined ? {} : { routerId }),
      }),
    );
  },
});

export const revoke = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    enrollmentId: v.id("router_enrollments"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, managerRoles);
    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment || enrollment.workspaceId !== args.workspaceId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Enrollment not found" });
    }
    if (enrollment.status === "pending") {
      await ctx.db.patch(args.enrollmentId, {
        status: enrollment.expiresAt <= Date.now() ? "expired" : "revoked",
      });
    }
    return null;
  },
});

export const createInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    location: v.optional(v.string()),
    model: v.optional(v.string()),
    routerOsVersion: v.literal("v7"),
    tokenHash: v.string(),
    expiresAt: v.number(),
  },
  returns: v.id("router_enrollments"),
  handler: async (ctx, args) => {
    const { user } = await requireWorkspaceRole(ctx, args.workspaceId, managerRoles);
    const normalizedName = validateMetadata(args.name, args.location, args.model);
    if (!/^[a-f0-9]{64}$/.test(args.tokenHash)) {
      throw new ConvexError({ code: "INVALID_TOKEN_HASH", message: "Enrollment token hash is invalid" });
    }

    const now = Date.now();
    if (
      args.expiresAt <= now ||
      args.expiresAt > now + enrollmentLifetimeMs
    ) {
      throw new ConvexError({ code: "INVALID_EXPIRY", message: "Enrollment expiry is invalid" });
    }

    const duplicateHash = await ctx.db
      .query("router_enrollments")
      .withIndex("by_token_hash", (index) => index.eq("tokenHash", args.tokenHash))
      .unique();
    if (duplicateHash) {
      throw new ConvexError({ code: "DUPLICATE_TOKEN", message: "Enrollment token has already been used" });
    }
    const existingRouter = await ctx.db
      .query("routers")
      .withIndex("by_workspace_and_normalized_name", (index) =>
        index.eq("workspaceId", args.workspaceId).eq("normalizedName", normalizedName.toLowerCase()),
      )
      .first();
    const exactLegacyRouter = await ctx.db
      .query("routers")
      .withIndex("by_workspace_and_name", (index) =>
        index.eq("workspaceId", args.workspaceId).eq("name", normalizedName),
      )
      .first();
    if (existingRouter || exactLegacyRouter) {
      throw new ConvexError({
        code: "ROUTER_ALREADY_EXISTS",
        message: "A router with this name is already registered in this workspace",
      });
    }

    const expiredEnrollments = await ctx.db
      .query("router_enrollments")
      .withIndex("by_workspace_and_name_and_status_and_expiry", (index) =>
        index
          .eq("workspaceId", args.workspaceId)
          .eq("normalizedName", normalizedName.toLowerCase())
          .eq("status", "pending")
          .lte("expiresAt", now),
      )
      .take(100);
    for (const enrollment of expiredEnrollments) {
      await ctx.db.patch(enrollment._id, { status: "expired" });
    }

    const activeEnrollment = await ctx.db
      .query("router_enrollments")
      .withIndex("by_workspace_and_name_and_status_and_expiry", (index) =>
        index
          .eq("workspaceId", args.workspaceId)
          .eq("normalizedName", normalizedName.toLowerCase())
          .eq("status", "pending")
          .gt("expiresAt", now),
      )
      .first();
    if (activeEnrollment) {
      throw new ConvexError({
        code: "ENROLLMENT_ALREADY_ACTIVE",
        message: "An active enrollment already exists for this router name",
      });
    }

    const enrollmentId = await ctx.db.insert("router_enrollments", {
      workspaceId: args.workspaceId,
      name: normalizedName,
      normalizedName: normalizedName.toLowerCase(),
      ...(args.location === undefined ? {} : { location: args.location.trim() }),
      ...(args.model === undefined ? {} : { model: args.model.trim() }),
      routerOsVersion: args.routerOsVersion,
      tokenHash: args.tokenHash,
      expiresAt: args.expiresAt,
      status: "pending",
      createdAt: new Date().toISOString(),
      createdBy: user._id,
    });
    await ctx.scheduler.runAt(args.expiresAt, internal.routerEnrollments.expire, { enrollmentId });
    return enrollmentId;
  },
});

export const redeemInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    enrollmentId: v.id("router_enrollments"),
    tokenHash: v.string(),
    routerPublicKey: v.string(),
    radiusSecretHash: v.string(),
    nasIdentifier: v.string(),
  },
  returns: v.id("routers"),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, managerRoles);
    if (!/^[a-f0-9]{64}$/.test(args.tokenHash)) {
      throw new ConvexError({ code: "INVALID_TOKEN_HASH", message: "Enrollment token is invalid" });
    }
    if (!/^[A-Za-z0-9+/]{43}=$/.test(args.routerPublicKey)) {
      throw new ConvexError({
        code: "INVALID_PUBLIC_KEY",
        message: "Enter the WireGuard public key generated by the RouterOS v7 device",
      });
    }
    if (!/^[a-f0-9]{64}$/.test(args.radiusSecretHash)) {
      throw new ConvexError({
        code: "INVALID_RADIUS_SECRET_HASH",
        message: "Generated RADIUS secret is invalid",
      });
    }
    if (!/^astrid-[a-f0-9]{32}$/.test(args.nasIdentifier)) {
      throw new ConvexError({
        code: "INVALID_NAS_IDENTIFIER",
        message: "Generated NAS identifier is invalid",
      });
    }

    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment || enrollment.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "INVALID_ENROLLMENT",
        message: "Enrollment is unavailable, expired, revoked, or already used",
      });
    }
    const matchingToken = await ctx.db
      .query("router_enrollments")
      .withIndex("by_token_hash", (index) => index.eq("tokenHash", args.tokenHash))
      .unique();
    if (!matchingToken || matchingToken._id !== enrollment._id) {
      throw new ConvexError({ code: "INVALID_TOKEN", message: "Enrollment token is invalid" });
    }
    if (enrollment.status === "redeemed" && enrollment.routerId) {
      const router = await ctx.db.get(enrollment.routerId);
      if (
        router?.workspaceId === enrollment.workspaceId &&
        router.publicKey === args.routerPublicKey &&
        router.radiusSecretHash === args.radiusSecretHash &&
        router.nasIdentifier === args.nasIdentifier
      ) {
        return router._id;
      }
      throw new ConvexError({
        code: "INVALID_ENROLLMENT",
        message: "Enrollment is already used with different credentials",
      });
    }
    if (enrollment.status !== "pending") {
      throw new ConvexError({
        code: "INVALID_ENROLLMENT",
        message: "Enrollment is unavailable, expired, revoked, or already used",
      });
    }
    if (enrollment.expiresAt <= Date.now()) {
      throw new ConvexError({ code: "ENROLLMENT_EXPIRED", message: "Enrollment token has expired" });
    }

    const existingKey = await ctx.db
      .query("router_enrollments")
      .withIndex("by_router_public_key", (index) =>
        index.eq("routerPublicKey", args.routerPublicKey),
      )
      .first();
    const existingRouterKey = await ctx.db
      .query("routers")
      .withIndex("by_public_key", (index) => index.eq("publicKey", args.routerPublicKey))
      .first();
    if (existingKey || existingRouterKey) {
      throw new ConvexError({
        code: "PUBLIC_KEY_IN_USE",
        message: "This WireGuard public key is already enrolled",
      });
    }
    const existingNasIdentifier = await ctx.db
      .query("routers")
      .withIndex("by_nas_identifier", (index) => index.eq("nasIdentifier", args.nasIdentifier))
      .first();
    if (existingNasIdentifier) {
      throw new ConvexError({
        code: "DUPLICATE_NAS_IDENTIFIER",
        message: "Generated NAS identifier is already in use",
      });
    }

    const routerId = await ctx.db.insert("routers", {
      workspaceId: enrollment.workspaceId,
      name: enrollment.name,
      normalizedName: enrollment.normalizedName,
      publicKey: args.routerPublicKey,
      ...(enrollment.location === undefined ? {} : { location: enrollment.location }),
      ...(enrollment.model === undefined ? {} : { model: enrollment.model }),
      status: "unknown",
      radiusSecretHash: args.radiusSecretHash,
      nasIdentifier: args.nasIdentifier,
      routerOsVersion: enrollment.routerOsVersion,
      createdAt: new Date().toISOString(),
    });
    await ctx.db.patch(enrollment._id, {
      status: "redeemed",
      routerPublicKey: args.routerPublicKey,
      routerId,
      redeemedAt: new Date().toISOString(),
    });
    return routerId;
  },
});

export const expire = internalMutation({
  args: { enrollmentId: v.id("router_enrollments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get(args.enrollmentId);
    if (enrollment?.status === "pending" && enrollment.expiresAt <= Date.now()) {
      await ctx.db.patch(args.enrollmentId, { status: "expired" });
    }
    return null;
  },
});
