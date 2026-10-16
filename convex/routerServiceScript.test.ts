import { describe, expect, it } from "vitest";
import { buildPppoeServiceScript } from "../src/pages/routers/_components/router-service-script";

const validOptions = {
  interfaceName: "ether2",
  localAddress: "172.16.0.1",
  poolStart: "172.16.0.2",
  poolEnd: "172.16.0.254",
  serviceName: "astrid-pppoe",
};

describe("PPPoE service script", () => {
  it("creates a PAP-only RADIUS-backed PPPoE service and default profile", () => {
    const script = buildPppoeServiceScript(validOptions);

    expect(script).toContain(
      '/ip pool add name=$pppoePoolName ranges=($pppoePoolStart . "-" . $pppoePoolEnd)',
    );
    expect(script).toContain("remote-address=$pppoePoolName");
    expect(script).toContain("authentication=pap one-session-per-host=yes");
    expect(script).toContain("/ppp aaa set use-radius=yes accounting=yes interim-update=5m");
    expect(script).toContain("Per-subscriber speed limits are returned by the Astrid RADIUS service");
    expect(script).not.toContain("/ip address add");
    expect(script).not.toContain("/ip firewall");
  });

  it("validates script interpolations and address pool consistency", () => {
    expect(() =>
      buildPppoeServiceScript({ ...validOptions, interfaceName: 'ether2"; /user remove admin' }),
    ).toThrow("valid RouterOS interface name");
    expect(() =>
      buildPppoeServiceScript({ ...validOptions, poolStart: "172.16.0.255", poolEnd: "172.16.0.2" }),
    ).toThrow("must not be after");
    expect(() =>
      buildPppoeServiceScript({ ...validOptions, localAddress: "172.16.0.2" }),
    ).toThrow("must not overlap");
    expect(() =>
      buildPppoeServiceScript({ ...validOptions, serviceName: "name with spaces" }),
    ).toThrow("Service name must use");
  });

  it("marks managed objects and protects existing unmanaged profiles", () => {
    const script = buildPppoeServiceScript(validOptions);

    expect(script).toContain(':local pppoeManagedComment "Astrid managed PPPoE"');
    expect(script).toContain('The Astrid PPPoE pool name is used by an unmanaged pool');
    expect(script).toContain('The Astrid PPPoE profile name is used by an unmanaged profile');
    expect(script).toContain("A PPPoE server already uses this interface");
    expect(script.indexOf("The selected PPPoE interface does not exist")).toBeLessThan(
      script.indexOf("/ip pool add"),
    );
    expect(script.indexOf("A PPPoE server already uses this interface")).toBeLessThan(
      script.indexOf("/ip pool add"),
    );
  });
});
