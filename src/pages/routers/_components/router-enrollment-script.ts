export function buildRouterEnrollmentScript() {
  return `# Astrid router enrollment key preparation
# RouterOS v7 only. This script creates no peer, tunnel address, RADIUS, or API user.
# The private key is generated and retained by RouterOS.

:local routerOsVersion [/system resource get version]
:if ([:pick $routerOsVersion 0 2] != "7.") do={
  :error "Astrid enrollment requires RouterOS v7"
}

:local interfaceName "wg-astrid-enrollment"
:local managedComment "Astrid router enrollment"
:local wgInterface [/interface wireguard find where name=$interfaceName]

:if ([:len $wgInterface] > 0) do={
  :if ([/interface wireguard get $wgInterface comment] != $managedComment) do={
    :error "An unrelated WireGuard interface already uses the Astrid enrollment name"
  }
} else={
  /interface wireguard add name=$interfaceName comment=$managedComment
  :set wgInterface [/interface wireguard find where name=$interfaceName]
}

:local routerPublicKey [/interface wireguard get $wgInterface public-key]
:put ("ASTRID_ROUTER_PUBLIC_KEY=" . $routerPublicKey)
`;
}

export function buildRouterEnrollmentRollbackScript() {
  return `# Removes only the temporary WireGuard interface created by Astrid enrollment.
:local wgInterface [/interface wireguard find where name="wg-astrid-enrollment" and comment="Astrid router enrollment"]
:if ([:len $wgInterface] > 0) do={
  /interface wireguard remove $wgInterface
  :put "Temporary Astrid enrollment interface removed"
} else={
  :put "No Astrid enrollment interface found; nothing changed"
}
`;
}
