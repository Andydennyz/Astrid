import { describe, expect, it } from "vitest";
import { buildRouterManagementScript } from "../src/pages/routers/_components/router-management-script";

describe("RouterOS management setup script", () => {
  it("creates a password-protected API-SSL user restricted to the gateway", () => {
    const script = buildRouterManagementScript({
      managementAddress: "10.77.0.2",
      gatewaySourceAddress: "10.77.0.1",
      apiUsername: "astrid-api-a1b2c3d4e5f6",
      apiPassword: "f".repeat(64),
      certificateName: "astrid-api-ssl",
    });

    expect(script).toContain(':local apiPassword "' + "f".repeat(64) + '"');
    expect(script).toContain('group="astrid-management" password=$apiPassword');
    expect(script).toContain('address=($gatewayAddress . "/32")');
    expect(script).toContain('/ip service set [find where name="api"] disabled=yes');
    expect(script).toContain('name="api-ssl"] disabled=no port=8729');
    expect(script).toContain("certificate=$certificateName");
    expect(script).toContain("10.77.0.1/32");
    expect(script).toContain("10.77.0.2");
  });

  it("requires an already installed, trusted certificate and RouterOS v7", () => {
    const script = buildRouterManagementScript({
      managementAddress: "10.77.0.2",
      gatewaySourceAddress: "10.77.0.1",
      apiUsername: "astrid-api-a1b2c3d4e5f6",
      apiPassword: "f".repeat(64),
      certificateName: "astrid-api-ssl",
    });

    expect(script).toContain('!= "7"');
    expect(script).toContain("Install the trusted API-SSL certificate");
    expect(script).toContain("not trusted on this router");
  });
});
