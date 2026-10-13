import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { QueryCtx } from "./_generated/server";

const http = httpRouter();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function findSubscriberByUsername(ctx: QueryCtx, username: string) {
  // Try pppoe_username field first; fall back to searching by name or phone
  // Subscribers can have a pppoe/hotspot username stored in their record
  const subs = await ctx.db.query("subscribers").collect();
  return subs.find(
    (s) =>
      s.pppoeUsername === username ||
      s.phone === username ||
      s.email === username,
  ) ?? null;
}

async function findRouterByNas(ctx: QueryCtx, nasIdentifier?: string, nasIp?: string) {
  if (nasIdentifier) {
    return await ctx.db
      .query("routers")
      .withIndex("by_nas_identifier", (q) => q.eq("nasIdentifier", nasIdentifier))
      .first();
  }
  if (nasIp) {
    const routers = await ctx.db.query("routers").collect();
    return routers.find((r) => r.ipAddress === nasIp) ?? null;
  }
  return null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ─── POST /api/radius/authorize ───────────────────────────────────────────────
// Called by rlm_rest for authorization. Returns RADIUS attributes for the user.
http.route({
  path: "/api/radius/authorize",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let body: Record<string, string> = {};
    try {
      body = (await req.json()) as Record<string, string>;
    } catch {
      return jsonResponse({ reply_message: "Invalid JSON" }, 400);
    }

    const username: string = body["User-Name"] ?? body.username ?? "";
    const nasIdentifier: string | undefined = body["NAS-Identifier"] ?? body.nas_identifier;
    const nasIpAddress: string | undefined = body["NAS-IP-Address"] ?? body.nas_ip;

    if (!username) {
      return jsonResponse({ reply_message: "Missing User-Name" }, 400);
    }

    // Look up subscriber
    const subscriber = await ctx.runQuery(internal.radius_helpers.findSubscriberByUsername, { username });
    const router = await ctx.runQuery(internal.radius_helpers.findRouterByNas, {
      nasIdentifier,
      nasIpAddress,
    });

    const requestAttrs = JSON.stringify(body);

    if (!subscriber) {
      await ctx.runMutation(internal.radius.logAndReject, {
        type: "authorize",
        username,
        nasIdentifier,
        nasIpAddress,
        requestAttrs,
        responseCode: "reject",
        rejectReason: "Subscriber not found",
        routerId: router?._id,
      });
      return jsonResponse({ reply_message: "User not found" }, 404);
    }

    if (subscriber.status !== "active") {
      await ctx.runMutation(internal.radius.logAndReject, {
        type: "authorize",
        username,
        nasIdentifier,
        nasIpAddress,
        requestAttrs,
        responseCode: "reject",
        rejectReason: `Account ${subscriber.status}`,
        routerId: router?._id,
      });
      return jsonResponse({ reply_message: `Account ${subscriber.status}` }, 403);
    }

    // Load package for bandwidth limits
    const pkg = subscriber.packageId ? await ctx.runQuery(internal.radius_helpers.getPackage, { packageId: subscriber.packageId }) : null;

    // Build RADIUS reply attributes
    const replyAttrs: Record<string, string | number> = {
      "Cleartext-Password": subscriber.pppoePassword ?? "",
    };

    if (subscriber.ipAddress) {
      replyAttrs["Framed-IP-Address"] = subscriber.ipAddress;
      replyAttrs["Framed-IP-Netmask"] = "255.255.255.255";
    }

    if (pkg) {
      // MikroTik rate-limit format: rx/tx (download/upload from client perspective)
      const rateLimit = `${pkg.downloadSpeed}M/${pkg.uploadSpeed}M`;
      replyAttrs["Mikrotik-Rate-Limit"] = rateLimit;
      replyAttrs["WISPr-Bandwidth-Max-Down"] = pkg.downloadSpeed * 1000000;
      replyAttrs["WISPr-Bandwidth-Max-Up"] = pkg.uploadSpeed * 1000000;
    }

    const responseAttrs = JSON.stringify(replyAttrs);

    await ctx.runMutation(internal.radius.logAndAccept, {
      type: "authorize",
      username,
      nasIdentifier,
      nasIpAddress,
      requestAttrs,
      responseAttrs,
      routerId: router?._id,
    });

    return jsonResponse(replyAttrs, 200);
  }),
});

// ─── POST /api/radius/authenticate ───────────────────────────────────────────
// Called by rlm_rest for PAP/CHAP authentication.
http.route({
  path: "/api/radius/authenticate",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let body: Record<string, string> = {};
    try {
      body = (await req.json()) as Record<string, string>;
    } catch {
      return jsonResponse({ reply_message: "Invalid JSON" }, 400);
    }

    const username: string = body["User-Name"] ?? body.username ?? "";
    const password: string = body["User-Password"] ?? body.password ?? "";
    const nasIdentifier: string | undefined = body["NAS-Identifier"] ?? body.nas_identifier;
    const nasIpAddress: string | undefined = body["NAS-IP-Address"] ?? body.nas_ip;

    if (!username) return jsonResponse({ reply_message: "Missing User-Name" }, 400);

    const subscriber = await ctx.runQuery(internal.radius_helpers.findSubscriberByUsername, { username });
    const router = await ctx.runQuery(internal.radius_helpers.findRouterByNas, { nasIdentifier, nasIpAddress });

    const requestAttrs = JSON.stringify({ ...body, "User-Password": "***" });

    if (!subscriber) {
      await ctx.runMutation(internal.radius.logAndReject, {
        type: "authenticate",
        username,
        nasIdentifier,
        nasIpAddress,
        requestAttrs,
        responseCode: "reject",
        rejectReason: "Subscriber not found",
        routerId: router?._id,
      });
      return jsonResponse({ reply_message: "Authentication failed" }, 401);
    }

    if (subscriber.status !== "active") {
      await ctx.runMutation(internal.radius.logAndReject, {
        type: "authenticate",
        username,
        nasIdentifier,
        nasIpAddress,
        requestAttrs,
        responseCode: "reject",
        rejectReason: `Account ${subscriber.status}`,
        routerId: router?._id,
      });
      return jsonResponse({ reply_message: `Account ${subscriber.status}` }, 403);
    }

    const storedPassword = subscriber.pppoePassword ?? "";
    if (storedPassword !== password) {
      await ctx.runMutation(internal.radius.logAndReject, {
        type: "authenticate",
        username,
        nasIdentifier,
        nasIpAddress,
        requestAttrs,
        responseCode: "reject",
        rejectReason: "Invalid password",
        routerId: router?._id,
      });
      return jsonResponse({ reply_message: "Authentication failed" }, 401);
    }

    await ctx.runMutation(internal.radius.logAndAccept, {
      type: "authenticate",
      username,
      nasIdentifier,
      nasIpAddress,
      requestAttrs,
      routerId: router?._id,
    });

    return jsonResponse({ reply_message: "Authentication successful" }, 200);
  }),
});

// ─── POST /api/radius/accounting ─────────────────────────────────────────────
// Called by rlm_rest for RADIUS accounting (Start/Interim-Update/Stop).
http.route({
  path: "/api/radius/accounting",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let body: Record<string, string | number> = {};
    try {
      body = (await req.json()) as Record<string, string | number>;
    } catch {
      return jsonResponse({ reply_message: "Invalid JSON" }, 400);
    }

    const username = String(body["User-Name"] ?? body.username ?? "");
    const sessionId = String(body["Acct-Session-Id"] ?? body.acct_session_id ?? "");
    const statusType = String(body["Acct-Status-Type"] ?? body.acct_status_type ?? "").toLowerCase();
    const nasIdentifier = String(body["NAS-Identifier"] ?? body.nas_identifier ?? "");
    const nasIpAddress = String(body["NAS-IP-Address"] ?? body.nas_ip ?? "");

    if (!sessionId || !username) {
      return jsonResponse({ reply_message: "Missing Acct-Session-Id or User-Name" }, 400);
    }

    const subscriber = await ctx.runQuery(internal.radius_helpers.findSubscriberByUsername, { username });
    const router = await ctx.runQuery(internal.radius_helpers.findRouterByNas, { nasIdentifier, nasIpAddress });

    const sessionStatus = statusType === "stop" ? "stopped" : statusType === "interim-update" ? "interim" : "active";
    const now = new Date().toISOString();

    // Determine connection type from subscriber or default pppoe
    const connectionType = subscriber?.connectionType ?? "pppoe";

    await ctx.runMutation(internal.radius.upsertSession, {
      sessionId,
      routerId: router?._id,
      subscriberId: subscriber?._id,
      username,
      nasIdentifier,
      nasIpAddress: nasIpAddress || undefined,
      framedIpAddress: body["Framed-IP-Address"] ? String(body["Framed-IP-Address"]) : undefined,
      calledStationId: body["Called-Station-Id"] ? String(body["Called-Station-Id"]) : undefined,
      callingStationId: body["Calling-Station-Id"] ? String(body["Calling-Station-Id"]) : undefined,
      status: sessionStatus,
      startTime: body["Event-Timestamp"] ? String(body["Event-Timestamp"]) : now,
      stopTime: statusType === "stop" ? now : undefined,
      sessionTime: body["Acct-Session-Time"] ? Number(body["Acct-Session-Time"]) : undefined,
      inputOctets: body["Acct-Input-Octets"] ? Number(body["Acct-Input-Octets"]) : undefined,
      outputOctets: body["Acct-Output-Octets"] ? Number(body["Acct-Output-Octets"]) : undefined,
      inputGigawords: body["Acct-Input-Gigawords"] ? Number(body["Acct-Input-Gigawords"]) : undefined,
      outputGigawords: body["Acct-Output-Gigawords"] ? Number(body["Acct-Output-Gigawords"]) : undefined,
      terminateCause: body["Acct-Terminate-Cause"] ? String(body["Acct-Terminate-Cause"]) : undefined,
      connectionType,
    });

    await ctx.runMutation(internal.radius.logAndAccept, {
      type: "accounting",
      username,
      nasIdentifier: nasIdentifier || undefined,
      nasIpAddress: nasIpAddress || undefined,
      requestAttrs: JSON.stringify(body),
      routerId: router?._id,
    });

    return jsonResponse({ reply_message: "Accounting recorded" }, 200);
  }),
});

// ─── OPTIONS preflight ────────────────────────────────────────────────────────
for (const path of ["/api/radius/authorize", "/api/radius/authenticate", "/api/radius/accounting"]) {
  http.route({
    path,
    method: "OPTIONS",
    handler: httpAction(async () => {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }),
  });
}

export default http;
