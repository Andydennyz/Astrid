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

export function buildHotspotServiceScript({
  interfaceName,
  hotspotAddress,
  poolStart,
  poolEnd,
  dnsName,
  certificateName,
}: {
  interfaceName: string;
  hotspotAddress: string;
  poolStart: string;
  poolEnd: string;
  dnsName: string;
  certificateName: string;
}) {
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(interfaceName)) {
    throw new Error("Enter a valid RouterOS interface name");
  }
  if (!/^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(dnsName)) {
    throw new Error("Enter a fully qualified HotSpot DNS name");
  }
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(certificateName)) {
    throw new Error("Enter a valid RouterOS certificate name");
  }

  const address = parseIPv4(hotspotAddress);
  const start = parseIPv4(poolStart);
  const end = parseIPv4(poolEnd);
  if (address === null || start === null || end === null) {
    throw new Error("Enter valid IPv4 addresses for the HotSpot gateway and client pool");
  }
  if (start > end) {
    throw new Error("HotSpot client pool start must not be after its end");
  }
  if (address >= start && address <= end) {
    throw new Error("HotSpot gateway address must not overlap the client pool");
  }

  return `# Astrid RouterOS v7 HotSpot service setup
# Review the isolated interface, address plan, certificate, DHCP, and upstream policy first.
# The gateway address must already be assigned to the selected interface.
# This script does not configure DHCP, firewall/NAT, or WireGuard.
# HTTPS-only login protects credentials in transit; the certificate must match the DNS name and be trusted by clients.

:local hotspotInterface "${interfaceName}"
:local hotspotAddress "${hotspotAddress}"
:local hotspotPoolStart "${poolStart}"
:local hotspotPoolEnd "${poolEnd}"
:local hotspotDnsName "${dnsName}"
:local hotspotCertificateName "${certificateName}"
:local hotspotPoolName "astrid-hotspot-pool"
:local hotspotProfileName "astrid-hotspot-default"
:local hotspotServerName "astrid-hotspot"
:local hotspotManagedComment "Astrid managed HotSpot"

:if ([:len [/interface find where name=$hotspotInterface]] = 0) do={
  :error "The selected HotSpot interface does not exist"
}
:local hotspotAddressAssigned false
:foreach addressId in=[/ip address find where interface=$hotspotInterface] do={
  :local assignedAddress [/ip address get $addressId address]
  :if ([:pick $assignedAddress 0 [:len $hotspotAddress]] = $hotspotAddress) do={
    :set hotspotAddressAssigned true
  }
}
:if ($hotspotAddressAssigned = false) do={
  :error "Assign the HotSpot gateway address to the selected interface before running this script"
}
:local hotspotCertificates [/certificate find where name=$hotspotCertificateName]
:if ([:len $hotspotCertificates] != 1) do={
  :error "The selected TLS certificate must exist on the router"
}

:local hotspotPools [/ip pool find where name=$hotspotPoolName]
:if ([:len $hotspotPools] > 1) do={
  :error "Multiple address pools use the Astrid HotSpot pool name"
}
:if (([:len $hotspotPools] > 0) && ([/ip pool get $hotspotPools comment] != $hotspotManagedComment)) do={
  :error "The Astrid HotSpot pool name is used by an unmanaged pool"
}

:local hotspotProfiles [/ip hotspot profile find where name=$hotspotProfileName]
:if ([:len $hotspotProfiles] > 1) do={
  :error "Multiple HotSpot profiles use the Astrid HotSpot profile name"
}
:if (([:len $hotspotProfiles] > 0) && ([/ip hotspot profile get $hotspotProfiles comment] != $hotspotManagedComment)) do={
  :error "The Astrid HotSpot profile name is used by an unmanaged profile"
}

:local hotspotServers [/ip hotspot find where name=$hotspotServerName]
:if ([:len $hotspotServers] > 1) do={
  :error "Multiple HotSpot servers use the Astrid HotSpot server name"
}
:if (([:len $hotspotServers] > 0) && ([/ip hotspot get $hotspotServers comment] != $hotspotManagedComment)) do={
  :error "The Astrid HotSpot server name is used by an unmanaged server"
}
:local interfaceServers [/ip hotspot find where interface=$hotspotInterface]
:if (([:len $interfaceServers] > 0) && ([:len $hotspotServers] = 0)) do={
  :error "A HotSpot server already uses this interface; review it before provisioning"
}

:if ([:len $hotspotPools] = 0) do={
  /ip pool add name=$hotspotPoolName ranges=($hotspotPoolStart . "-" . $hotspotPoolEnd) comment=$hotspotManagedComment
} else={
  /ip pool set $hotspotPools ranges=($hotspotPoolStart . "-" . $hotspotPoolEnd)
}

:if ([:len $hotspotProfiles] = 0) do={
  /ip hotspot profile add name=$hotspotProfileName hotspot-address=$hotspotAddress dns-name=$hotspotDnsName html-directory=hotspot login-by=https ssl-certificate=$hotspotCertificateName use-radius=yes radius-accounting=yes comment=$hotspotManagedComment
} else={
  /ip hotspot profile set $hotspotProfiles hotspot-address=$hotspotAddress dns-name=$hotspotDnsName html-directory=hotspot login-by=https ssl-certificate=$hotspotCertificateName use-radius=yes radius-accounting=yes
}

:if ([:len $hotspotServers] = 0) do={
  /ip hotspot add name=$hotspotServerName interface=$hotspotInterface address-pool=$hotspotPoolName profile=$hotspotProfileName disabled=no comment=$hotspotManagedComment
} else={
  /ip hotspot set $hotspotServers interface=$hotspotInterface address-pool=$hotspotPoolName profile=$hotspotProfileName disabled=no
}

:put "Astrid HotSpot service configured. Verify HTTPS certificate, DHCP, RADIUS, and upstream policy before enabling clients."
`;
}
