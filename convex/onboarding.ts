import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ─── Get onboarding state for the current user ────────────────────────────────
export const getProgress = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) return null;

    // Check what's set up
    const packageCount = await ctx.db.query("packages").take(1);
    const subscriberCount = await ctx.db.query("subscribers").take(1);
    const deviceCount = await ctx.db.query("network_devices").take(1);

    const steps = {
      profile: !!(user.name && user.companyName),
      packages: packageCount.length > 0,
      network: deviceCount.length > 0,
      subscribers: subscriberCount.length > 0,
    };

    const completedCount = Object.values(steps).filter(Boolean).length;
    const totalSteps = Object.keys(steps).length;

    return {
      steps,
      completedCount,
      totalSteps,
      isComplete: completedCount === totalSteps,
      user,
    };
  },
});

// ─── Complete setup profile step ─────────────────────────────────────────────
export const completeProfileStep = mutation({
  args: {
    name: v.string(),
    companyName: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, {
      name: args.name,
      companyName: args.companyName,
      ...(args.email ? { email: args.email } : {}),
    });

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "onboarding",
      resource: "user_profile",
      details: `Completed profile setup: ${args.companyName}`,
      createdAt: new Date().toISOString(),
    });
  },
});

// ─── Create starter package during onboarding ─────────────────────────────────
export const createStarterPackage = mutation({
  args: {
    name: v.string(),
    speed: v.string(),
    price: v.number(),
    type: v.union(v.literal("pppoe"), v.literal("hotspot"), v.literal("static")),
    downloadSpeed: v.number(),
    uploadSpeed: v.number(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const id = await ctx.db.insert("packages", {
      ...args,
      isActive: true,
      createdAt: new Date().toISOString(),
    });

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "onboarding",
      resource: "package",
      resourceId: id,
      details: `Created starter package: ${args.name}`,
      createdAt: new Date().toISOString(),
    });

    return id;
  },
});

// ─── Create starter network device during onboarding ─────────────────────────
export const createStarterDevice = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal("router"),
      v.literal("switch"),
      v.literal("access_point"),
      v.literal("server"),
      v.literal("other"),
    ),
    ipAddress: v.string(),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const id = await ctx.db.insert("network_devices", {
      ...args,
      status: "online",
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "onboarding",
      resource: "network_device",
      resourceId: id,
      details: `Added starter device: ${args.name}`,
      createdAt: new Date().toISOString(),
    });

    return id;
  },
});

// ─── Create starter subscriber during onboarding ─────────────────────────────
export const createStarterSubscriber = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    connectionType: v.union(v.literal("pppoe"), v.literal("hotspot"), v.literal("static")),
    packageId: v.optional(v.id("packages")),
    monthlyFee: v.number(),
    ipAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const id = await ctx.db.insert("subscribers", {
      ...args,
      status: "active",
      balance: 0,
      isOnline: false,
      createdAt: new Date().toISOString(),
    });

    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "onboarding",
      resource: "subscriber",
      resourceId: id,
      details: `Added first subscriber: ${args.name}`,
      createdAt: new Date().toISOString(),
    });

    return id;
  },
});
