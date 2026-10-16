export type RouterRadiusServices = {
  ppp: boolean;
  hotspot: boolean;
};

function isValidIPv4Address(value: string) {
  const octets = value.split(".");
  return (
    octets.length === 4 &&
    octets.every((octet) => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255)
  );
}

function validateInputs(
  radiusServerAddress: string,
  routerTunnelAddress: string,
  radiusSecret: string,
  nasIdentifier: string,
  services: RouterRadiusServices,
) {
  if (!isValidIPv4Address(radiusServerAddress)) {
    throw new Error("Enter a valid IPv4 RADIUS server address");
  }
  if (!isValidIPv4Address(routerTunnelAddress)) {
    throw new Error("Enter a valid IPv4 router tunnel address");
  }
  if (!/^[a-f0-9]{64}$/i.test(radiusSecret)) {
    throw new Error("RADIUS secret is invalid");
  }
  if (!/^astrid-[a-f0-9]{32}$/.test(nasIdentifier)) {
    throw new Error("NAS-Identifier is invalid");
  }
  if (!services.ppp && !services.hotspot) {
    throw new Error("Select at least one RADIUS service");
  }
}

export function buildRouterRadiusScript({
  radiusServerAddress,
  routerTunnelAddress,
  radiusSecret,
  nasIdentifier,
  services,
}: {
  radiusServerAddress: string;
  routerTunnelAddress: string;
  radiusSecret: string;
  nasIdentifier: string;
  services: RouterRadiusServices;
}) {
  validateInputs(
    radiusServerAddress,
    routerTunnelAddress,
    radiusSecret,
    nasIdentifier,
    services,
  );
  const radiusServices = [
    ...(services.ppp ? ["ppp"] : []),
    ...(services.hotspot ? ["hotspot"] : []),
  ].join(",");
  const hotspotSetup = services.hotspot
    ? `
/ip hotspot profile set $hotspotProfiles use-radius=yes radius-accounting=yes`
    : "";
  const pppSetup = services.ppp
    ? `
/ppp aaa set use-radius=yes accounting=yes interim-update=5m`
    : "";

  return `# Astrid workspace-wide RADIUS client setup for RouterOS v7
# Apply only after the WireGuard route to the RADIUS server is working.
# This changes the RouterOS system identity to the registered NAS-Identifier.

:local radiusServer "${radiusServerAddress}"
:local routerTunnelAddress "${routerTunnelAddress}"
:local radiusSecret "${radiusSecret}"
:local nasIdentifier "${nasIdentifier}"
:local astridRadiusEntries [/radius find where comment="Astrid workspace-wide RADIUS"]

:if ([:len $astridRadiusEntries] > 1) do={
  :error "Multiple Astrid RADIUS entries exist; remove duplicates before running this script"
}

${services.hotspot ? `:local hotspotProfiles [/ip hotspot profile find]
:if ([:len $hotspotProfiles] = 0) do={
  :error "Create a HotSpot profile before enabling Astrid RADIUS"
}
` : ""}/system identity set name=$nasIdentifier
:if ([:len $astridRadiusEntries] = 0) do={
  /radius add address=$radiusServer src-address=$routerTunnelAddress secret=$radiusSecret service=${radiusServices} authentication-port=1812 accounting-port=1813 timeout=1s comment="Astrid workspace-wide RADIUS"
} else={
  /radius set $astridRadiusEntries address=$radiusServer src-address=$routerTunnelAddress secret=$radiusSecret service=${radiusServices} authentication-port=1812 accounting-port=1813 timeout=1s disabled=no
}
${pppSetup}${hotspotSetup}

:put "Astrid RADIUS client configured; verify /radius monitor and FreeRADIUS logs"
`;
}

export function buildFreeRadiusClientConfig({
  routerTunnelAddress,
  radiusSecret,
  nasIdentifier,
}: {
  routerTunnelAddress: string;
  radiusSecret: string;
  nasIdentifier: string;
}) {
  if (!isValidIPv4Address(routerTunnelAddress)) {
    throw new Error("Enter a valid IPv4 router tunnel address");
  }
  if (!/^[a-f0-9]{64}$/i.test(radiusSecret)) {
    throw new Error("RADIUS secret is invalid");
  }
  if (!/^astrid-[a-f0-9]{32}$/.test(nasIdentifier)) {
    throw new Error("NAS-Identifier is invalid");
  }
  const clientName = nasIdentifier.replace("-", "_");

  return `# Add to the FreeRADIUS clients configuration and reload the service.
# RouterOS sends NAS-Identifier: ${nasIdentifier}
client ${clientName} {
    ipaddr = ${routerTunnelAddress}/32
    secret = ${radiusSecret}
    require_message_authenticator = true
}
`;
}
