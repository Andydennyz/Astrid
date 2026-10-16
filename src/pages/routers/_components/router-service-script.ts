function parseIPv4(value: string): number | null {
  const octets = value.split(".");
  if (
    octets.length !== 4 ||
    octets.some((octet) => !/^(0|[1-9]\d{0,2})$/.test(octet) || Number(octet) > 255)
  ) {
    return null;
  }
  return octets.reduce((result, octet) => result * 256 + Number(octet), 0);
}

export function buildPppoeServiceScript({
  interfaceName,
  localAddress,
  poolStart,
  poolEnd,
  serviceName,
}: {
  interfaceName: string;
  localAddress: string;
  poolStart: string;
  poolEnd: string;
  serviceName: string;
}) {
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(interfaceName)) {
    throw new Error("Enter a valid RouterOS interface name");
  }
  if (!/^[A-Za-z0-9_.-]{1,32}$/.test(serviceName)) {
    throw new Error("Service name must use 1-32 letters, digits, dots, dashes, or underscores");
  }
  const local = parseIPv4(localAddress);
  const start = parseIPv4(poolStart);
  const end = parseIPv4(poolEnd);
  if (local === null || start === null || end === null) {
    throw new Error("Enter valid IPv4 addresses for the server and client pool");
  }
  if (start > end) {
    throw new Error("PPPoE client pool start must not be after its end");
  }
  if (local >= start && local <= end) {
    throw new Error("PPPoE server local address must not overlap the client pool");
  }

  return `# Astrid RouterOS v7 PPPoE access concentrator setup
# Apply only after reviewing the interface and address plan and configuring RADIUS.
# Per-subscriber speed limits are returned by the Astrid RADIUS service.

:local pppoeInterface "${interfaceName}"
:local pppoeLocalAddress "${localAddress}"
:local pppoePoolStart "${poolStart}"
:local pppoePoolEnd "${poolEnd}"
:local pppoeServiceName "${serviceName}"
:local pppoePoolName "astrid-pppoe-pool"
:local pppoeProfileName "astrid-pppoe-default"
:local pppoeManagedComment "Astrid managed PPPoE"

:if ([:len [/interface find where name=$pppoeInterface]] = 0) do={
  :error "The selected PPPoE interface does not exist"
}

:local pppoePools [/ip pool find where name=$pppoePoolName]
:if ([:len $pppoePools] > 1) do={
  :error "Multiple address pools use the Astrid PPPoE pool name"
}
:if (([:len $pppoePools] > 0) && ([/ip pool get $pppoePools comment] != $pppoeManagedComment)) do={
  :error "The Astrid PPPoE pool name is used by an unmanaged pool"
}

:local pppoeProfiles [/ppp profile find where name=$pppoeProfileName]
:if ([:len $pppoeProfiles] > 1) do={
  :error "Multiple PPP profiles use the Astrid PPPoE profile name"
}
:if (([:len $pppoeProfiles] > 0) && ([/ppp profile get $pppoeProfiles comment] != $pppoeManagedComment)) do={
  :error "The Astrid PPPoE profile name is used by an unmanaged profile"
}

:local pppoeServers [/interface pppoe-server server find where comment=$pppoeManagedComment]
:if ([:len $pppoeServers] > 1) do={
  :error "Multiple managed PPPoE servers exist; remove duplicates before running this script"
}
:local interfaceServers [/interface pppoe-server server find where interface=$pppoeInterface]
:if (([:len $interfaceServers] > 0) && ([:len $pppoeServers] = 0)) do={
  :error "A PPPoE server already uses this interface; review it before provisioning"
}

:if ([:len $pppoePools] = 0) do={
  /ip pool add name=$pppoePoolName ranges=($pppoePoolStart . "-" . $pppoePoolEnd) comment=$pppoeManagedComment
} else={
  /ip pool set $pppoePools ranges=($pppoePoolStart . "-" . $pppoePoolEnd)
}

:if ([:len $pppoeProfiles] = 0) do={
  /ppp profile add name=$pppoeProfileName local-address=$pppoeLocalAddress remote-address=$pppoePoolName use-compression=no use-encryption=no only-one=yes change-tcp-mss=yes comment=$pppoeManagedComment
} else={
  /ppp profile set $pppoeProfiles local-address=$pppoeLocalAddress remote-address=$pppoePoolName use-compression=no use-encryption=no only-one=yes change-tcp-mss=yes
}

:if ([:len $pppoeServers] = 0) do={
  /interface pppoe-server server add interface=$pppoeInterface service-name=$pppoeServiceName default-profile=$pppoeProfileName authentication=pap one-session-per-host=yes disabled=no comment=$pppoeManagedComment
} else={
  /interface pppoe-server server set $pppoeServers interface=$pppoeInterface service-name=$pppoeServiceName default-profile=$pppoeProfileName authentication=pap one-session-per-host=yes disabled=no
}

/ppp aaa set use-radius=yes accounting=yes interim-update=5m
:put "Astrid PPPoE service configured. Verify RADIUS and /interface pppoe-server server before enabling clients."
`;
}
