import { describe, expect, it } from "vitest";
import {
  buildFreeRadiusClientConfig,
  buildRouterRadiusScript,
} from "../src/pages/routers/_components/router-radius-script";

const credentials = {
  radiusServerAddress: "10.77.0.1",
  routerTunnelAddress: "10.77.0.2",
  radiusSecret: "a".repeat(64),
  nasIdentifier: `astrid-${"b".repeat(32)}`,
};

describe("router RADIUS setup scripts", () => {
  it("generates a RouterOS script scoped to the selected services", () => {
    const script = buildRouterRadiusScript({
      ...credentials,
      services: { ppp: true, hotspot: false },
    });

    expect(script).toContain("service=ppp authentication-port=1812 accounting-port=1813");
    expect(script).toContain("/ppp aaa set use-radius=yes accounting=yes interim-update=5m");
    expect(script).toContain("/system identity set name=$nasIdentifier");
    expect(script).toContain("accounting-port=1813 timeout=3s");
    expect(script).not.toContain("/ip hotspot profile set");
    expect(script).toContain(`:local radiusServer "${credentials.radiusServerAddress}"`);
    expect(script).toContain(`:local radiusSecret "${credentials.radiusSecret}"`);
    expect(script).toContain("address=$radiusServer");
  });

  it("checks HotSpot prerequisites before enabling RADIUS on its profiles", () => {
    const script = buildRouterRadiusScript({
      ...credentials,
      services: { ppp: false, hotspot: true },
    });

    expect(script).toContain("Create a HotSpot profile before enabling Astrid RADIUS");
    expect(script).toContain("service=hotspot authentication-port=1812 accounting-port=1813");
    expect(script).toContain(
      "/ip hotspot profile set $hotspotProfiles use-radius=yes radius-accounting=yes",
    );
    expect(script).not.toContain("/ppp aaa set");
  });

  it("generates a matching FreeRADIUS client block with Message-Authenticator required", () => {
    const config = buildFreeRadiusClientConfig(credentials);

    expect(config).toContain(`ipaddr = ${credentials.routerTunnelAddress}/32`);
    expect(config).toContain(`secret = ${credentials.radiusSecret}`);
    expect(config).toContain("require_message_authenticator = true");
    expect(config).toContain(`NAS-Identifier: ${credentials.nasIdentifier}`);
  });

  it("rejects invalid addresses, credentials, and empty service selections", () => {
    expect(() =>
      buildRouterRadiusScript({
        ...credentials,
        radiusServerAddress: "10.77.0.1; /user remove admin",
        services: { ppp: true, hotspot: false },
      }),
    ).toThrow("valid IPv4 RADIUS server address");
    expect(() =>
      buildRouterRadiusScript({
        ...credentials,
        radiusSecret: "short",
        services: { ppp: true, hotspot: false },
      }),
    ).toThrow("RADIUS secret is invalid");
    expect(() =>
      buildRouterRadiusScript({
        ...credentials,
        services: { ppp: false, hotspot: false },
      }),
    ).toThrow("Select at least one RADIUS service");
  });
});
