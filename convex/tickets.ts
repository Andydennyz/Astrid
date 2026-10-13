import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema from "./schema";
import { requireWorkspaceRole } from "./model/workspace";

const readRoles = ["owner", "admin", "billing", "network", "read_only"] as const;
const subscriberDoc = schema.doc("subscribers").omit("pppoeUsername", "pppoePassword");
const ticketDoc = schema.doc("tickets");
const ticketListDoc = ticketDoc.extend({
  subscriberName: v.union(v.string(), v.null()),
  subscriberPhone: v.union(v.string(), v.null()),
});
const statusValidator = v.union(
  v.literal("open"), v.literal("in_progress"), v.literal("resolved"), v.literal("closed"),
);
const priorityValidator = v.union(
  v.literal("low"), v.literal("medium"), v.literal("high"), v.literal("critical"),
);
const categoryValidator = v.union(
  v.literal("connectivity"), v.literal("billing"), v.literal("hardware"), v.literal("other"),
);
const ticketWriteRoles = (category: "connectivity" | "billing" | "hardware" | "other") =>
  category === "billing"
    ? ["owner", "admin", "billing"] as const
    : ["owner", "admin", "network"] as const;

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.union(statusValidator, v.literal("all"))),
    priority: v.optional(v.union(priorityValidator, v.literal("all"))),
    category: v.optional(v.union(categoryValidator, v.literal("all"))),
    search: v.optional(v.string()),
  },
  returns: paginationResultValidator(ticketListDoc),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const page = args.status && args.status !== "all"
      ? await ctx.db.query("tickets")
          .withIndex("by_workspace_and_status", (q) =>
            q.eq("workspaceId", args.workspaceId).eq(
              "status",
              args.status as "open" | "in_progress" | "resolved" | "closed",
            ))
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db.query("tickets")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
          .order("desc")
          .paginate(args.paginationOpts);
    const enriched = await Promise.all(page.page.map(async (ticket) => {
      const subscriber = ticket.subscriberId ? await ctx.db.get(ticket.subscriberId) : null;
      const inWorkspace = subscriber?.workspaceId === args.workspaceId ? subscriber : null;
      return {
        ...ticket,
        subscriberName: inWorkspace?.name ?? null,
        subscriberPhone: inWorkspace?.phone ?? null,
      };
    }));
    const search = args.search?.toLowerCase();
    const filtered = enriched.filter((ticket) =>
      (!args.priority || args.priority === "all" || ticket.priority === args.priority) &&
      (!args.category || args.category === "all" || ticket.category === args.category) &&
      (!search || ticket.title.toLowerCase().includes(search) ||
        ticket.description.toLowerCase().includes(search) ||
        (ticket.subscriberName?.toLowerCase().includes(search) ?? false) ||
        (ticket.assignedTo?.toLowerCase().includes(search) ?? false)),
    );
    return { ...page, page: filtered };
  },
});

export const getStats = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    total: v.number(), open: v.number(), inProgress: v.number(), resolved: v.number(),
    closed: v.number(), critical: v.number(), high: v.number(), connectivity: v.number(),
    billing: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const all = await ctx.db.query("tickets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(8192);
    return {
      total: all.length,
      open: all.filter((t) => t.status === "open").length,
      inProgress: all.filter((t) => t.status === "in_progress").length,
      resolved: all.filter((t) => t.status === "resolved").length,
      closed: all.filter((t) => t.status === "closed").length,
      critical: all.filter((t) => t.priority === "critical").length,
      high: all.filter((t) => t.priority === "high").length,
      connectivity: all.filter((t) => t.category === "connectivity").length,
      billing: all.filter((t) => t.category === "billing").length,
    };
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"), subscriberId: v.optional(v.id("subscribers")),
    title: v.string(), description: v.string(), status: statusValidator,
    priority: priorityValidator, category: categoryValidator, assignedTo: v.optional(v.string()),
  },
  returns: v.id("tickets"),
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceRole(ctx, args.workspaceId, ticketWriteRoles(args.category));
    if (args.subscriberId) {
      const subscriber = await ctx.db.get(args.subscriberId);
      if (!subscriber || subscriber.workspaceId !== args.workspaceId) throw new Error("Subscriber not found");
    }
    const id = await ctx.db.insert("tickets", {
      ...args, createdAt: new Date().toISOString(),
    });
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: identity.tokenIdentifier, action: "create",
      resource: "ticket", resourceId: id, details: `Created ticket: ${args.title} [${args.priority}]`,
      createdAt: new Date().toISOString(),
    });
    return id;
  },
});

export const update = mutation({
  args: {
    workspaceId: v.id("workspaces"), id: v.id("tickets"),
    title: v.optional(v.string()), description: v.optional(v.string()),
    status: v.optional(statusValidator), priority: v.optional(priorityValidator),
    category: v.optional(categoryValidator), assignedTo: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireWorkspaceRole(ctx, args.workspaceId, ["owner", "admin", "billing", "network"]);
    const ticket = await ctx.db.get(args.id);
    if (!ticket || ticket.workspaceId !== args.workspaceId) throw new Error("Ticket not found");
    const nextCategory = args.category ?? ticket.category;
    const isOwnerOrAdmin = access.membership.role === "owner" || access.membership.role === "admin";
    const canWriteOldCategory = ticket.category === "billing"
      ? access.membership.role === "billing"
      : access.membership.role === "network";
    const canWriteNextCategory = nextCategory === "billing"
      ? access.membership.role === "billing"
      : access.membership.role === "network";
    if (!isOwnerOrAdmin && (!canWriteOldCategory || !canWriteNextCategory)) {
      throw new Error("Insufficient workspace permissions");
    }
    const { workspaceId: _workspaceId, id, ...fields } = args;
    const updates: Record<string, string> = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    );
    if (fields.status === "resolved" || fields.status === "closed") {
      updates.resolvedAt = new Date().toISOString();
    }
    await ctx.db.patch(id, updates);
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: access.identity.tokenIdentifier, action: "update",
      resource: "ticket", resourceId: id, details: `Updated ticket: ${Object.keys(updates).join(", ")}`,
      createdAt: new Date().toISOString(),
    });
    return null;
  },
});

export const remove = mutation({
  args: { workspaceId: v.id("workspaces"), id: v.id("tickets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireWorkspaceRole(ctx, args.workspaceId, ["owner", "admin", "billing", "network"]);
    const ticket = await ctx.db.get(args.id);
    if (!ticket || ticket.workspaceId !== args.workspaceId) throw new Error("Ticket not found");
    const allowedRole = ticket.category === "billing"
      ? access.membership.role === "billing"
      : access.membership.role === "network";
    if (access.membership.role !== "owner" && access.membership.role !== "admin" && !allowedRole) {
      throw new Error("Insufficient workspace permissions");
    }
    await ctx.db.delete(args.id);
    await ctx.db.insert("audit_logs", {
      workspaceId: args.workspaceId, userId: access.identity.tokenIdentifier, action: "delete",
      resource: "ticket", resourceId: args.id, details: `Deleted ticket: ${ticket.title}`,
      createdAt: new Date().toISOString(),
    });
    return null;
  },
});

export const getSubscribersList = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(subscriberDoc),
  handler: async (ctx, args) => {
    await requireWorkspaceRole(ctx, args.workspaceId, readRoles);
    const subscribers = await ctx.db.query("subscribers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("asc")
      .take(200);
    return subscribers.map(({ pppoeUsername: _username, pppoePassword: _password, ...subscriber }) => subscriber);
  },
});
