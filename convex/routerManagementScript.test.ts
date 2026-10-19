import { describe, expect, it } from "vitest";
import { buildRouterManagementScript } from "../src/pages/routers/_components/router-management-script";

const validOptions = {
  managementAddress: "10.77.0.2",
  gatewaySourceAddress: "10.77.0.1",
  apiUsername: "astrid-api-a1b2c3d4e5f6",
  apiPassword: "f".repeat(64),
  certificateName: "astrid-api-ssl",
};

describe("RouterOS management setup script", () => {
  it("creates or reuses certificates and configures a restricted API-SSL user", () => {
    const script = buildRouterManagementScript(validOptions);

    expect(script).toContain('password="' + "f".repeat(64) + '"');
    expect(script).toContain('group="astrid-management"');
    expect(script).toContain("address=10.77.0.1/32");
    expect(script).toContain(
      '/ip service set [find where name="api"] disabled=yes',
    );
    expect(script).toContain(
      'disabled=no port=8729 address=10.77.0.1/32 certificate="astrid-api-ssl"',
    );
    expect(script).toContain('name="astrid-api-ca"');
    expect(script).toContain('subject-alt-name="IP:10.77.0.2"');
    expect(script).toContain("ASTRID API-SSL SETUP SUCCEEDED");
    expect(script).toContain("ASTRID API-SSL SETUP FAILED");
    expect(script).not.toContain("available-from");
    expect(script).not.toContain(":local ");
  });

  it("reuses existing Astrid certificates without creating duplicates", () => {
    const script = buildRouterManagementScript(validOptions);

    expect(script).toContain(
      '[:len [/certificate find where name="astrid-api-ca"]] = 0',
    );
    expect(script).toContain(
      '[:len [/certificate find where name="astrid-api-ssl"]] = 0',
    );
    expect(script).toContain(
      "The existing API-SSL certificate SAN does not match",
    );
    expect(script).toContain("not signed by the Astrid API CA");
  });

  it("rejects unsafe values before generating RouterOS commands", () => {
    expect(() =>
      buildRouterManagementScript({
        ...validOptions,
        managementAddress: '10.77.0.2"; /user add name=attacker',
      }),
    ).toThrow(/valid IPv4/i);
  });
});
