import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestValue(
  body: Record<string, unknown>,
  key: string,
  radiusAttribute?: string,
): unknown {
  const value = body[key] ?? (radiusAttribute ? body[radiusAttribute] : undefined);
  if (!isRecord(value)) return value;
  const values = value.value;
  return Array.isArray(values) ? values[0] : values;
}

function radiusConnectionType(
  body: Record<string, unknown>,
): "pppoe" | "hotspot" | null | undefined {
  const explicitService = requestValue(body, "service");
  if (explicitService !== undefined && explicitService !== null && explicitService !== "") {
    return explicitService === "pppoe" || explicitService === "hotspot"
      ? explicitService
      : null;
  }
  const serviceType = requestValue(body, "serviceType", "Service-Type");
  if (serviceType === undefined || serviceType === null || serviceType === "") {
    return undefined;
  }
  if (
    serviceType === "hotspot" ||
    serviceType === "Login-User" ||
    serviceType === "1" ||
    serviceType === 1
  ) {
    return "hotspot";
  }
  if (
    serviceType === "pppoe" ||
    serviceType === "Framed-User" ||
    serviceType === "2" ||
    serviceType === 2
  ) {
    return "pppoe";
  }
  return null;
}

function secureEquals(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

async function hashHex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyRouterGateway(
  ctx: ActionCtx,
  request: Request,
  workspaceId: string,
) {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get("Authorization") ?? "");
  if (!match) return null;
  const tokenHash = await hashHex(match[1]);
  return await ctx.runQuery(internal.routerGateway.verifyGatewayCredential, {
    workspaceId,
    tokenHash,
  });
}

function authenticateGateway(request: Request) {
  const expectedToken = env.RADIUS_GATEWAY_TOKEN;
  if (!expectedToken || expectedToken.length < 32) {
    return jsonResponse(503, {
      error: "RADIUS gateway authentication is not configured",
    });
  }
  const authorization = request.headers.get("Authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match || !secureEquals(match[1], expectedToken)) {
    return jsonResponse(401, { error: "Unauthorized RADIUS gateway" });
  }
  return null;
}

async function readRequestBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

function requiredString(
  body: Record<string, unknown>,
  key: string,
  maxLength: number,
  radiusAttribute?: string,
) {
  const value = requestValue(body, key, radiusAttribute);
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength
    ? value
    : null;
}

function optionalString(
  body: Record<string, unknown>,
  key: string,
  maxLength: number,
  radiusAttribute?: string,
) {
  const value = requestValue(body, key, radiusAttribute);
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "string" && value.length <= maxLength ? value : null;
}

function optionalNumber(
  body: Record<string, unknown>,
  key: string,
  radiusAttribute?: string,
) {
  const value = requestValue(body, key, radiusAttribute);
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value))
  ) {
    return null;
  }
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function radiusRestResponse(attributes: Record<string, string | number>) {
  return Object.fromEntries(
    Object.entries(attributes).map(([attribute, value]) => [
      attribute,
      { value: [value], op: ":=" },
    ]),
  );
}

function validTimestamp(value: string | undefined) {
  if (value === undefined) return undefined;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : null;
}

const authenticateSubscriber = httpAction(async (ctx, request) => {
  const authenticationError = authenticateGateway(request);
  if (authenticationError) return authenticationError;
  if (!env.PPPOE_CREDENTIAL_ENCRYPTION_KEY) {
    return jsonResponse(503, {
      error: "Subscriber credential verification is not configured",
    });
  }
  const body = await readRequestBody(request);
  if (!body)
    return jsonResponse(400, { error: "Request body must be a JSON object" });
  const nasIdentifier = requiredString(body, "nasIdentifier", 128, "NAS-Identifier");
  const nasIpAddress = optionalString(body, "nasIpAddress", 64, "NAS-IP-Address");
  const username = requiredString(body, "username", 64, "User-Name");
  const password = requiredString(body, "password", 128, "User-Password");
  const connectionType = radiusConnectionType(body);
  if (!nasIdentifier || nasIpAddress === null || !username || !password || connectionType === null) {
    return jsonResponse(400, {
      error: "Invalid RADIUS authentication request",
    });
  }

  const router = await ctx.runQuery(internal.radius_helpers.findRouterByNas, {
    nasIdentifier,
    ...(nasIpAddress === undefined ? {} : { nasIpAddress }),
  });
  if (!router) return jsonResponse(401, { error: "Unknown RADIUS client" });
  const result = await ctx.runAction(internal.radius_helpers.authorizeSubscriber, {
    routerId: router._id,
    username,
    password,
    ...(connectionType === undefined ? {} : { connectionType }),
  });
  const requestAttrs = JSON.stringify({
    service: result.accepted ? result.connectionType : connectionType ?? "unclassified",
    ...(nasIpAddress === undefined ? {} : { nasIpAddress }),
  });
  if (!result.accepted) {
    await ctx.runMutation(internal.radius.logAndReject, {
      type: request.url.endsWith("/authorize") ? "authorize" : "authenticate",
      username,
      nasIdentifier,
      ...(nasIpAddress === undefined ? {} : { nasIpAddress }),
      requestAttrs,
      responseCode: "reject",
      rejectReason: result.reason,
      routerId: router._id,
    });
    return jsonResponse(
      200,
      radiusRestResponse({
        "control:Auth-Type": "Reject",
        "reply:Reply-Message": "Access-Reject",
      }),
    );
  }

  const replyAttrs: Record<string, string | number> = {
    "control:Auth-Type": "Accept",
    "reply:Reply-Message": "Access-Accept",
    "reply:Mikrotik-Rate-Limit": `${result.uploadMbps}M/${result.downloadMbps}M`,
    ...(result.framedIpAddress === undefined
      ? {}
      : { "reply:Framed-IP-Address": result.framedIpAddress }),
  };
  await ctx.runMutation(internal.radius.logAndAccept, {
    type: request.url.endsWith("/authorize") ? "authorize" : "authenticate",
    username,
    nasIdentifier,
    ...(nasIpAddress === undefined ? {} : { nasIpAddress }),
    requestAttrs,
    responseAttrs: JSON.stringify(replyAttrs),
    routerId: router._id,
  });
  return jsonResponse(200, radiusRestResponse(replyAttrs));
});

const recordAccounting = httpAction(async (ctx, request) => {
  const authenticationError = authenticateGateway(request);
  if (authenticationError) return authenticationError;
  const body = await readRequestBody(request);
  if (!body)
    return jsonResponse(400, { error: "Request body must be a JSON object" });
  const nasIdentifier = requiredString(body, "nasIdentifier", 128, "NAS-Identifier");
  const nasIpAddress = optionalString(body, "nasIpAddress", 64, "NAS-IP-Address");
  const username = requiredString(body, "username", 64, "User-Name");
  const sessionId = requiredString(body, "sessionId", 256, "Acct-Session-Id");
  const requestedConnectionType = radiusConnectionType(body);
  const rawEvent = requestValue(body, "status", "Acct-Status-Type");
  const event =
    rawEvent === "Start"
      ? "start"
      : rawEvent === "Stop"
        ? "stop"
        : rawEvent === "Interim-Update"
          ? "interim"
          : rawEvent;
  if (
    !nasIdentifier ||
    nasIpAddress === null ||
    !username ||
    !sessionId ||
    requestedConnectionType === null ||
    (event !== "start" && event !== "interim" && event !== "stop")
  ) {
    return jsonResponse(400, { error: "Invalid RADIUS accounting request" });
  }
  const startTimeValue = optionalString(body, "startTime", 64);
  const stopTimeValue = optionalString(body, "stopTime", 64);
  if (startTimeValue === null || stopTimeValue === null) {
    return jsonResponse(400, { error: "Invalid RADIUS accounting timestamps" });
  }
  const startTime = validTimestamp(startTimeValue);
  const stopTime = validTimestamp(stopTimeValue);
  const sessionTime = optionalNumber(body, "sessionTime", "Acct-Session-Time");
  const inputOctets = optionalNumber(body, "inputOctets", "Acct-Input-Octets");
  const outputOctets = optionalNumber(body, "outputOctets", "Acct-Output-Octets");
  const inputGigawords = optionalNumber(body, "inputGigawords", "Acct-Input-Gigawords");
  const outputGigawords = optionalNumber(body, "outputGigawords", "Acct-Output-Gigawords");
  const framedIpAddress = optionalString(body, "framedIpAddress", 64, "Framed-IP-Address");
  const calledStationId = optionalString(body, "calledStationId", 256, "Called-Station-Id");
  const callingStationId = optionalString(body, "callingStationId", 256, "Calling-Station-Id");
  const terminateCause = optionalString(body, "terminateCause", 128, "Acct-Terminate-Cause");
  if (
    startTime === null ||
    stopTime === null ||
    sessionTime === null ||
    inputOctets === null ||
    outputOctets === null ||
    inputGigawords === null ||
    outputGigawords === null ||
    framedIpAddress === null ||
    calledStationId === null ||
    callingStationId === null ||
    terminateCause === null
  ) {
    return jsonResponse(400, { error: "Invalid RADIUS accounting attributes" });
  }

  const router = await ctx.runQuery(internal.radius_helpers.findRouterByNas, {
    nasIdentifier,
    ...(nasIpAddress === undefined ? {} : { nasIpAddress }),
  });
  if (!router) return jsonResponse(401, { error: "Unknown RADIUS client" });
  const subscriber = await ctx.runQuery(
    internal.radius_helpers.findSubscriberByUsername,
    {
      workspaceId: router.workspaceId,
      username,
      ...(requestedConnectionType === undefined
        ? {}
        : { connectionType: requestedConnectionType }),
    },
  );
  const connectionType: "pppoe" | "hotspot" =
    requestedConnectionType ??
    (subscriber?.connectionType === "hotspot" ? "hotspot" : "pppoe");
  const subscriberId =
    subscriber?.connectionType === connectionType
      ? subscriber._id
      : undefined;
  const normalizedStartTime =
    startTime ??
    new Date(Date.now() - (sessionTime ?? 0) * 1000).toISOString();
  const status = event === "stop" ? "stopped" : "active";
  const accountingAttrs = {
    service: connectionType,
    status: event,
    ...(sessionTime === undefined ? {} : { sessionTime }),
    ...(inputOctets === undefined ? {} : { inputOctets }),
    ...(outputOctets === undefined ? {} : { outputOctets }),
    ...(inputGigawords === undefined ? {} : { inputGigawords }),
    ...(outputGigawords === undefined ? {} : { outputGigawords }),
  };
  await ctx.runMutation(internal.radius.upsertSession, {
    sessionId,
    routerId: router._id,
    ...(subscriberId === undefined ? {} : { subscriberId }),
    username,
    nasIdentifier,
    ...(nasIpAddress === undefined ? {} : { nasIpAddress }),
    ...(framedIpAddress === undefined ? {} : { framedIpAddress }),
    ...(calledStationId === undefined ? {} : { calledStationId }),
    ...(callingStationId === undefined ? {} : { callingStationId }),
    status,
    startTime: normalizedStartTime,
    ...(event === "stop"
      ? { stopTime: stopTime ?? new Date().toISOString() }
      : {}),
    ...(sessionTime === undefined ? {} : { sessionTime }),
    ...(inputOctets === undefined ? {} : { inputOctets }),
    ...(outputOctets === undefined ? {} : { outputOctets }),
    ...(inputGigawords === undefined ? {} : { inputGigawords }),
    ...(outputGigawords === undefined ? {} : { outputGigawords }),
    ...(terminateCause === undefined ? {} : { terminateCause }),
    connectionType,
  });
  await ctx.runMutation(internal.radius.logAndAccept, {
    type: "accounting",
    username,
    nasIdentifier,
    ...(nasIpAddress === undefined ? {} : { nasIpAddress }),
    requestAttrs: JSON.stringify(accountingAttrs),
    responseAttrs: JSON.stringify({ reply_message: "ok" }),
    routerId: router._id,
  });
  return jsonResponse(
    200,
    radiusRestResponse({ "reply:Reply-Message": "ok" }),
  );
});

const claimRouterGatewayOperation = httpAction(async (ctx, request) => {
  const body = await readRequestBody(request);
  if (!body) return jsonResponse(400, { error: "Request body must be a JSON object" });
  const workspaceId = requiredString(body, "workspaceId", 128);
  if (!workspaceId) return jsonResponse(400, { error: "workspaceId is required" });
  const verifiedWorkspaceId = await verifyRouterGateway(ctx, request, workspaceId);
  if (!verifiedWorkspaceId) return jsonResponse(401, { error: "Unauthorized router gateway" });

  const claimToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const operation = await ctx.runMutation(internal.routerGateway.claimNextOperation, {
    workspaceId: verifiedWorkspaceId,
    claimTokenHash: await hashHex(claimToken),
  });
  return jsonResponse(200, {
    operation,
    claimToken: operation ? claimToken : null,
  });
});

const completeRouterGatewayOperation = httpAction(async (ctx, request) => {
  const body = await readRequestBody(request);
  if (!body) return jsonResponse(400, { error: "Request body must be a JSON object" });
  const workspaceId = requiredString(body, "workspaceId", 128);
  const operationId = requiredString(body, "operationId", 128);
  const claimToken = requiredString(body, "claimToken", 64);
  const status = requiredString(body, "status", 16);
  const detail = optionalString(body, "detail", 500);
  if (
    !workspaceId ||
    !operationId ||
    !claimToken ||
    !/^[a-f0-9]{64}$/.test(claimToken) ||
    (status !== "succeeded" && status !== "failed") ||
    detail === null
  ) {
    return jsonResponse(400, { error: "Invalid router gateway operation result" });
  }
  const verifiedWorkspaceId = await verifyRouterGateway(ctx, request, workspaceId);
  if (!verifiedWorkspaceId) return jsonResponse(401, { error: "Unauthorized router gateway" });

  const completed = await ctx.runMutation(internal.routerGateway.completeOperation, {
    workspaceId: verifiedWorkspaceId,
    operationId,
    claimTokenHash: await hashHex(claimToken),
    status,
    ...(detail === undefined ? {} : { detail }),
  });
  if (!completed) {
    return jsonResponse(409, { error: "Operation lease is invalid, expired, or unavailable" });
  }
  return jsonResponse(200, { completed: true });
});

http.route({
  path: "/api/radius/authorize",
  method: "POST",
  handler: authenticateSubscriber,
});
http.route({
  path: "/api/radius/authenticate",
  method: "POST",
  handler: authenticateSubscriber,
});
http.route({
  path: "/api/radius/accounting",
  method: "POST",
  handler: recordAccounting,
});
http.route({
  path: "/api/router-gateway/operations/claim",
  method: "POST",
  handler: claimRouterGatewayOperation,
});
http.route({
  path: "/api/router-gateway/operations/complete",
  method: "POST",
  handler: completeRouterGatewayOperation,
});

export default http;
