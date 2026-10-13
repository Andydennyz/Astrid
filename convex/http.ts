import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();
const unavailableResponse = () =>
  new Response(
    JSON.stringify({
      reply_message: "RADIUS integration is unavailable until an authenticated gateway is configured",
    }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );

for (const path of [
  "/api/radius/authorize",
  "/api/radius/authenticate",
  "/api/radius/accounting",
]) {
  http.route({
    path,
    method: "POST",
    handler: httpAction(async () => unavailableResponse()),
  });

  http.route({
    path,
    method: "OPTIONS",
    handler: httpAction(async () => new Response(null, { status: 204 })),
  });
}

export default http;
