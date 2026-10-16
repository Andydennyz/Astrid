import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireWorkspaceRole } from "./model/workspace";
import { createInitialInvoice, initialInvoiceValidator } from "./model/initialInvoice";

const profileValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  tokenIdentifier: v.string(),
  name: v.optional(v.string()),
  email: v.optional(v.string()),
  role: v.optional(v.union(v.literal("admin"), v.literal("staff"), v.literal("operator"))),
  avatar: v.optional(v.string()),
  companyName: v.optional(v.string()),
});

const stepsValidator = v.object({
  profile: v.boolean(),
  packages: v.boolean(),
  network: v.boolean(),
  subscribers: v.boolean(),
});

export const getProgress = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    steps: stepsValidator,
    completedCount: v.number(),
    totalSteps: v.number(),
    isComplete: v.boolean(),
    user: profileValidator,
  }),
  handler: async (ctx, args) => {
    const { user } = await requireWorkspaceRole(ctx, args.workspaceId, [
      "owner",
      "admin",
      "billing",
      "network",
      "read_only",
    ]);
    const [packages, subscribers, devices] = await Promise.all([
      ctx.db
        .query("packages")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .take(1),
      ctx.db
        .query("subscribers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .take(1),
      ctx.db
        .query("network_devices")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .take(1),
    ]);
    const steps = {
      profile: Boolean(user.name && user.companyName),
      packages: packages.length > 0,
      network: devices.length > 0,
      subscribers: subscribers.length > 0,
    };
    const completedCount = Object.values(steps).filter(Boolean).length;
    const totalSteps = Object.keys(steps).length;

    return { steps, completedCount, totalSteps, isComplete: completedCount === totalSteps, user };
  },
});

export const completeProfileStep = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    companyName: v.string(),
    email: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { identity, user } = await requireWorkspaceRole(ctx, args.workspaceId, ["owner", "admin"]);
    await ctx.db.patch(user._id, {
      name: args.name,
      companyName: args.companyName,
      ...(args.email !== undefined ? { email: args.email } : {}),
    });
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId,
      userId: identity.tokenIdentifier,
      action: "onboarding",
      resource: "user_profile",
      details: `Completed profile setup: ${args.companyName}`,
      createdAt: new Date().toISOString(),
    });
    return null;
  },
});

export const createStarterPackage = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    speed: v.string(),
    price: v.number(),
    type: v.union(v.literal("pppoe"), v.literal("hotspot"), v.literal("static")),
    downloadSpeed: v.number(),
    uploadSpeed: v.number(),
    description: v.optional(v.string()),
  },
  returns: v.id("packages"),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, [
      "owner",
      "admin",
      "billing",
    ]);
    const { workspaceId, ...packageFields } = args;
    const id = await ctx.db.insert("packages", {
      ...packageFields,
      workspaceId,
      isActive: true,
      createdAt: new Date().toISOString(),
    });
    await ctx.db.insert("audit_logs", {
      workspaceId,
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

export const createStarterDevice = mutation({
  args: {
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
    location: v.optional(v.string()),
  },
  returns: v.id("network_devices"),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, [
      "owner",
      "admin",
      "network",
    ]);
    const { workspaceId, ...deviceFields } = args;
    const now = new Date().toISOString();
    const id = await ctx.db.insert("network_devices", {
      ...deviceFields,
      workspaceId,
      status: "online",
      lastSeen: now,
      createdAt: now,
    });
    await ctx.db.insert("audit_logs", {
      workspaceId,
      userId: identity.tokenIdentifier,
      action: "onboarding",
      resource: "network_device",
      resourceId: id,
      details: `Added starter device: ${args.name}`,
      createdAt: now,
    });
    return id;
  },
});

export const createStarterSubscriber = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    connectionType: v.literal("static"),
    packageId: v.optional(v.id("packages")),
    monthlyFee: v.number(),
    ipAddress: v.optional(v.string()),
    initialInvoice: v.optional(initialInvoiceValidator),
  },
  returns: v.id("subscribers"),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, [
      "owner",
      "admin",
      "billing",
    ]);
    if (args.packageId) {
      const pkg = await ctx.db.get(args.packageId);
      if (!pkg || pkg.workspaceId !== args.workspaceId || pkg.type !== "static") {
        throw new Error("Select a static package in this workspace");
      }
    }
    const { workspaceId, initialInvoice, ...subscriberFields } = args;
    const id = await ctx.db.insert("subscribers", {
      ...subscriberFields,
      workspaceId,
      status: "active",
      balance: 0,
      isOnline: false,
      createdAt: new Date().toISOString(),
    });
    await ctx.db.insert("audit_logs", {
      workspaceId,
      userId: identity.tokenIdentifier,
      action: "onboarding",
      resource: "subscriber",
      resourceId: id,
      details: `Added first subscriber: ${args.name}`,
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
