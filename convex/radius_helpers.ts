import { env, internalAction, internalQuery } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import schema from "./schema";
import type { Doc, Id } from "./_generated/dataModel";
import { verifySubscriberPassword } from "./subscriberCredentials";

type SubscriberLookup = {
  _id: Doc<"subscribers">["_id"];
  workspaceId: Doc<"subscribers">["workspaceId"];
  username: string;
  passwordCiphertext?: string;
  passwordIv?: string;
  status: Doc<"subscribers">["status"];
  connectionType: Doc<"subscribers">["connectionType"];
  ipAddress?: string;
  packageId?: Doc<"subscribers">["packageId"];
};

type SubscriberAuthorization =
  | {
      accepted: true;
      subscriberId: Doc<"subscribers">["_id"];
      connectionType: "pppoe" | "hotspot";
      username: string;
      downloadMbps: number;
      uploadMbps: number;
      framedIpAddress?: string;
    }
  | { accepted: false; reason: string };
type RadiusRouter = {
  _id: Id<"routers">;
  workspaceId: Id<"workspaces">;
  tunnelIp?: string;
  ipAddress?: string;
};
type RadiusRouterWorkspace = { workspaceId: Id<"workspaces"> };

const authorizationResult = v.union(
  v.object({
    accepted: v.literal(true),
    subscriberId: v.id("subscribers"),
    connectionType: v.union(v.literal("pppoe"), v.literal("hotspot")),
    username: v.string(),
    downloadMbps: v.number(),
    uploadMbps: v.number(),
    framedIpAddress: v.optional(v.string()),
  }),
  v.object({ accepted: v.literal(false), reason: v.string() }),
);

export const findSubscriberByUsername = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    username: v.string(),
    connectionType: v.optional(v.union(v.literal("pppoe"), v.literal("hotspot"))),
  },
  returns: v.union(
    v.object({
      _id: v.id("subscribers"),
      workspaceId: v.id("workspaces"),
      username: v.string(),
      passwordCiphertext: v.optional(v.string()),
      passwordIv: v.optional(v.string()),
      status: v.union(
        v.literal("active"),
        v.literal("suspended"),
        v.literal("expired"),
        v.literal("pending"),
      ),
      connectionType: v.union(v.literal("pppoe"), v.literal("hotspot"), v.literal("static")),
      ipAddress: v.optional(v.string()),
      packageId: v.optional(v.id("packages")),
    }),
    v.null(),
  ),
  handler: async (ctx, args): Promise<SubscriberLookup | null> => {
    let matches: Doc<"subscribers">[];
    if (args.connectionType === "pppoe") {
      matches = await ctx.db
        .query("subscribers")
        .withIndex("by_workspace_and_pppoe_username", (index) =>
          index.eq("workspaceId", args.workspaceId).eq("pppoeUsername", args.username),
        )
        .take(2);
    } else if (args.connectionType === "hotspot") {
      matches = await ctx.db
        .query("subscribers")
        .withIndex("by_workspace_and_hotspot_username", (index) =>
          index.eq("workspaceId", args.workspaceId).eq("hotspotUsername", args.username),
        )
        .take(2);
    } else {
      const rows = await Promise.all([
        ctx.db
          .query("subscribers")
          .withIndex("by_workspace_and_pppoe_username", (index) =>
            index.eq("workspaceId", args.workspaceId).eq("pppoeUsername", args.username),
          )
          .first(),
        ctx.db
          .query("subscribers")
          .withIndex("by_workspace_and_hotspot_username", (index) =>
            index.eq("workspaceId", args.workspaceId).eq("hotspotUsername", args.username),
          )
          .first(),
      ]);
      matches = [
        ...new Map(
          rows
            .filter((row): row is Doc<"subscribers"> => row !== null)
            .map((row) => [row._id, row]),
        ).values(),
      ];
    }
    if (matches.length !== 1) return null;
    const [subscriber] = matches;
    const connectionType = subscriber.connectionType;
    if (connectionType !== "pppoe" && connectionType !== "hotspot") return null;
    const username = connectionType === "pppoe"
      ? subscriber.pppoeUsername
      : subscriber.hotspotUsername;
    const passwordCiphertext =
      connectionType === "pppoe"
        ? subscriber.pppoePasswordCiphertext
        : subscriber.hotspotPasswordCiphertext;
    const passwordIv =
      connectionType === "pppoe"
      ? subscriber.pppoePasswordIv
      : subscriber.hotspotPasswordIv;
    if (!username) return null;
    return {
      _id: subscriber._id,
      workspaceId: subscriber.workspaceId,
      username,
      connectionType,
      ...(passwordCiphertext === undefined ? {} : { passwordCiphertext }),
      ...(passwordIv === undefined ? {} : { passwordIv }),
      status: subscriber.status,
      ...(subscriber.ipAddress === undefined ? {} : { ipAddress: subscriber.ipAddress }),
      ...(subscriber.packageId === undefined ? {} : { packageId: subscriber.packageId }),
    };
  },
});

export const findRouterByNas = internalQuery({
  args: {
    nasIdentifier: v.optional(v.string()),
    nasIpAddress: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      _id: v.id("routers"),
      workspaceId: v.id("workspaces"),
      tunnelIp: v.optional(v.string()),
      ipAddress: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args): Promise<RadiusRouter | null> => {
    if (!args.nasIdentifier) return null;
    const candidates = await ctx.db
      .query("routers")
      .withIndex("by_nas_identifier", (index) => index.eq("nasIdentifier", args.nasIdentifier!))
      .take(100);
    if (candidates.length === 100) return null;
    const matches = candidates.filter(
      (router) =>
        router.workspaceId &&
        (!args.nasIpAddress ||
          args.nasIpAddress === router.tunnelIp?.split("/")[0] ||
          args.nasIpAddress === router.ipAddress),
    );
    const router = matches.length === 1 ? matches[0] : null;
    return router
      ? {
          _id: router._id,
          workspaceId: router.workspaceId!,
          ...(router.tunnelIp === undefined ? {} : { tunnelIp: router.tunnelIp }),
          ...(router.ipAddress === undefined ? {} : { ipAddress: router.ipAddress }),
        }
      : null;
  },
});

export const getPackage = internalQuery({
  args: { packageId: v.id("packages") },
  returns: v.union(schema.doc("packages"), v.null()),
  handler: async (ctx, args): Promise<Doc<"packages"> | null> => {
    return await ctx.db.get(args.packageId);
  },
});

export const getRouterForRadius = internalQuery({
  args: { routerId: v.id("routers") },
  returns: v.union(v.object({ workspaceId: v.id("workspaces") }), v.null()),
  handler: async (ctx, args): Promise<RadiusRouterWorkspace | null> => {
    const router = await ctx.db.get(args.routerId);
    return router?.workspaceId ? { workspaceId: router.workspaceId } : null;
  },
});

export const authorizeSubscriber = internalAction({
  args: {
    routerId: v.id("routers"),
    username: v.string(),
    password: v.string(),
    connectionType: v.optional(v.union(v.literal("pppoe"), v.literal("hotspot"))),
  },
  returns: authorizationResult,
  handler: async (ctx, args): Promise<SubscriberAuthorization> => {
    const rejected = {
      accepted: false as const,
      reason: "Invalid credentials or service unavailable",
    };
    const router: RadiusRouterWorkspace | null = await ctx.runQuery(
      internal.radius_helpers.getRouterForRadius,
      { routerId: args.routerId },
    );
    if (!router?.workspaceId) return rejected;
    const subscriber: SubscriberLookup | null = await ctx.runQuery(
      internal.radius_helpers.findSubscriberByUsername,
      {
        workspaceId: router.workspaceId,
        username: args.username,
        ...(args.connectionType === undefined ? {} : { connectionType: args.connectionType }),
      },
    );
    if (
      !subscriber ||
      subscriber.status !== "active" ||
      (subscriber.connectionType !== "pppoe" && subscriber.connectionType !== "hotspot") ||
      (args.connectionType !== undefined && subscriber.connectionType !== args.connectionType) ||
      !subscriber.passwordCiphertext ||
      !subscriber.passwordIv ||
      !subscriber.packageId
    ) {
      return rejected;
    }
    const encryptionKey = env.PPPOE_CREDENTIAL_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new ConvexError(
        "Subscriber credential verification is not configured; set PPPOE_CREDENTIAL_ENCRYPTION_KEY on the server",
      );
    }
    const matches = await verifySubscriberPassword(
      args.password,
      {
        ciphertext: subscriber.passwordCiphertext,
        iv: subscriber.passwordIv,
      },
      encryptionKey,
    );
    if (!matches) return rejected;
    const pkg: Doc<"packages"> | null = await ctx.runQuery(
      internal.radius_helpers.getPackage,
      { packageId: subscriber.packageId },
    );
    if (
      !pkg ||
      pkg.workspaceId !== router.workspaceId ||
      pkg.type !== subscriber.connectionType ||
      !pkg.isActive
    ) {
      return rejected;
    }
    return {
      accepted: true as const,
      subscriberId: subscriber._id,
      connectionType: subscriber.connectionType,
      username: subscriber.username,
      downloadMbps: pkg.downloadSpeed,
      uploadMbps: pkg.uploadSpeed,
      ...(subscriber.ipAddress === undefined ? {} : { framedIpAddress: subscriber.ipAddress }),
    };
  },
});
