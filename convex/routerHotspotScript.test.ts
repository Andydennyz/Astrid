import { describe, expect, it } from "vitest";
import { buildHotspotServiceScript } from "../src/pages/routers/_components/router-hotspot-script";

const validOptions = {
  interfaceName: "bridge-hotspot",
  hotspotAddress: "192.168.50.1",
  poolStart: "192.168.50.10",
  poolEnd: "192.168.50.250",
  dnsName: "login.example.com",
  certificateName: "hotspot-login",
};

describe("HotSpot service script", () => {
  it("creates an HTTPS-only RADIUS-backed HotSpot service and profile", () => {
    const script = buildHotspotServiceScript(validOptions);

    expect(script).toContain(
      '/ip pool add name=$hotspotPoolName ranges=($hotspotPoolStart . "-" . $hotspotPoolEnd)',
    );
    expect(script).toContain("login-by=https ssl-certificate=$hotspotCertificateName");
    expect(script).toContain("use-radius=yes radius-accounting=yes");
    expect(script).toContain("address-pool=$hotspotPoolName profile=$hotspotProfileName");
    expect(script).not.toContain("/ip address add");
    expect(script).not.toContain("/ip dhcp-server add");
    expect(script).not.toContain("/ip firewall");
  });

  it("validates interface, DNS, certificate, and address pool inputs", () => {
    expect(() =>
      buildHotspotServiceScript({
        ...validOptions,
        interfaceName: 'ether2"; /user remove admin',
      }),
    ).toThrow("valid RouterOS interface name");
    expect(() =>
      buildHotspotServiceScript({ ...validOptions, dnsName: "login with spaces" }),
    ).toThrow("fully qualified HotSpot DNS name");
    expect(() =>
      buildHotspotServiceScript({
        ...validOptions,
        certificateName: 'trusted"; /user remove admin',
      }),
    ).toThrow("valid RouterOS certificate name");
    expect(() =>
      buildHotspotServiceScript({
        ...validOptions,
        poolStart: "192.168.50.251",
        poolEnd: "192.168.50.10",
      }),
    ).toThrow("must not be after");
    expect(() =>
      buildHotspotServiceScript({ ...validOptions, hotspotAddress: "192.168.50.10" }),
    ).toThrow("must not overlap");
  });

  it("preflights managed resources and prerequisites before creating the pool", () => {
    const script = buildHotspotServiceScript(validOptions);
    const firstWrite = script.indexOf("/ip pool add");

    for (const preflightError of [
      "The selected HotSpot interface does not exist",
      "Assign the HotSpot gateway address to the selected interface",
      "The selected TLS certificate must exist on the router",
      "The Astrid HotSpot pool name is used by an unmanaged pool",
      "The Astrid HotSpot profile name is used by an unmanaged profile",
      "The Astrid HotSpot server name is used by an unmanaged server",
      "A HotSpot server already uses this interface",
    ]) {
      expect(script.indexOf(preflightError)).toBeGreaterThanOrEqual(0);
      expect(script.indexOf(preflightError)).toBeLessThan(firstWrite);
    }
  });
});
