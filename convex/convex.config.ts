import { defineApp } from "convex/server";
import { v } from "convex/values";

export default defineApp({
  env: {
    PPPOE_CREDENTIAL_ENCRYPTION_KEY: v.optional(v.string()),
    RADIUS_GATEWAY_TOKEN: v.optional(v.string()),
    PLATFORM_ADMIN_TOKEN_IDENTIFIERS: v.optional(v.string()),
  },
});
