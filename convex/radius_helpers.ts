import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";

export const findSubscriberByUsername = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, args): Promise<{
    _id: Id<"subscribers">;
    pppoeUsername?: string;
    pppoePassword?: string;
    phone: string;
    email?: string;
    status: "active" | "suspended" | "expired" | "pending";
    connectionType: "pppoe" | "hotspot" | "static";
    ipAddress?: string;
    packageId?: Id<"packages">;
  } | null> => {
    const subs = await ctx.db.query("subscribers").collect();
    const match = subs.find(
      (s) =>
        (s as unknown as { pppoeUsername?: string }).pppoeUsername === args.username ||
        s.phone === args.username ||
        s.email === args.username,
    );
    if (!match) return null;
    const sub = match as typeof match & { pppoeUsername?: string; pppoePassword?: string };
    return {
      _id: sub._id,
      pppoeUsername: sub.pppoeUsername,
      pppoePassword: sub.pppoePassword,
      phone: sub.phone,
      email: sub.email,
      status: sub.status,
      connectionType: sub.connectionType,
      ipAddress: sub.ipAddress,
      packageId: sub.packageId,
    };
  },
});

export const findRouterByNas = internalQuery({
  args: {
    nasIdentifier: v.optional(v.string()),
    nasIpAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.nasIdentifier) {
      return await ctx.db
        .query("routers")
        .withIndex("by_nas_identifier", (q) => q.eq("nasIdentifier", args.nasIdentifier!))
        .first();
    }
    if (args.nasIpAddress) {
      const routers = await ctx.db.query("routers").collect();
      return routers.find((r) => r.ipAddress === args.nasIpAddress) ?? null;
    }
    return null;
  },
});

export const getPackage = internalQuery({
  args: { packageId: v.id("packages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.packageId);
  },
});
