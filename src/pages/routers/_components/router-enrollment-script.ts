export function buildRouterEnrollmentScript() {
  return `{
# Astrid router enrollment key preparation
# RouterOS v7 only. This script creates no peer, tunnel address, RADIUS, or API user.
# The private key is generated and retained by RouterOS.

:local routerOsVersion [/system resource get version]
:if ([:find $routerOsVersion "7."] != 0) do={
  :error "Astrid enrollment requires RouterOS v7"
}

:local interfaceName "wg-astrid-enrollment"
:local managedComment "Astrid router enrollment"
:local existingInterface [/interface wireguard find where name=$interfaceName]

:if ([:len $existingInterface] = 0) do={
  /interface wireguard add name=$interfaceName comment=$managedComment
}

:local wgInterface [/interface wireguard find where name=$interfaceName]
:if ([:len $wgInterface] = 0) do={
  :error "Astrid enrollment WireGuard interface could not be created"
}
:if ([/interface wireguard get $wgInterface comment] != $managedComment) do={
  :error "An unrelated WireGuard interface already uses the Astrid enrollment name"
}

:local routerPublicKey [/interface wireguard get $wgInterface public-key]
:if ([:len $routerPublicKey] != 44) do={
  :error "RouterOS did not return a valid WireGuard public key"
}
:put ("ASTRID_ROUTER_PUBLIC_KEY=" . $routerPublicKey)
}
`;
}

export function buildRouterEnrollmentRollbackScript() {
  return `{
# Removes only the temporary WireGuard interface created by Astrid enrollment.
:local wgInterface [/interface wireguard find where name="wg-astrid-enrollment" and comment="Astrid router enrollment"]
:if ([:len $wgInterface] > 0) do={
  /interface wireguard remove $wgInterface
  :put "Temporary Astrid enrollment interface removed"
} else={
  :put "No Astrid enrollment interface found; nothing changed"
}
}
`;
}
