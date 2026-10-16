type RouterManagementScriptOptions = {
  managementAddress: string;
  gatewaySourceAddress: string;
  apiUsername: string;
  apiPassword: string;
  certificateName: string;
};

export function buildRouterManagementScript({
  managementAddress,
  gatewaySourceAddress,
  apiUsername,
  apiPassword,
  certificateName,
}: RouterManagementScriptOptions) {
  return `# Astrid RouterOS v7 API-SSL bootstrap
# Run from a trusted local RouterOS session after installing a trusted server certificate.
# Certificate SAN must include ${managementAddress}; its private key stays on this router.
# API-SSL and the API user are restricted to ${gatewaySourceAddress}/32.

:if ([:pick [/system resource get version] 0 1] != "7") do={
  :error "Astrid API-SSL setup requires RouterOS v7"
}

:local gatewayAddress "${gatewaySourceAddress}"
:local certificateName "${certificateName}"
:local apiUsername "${apiUsername}"
:local apiPassword "${apiPassword}"
:local certificateId [/certificate find where name=$certificateName]

:if ([:len $certificateId] = 0) do={
  :error "Install the trusted API-SSL certificate before running this script"
}
:if ([/certificate get $certificateId trusted] != true) do={
  :error "The selected API-SSL certificate is not trusted on this router"
}

:local groupId [/user group find where name="astrid-management"]
:if ([:len $groupId] = 0) do={
  /user group add name="astrid-management" policy=api,read,write
} else={
  /user group set $groupId policy=api,read,write
}

:local userId [/user find where name=$apiUsername]
:if ([:len $userId] = 0) do={
  /user add name=$apiUsername group="astrid-management" password=$apiPassword address=($gatewayAddress . "/32") comment="Astrid API management"
} else={
  /user set $userId group="astrid-management" password=$apiPassword address=($gatewayAddress . "/32") comment="Astrid API management"
}

/ip service set [find where name="api"] disabled=yes
/ip service set [find where name="api-ssl"] disabled=no port=8729 address=($gatewayAddress . "/32") certificate=$certificateName
:put "Astrid API-SSL enabled on port 8729 for ${gatewaySourceAddress}/32"
:put "Management address: ${managementAddress}; verify certificate trust and firewall policy on the gateway"
`;
}
