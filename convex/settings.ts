import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema from "./schema";

export const getCurrentUser = query({
  args: {},
  returns: v.union(schema.doc("users"), v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_token", (index) => index.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    companyName: v.optional(v.string()),
    avatar: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (index) => index.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new Error("User not found");

    const updates = {
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.email !== undefined ? { email: args.email } : {}),
      ...(args.companyName !== undefined ? { companyName: args.companyName } : {}),
      ...(args.avatar !== undefined ? { avatar: args.avatar } : {}),
    };
    await ctx.db.patch(user._id, updates);
    await ctx.db.insert("audit_logs", {
      userId: identity.tokenIdentifier,
      action: "update",
      resource: "user_profile",
      details: `Updated profile: ${Object.keys(updates).join(", ")}`,
      createdAt: new Date().toISOString(),
    });
    return null;
  },
});
