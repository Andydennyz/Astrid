import { internalQuery } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import schema from "./schema";
import type { Doc } from "./_generated/dataModel";

type SubscriberLookup = {
  _id: Doc<"subscribers">["_id"];
  pppoeUsername?: string;
  pppoePassword?: string;
  phone: string;
  email?: string;
  status: Doc<"subscribers">["status"];
  connectionType: Doc<"subscribers">["connectionType"];
  ipAddress?: string;
  packageId?: Doc<"subscribers">["packageId"];
};

const gatewayDisabled = () => {
  throw new ConvexError(
    "RADIUS HTTP bridge is disabled until a VPS gateway authenticates the NAS shared secret",
  );
};

export const findSubscriberByUsername = internalQuery({
  args: { username: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("subscribers"),
      pppoeUsername: v.optional(v.string()),
      pppoePassword: v.optional(v.string()),
      phone: v.string(),
      email: v.optional(v.string()),
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
  handler: async (): Promise<SubscriberLookup | null> => gatewayDisabled(),
});

export const findRouterByNas = internalQuery({
  args: {
    nasIdentifier: v.optional(v.string()),
    nasIpAddress: v.optional(v.string()),
  },
  returns: v.union(schema.doc("routers"), v.null()),
  handler: async (): Promise<Doc<"routers"> | null> => gatewayDisabled(),
});

export const getPackage = internalQuery({
  args: { packageId: v.id("packages") },
  returns: v.union(schema.doc("packages"), v.null()),
  handler: async (): Promise<Doc<"packages"> | null> => gatewayDisabled(),
});
