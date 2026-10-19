type RouterManagementScriptOptions = {
  managementAddress: string;
  gatewaySourceAddress: string;
  apiUsername: string;
  apiPassword: string;
  certificateName: string;
};

function isValidIPv4Address(value: string) {
  const octets = value.split(".");
  return (
    octets.length === 4 &&
    octets.every(
      (octet) => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255,
    )
  );
}

export function buildRouterManagementScript({
  managementAddress,
  gatewaySourceAddress,
  apiUsername,
  apiPassword,
  certificateName,
}: RouterManagementScriptOptions) {
  if (
    !isValidIPv4Address(managementAddress) ||
    !isValidIPv4Address(gatewaySourceAddress) ||
    managementAddress === gatewaySourceAddress
  ) {
    throw new Error(
      "Enter distinct valid IPv4 addresses for router and gateway",
    );
  }
  if (!/^astrid-api-[a-f0-9]{12}$/.test(apiUsername)) {
    throw new Error("Generated RouterOS API username is invalid");
  }
  if (!/^[a-f0-9]{64}$/.test(apiPassword)) {
    throw new Error("Generated RouterOS API password is invalid");
  }
  if (
    !/^[A-Za-z0-9_.-]{1,64}$/.test(certificateName) ||
    certificateName === "astrid-api-ca"
  ) {
    throw new Error("API-SSL certificate name is invalid or reserved");
  }

  const caTemplateName = "astrid-api-ca-template";
  const serverTemplateName = "astrid-api-ssl-template";

  return `# Astrid RouterOS v7 API-SSL setup
# Paste the entire script into a trusted local RouterOS terminal.
# It reuses matching Astrid certificates and safely creates missing ones.
# API and API-SSL access are restricted to ${gatewaySourceAddress}/32.

:do {
  :if ([:pick [/system resource get version] 0 1] != "7") do={
    :error "Astrid API-SSL setup requires RouterOS v7"
  }

  :if ([:len [/certificate find where name="astrid-api-ca"]] = 0) do={
    :if ([:len [/certificate find where name="${caTemplateName}"]] = 0) do={
      /certificate add name="${caTemplateName}" common-name="astrid-api-ca" key-usage=key-cert-sign,crl-sign
    }
    /certificate sign [find where name="${caTemplateName}"] name="astrid-api-ca"
  }
  :if ([/certificate get [find where name="astrid-api-ca"] trusted] != true) do={
    /certificate set [find where name="astrid-api-ca"] trusted=yes
  }

  :if ([:len [/certificate find where name="${certificateName}"]] = 0) do={
    :if ([:len [/certificate find where name="${serverTemplateName}"]] = 0) do={
      /certificate add name="${serverTemplateName}" common-name="${managementAddress}" subject-alt-name="IP:${managementAddress}" key-usage=digital-signature,key-encipherment,tls-server
    }
    :if ([/certificate get [find where name="${serverTemplateName}"] subject-alt-name] != "IP:${managementAddress}") do={
      :error "A pending certificate template has a different IP SAN; remove or rename it before retrying"
    }
    /certificate sign [find where name="${serverTemplateName}"] ca="astrid-api-ca" name="${certificateName}"
  }
  :if ([/certificate get [find where name="${certificateName}"] subject-alt-name] != "IP:${managementAddress}") do={
    :error "The existing API-SSL certificate SAN does not match ${managementAddress}"
  }
  :if ([/certificate get [find where name="${certificateName}"] ca] != "astrid-api-ca") do={
    :error "The existing API-SSL certificate is not signed by the Astrid API CA"
  }
  :if ([/certificate get [find where name="${certificateName}"] trusted] != true) do={
    /certificate set [find where name="${certificateName}"] trusted=yes
  }

  :if ([:len [/user group find where name="astrid-management"]] = 0) do={
    /user group add name="astrid-management" policy=api,read,write
  } else={
    /user group set [find where name="astrid-management"] policy=api,read,write
  }
  :if ([:len [/user find where name="${apiUsername}"]] = 0) do={
    /user add name="${apiUsername}" group="astrid-management" password="${apiPassword}" address=${gatewaySourceAddress}/32 comment="Astrid API management"
  } else={
    /user set [find where name="${apiUsername}"] group="astrid-management" password="${apiPassword}" address=${gatewaySourceAddress}/32 comment="Astrid API management"
  }

  /ip service set [find where name="api"] disabled=yes
  /ip service set [find where name="api-ssl"] disabled=no port=8729 address=${gatewaySourceAddress}/32 certificate="${certificateName}" tls-version=only-1.2

  :if ([/certificate get [find where name="${certificateName}"] trusted] != true) do={
    :error "The API-SSL certificate is not trusted"
  }
  :if ([/ip service get [find where name="api-ssl"] certificate] != "${certificateName}") do={
    :error "API-SSL certificate assignment did not apply"
  }
  :if ([/ip service get [find where name="api-ssl"] address] != "${gatewaySourceAddress}/32") do={
    :error "API-SSL source restriction did not apply"
  }
  :if ([/user get [find where name="${apiUsername}"] address] != "${gatewaySourceAddress}/32") do={
    :error "API user source restriction did not apply"
  }
  :if ([/ip service get [find where name="api"] disabled] != true) do={
    :error "Unencrypted API service is still enabled"
  }

  :put "ASTRID API-SSL SETUP SUCCEEDED"
  :put "API-SSL is enabled on port 8729 and restricted to ${gatewaySourceAddress}/32"
  :put "Export the astrid-api-ca certificate (certificate only, no private key) and add it to the Ubuntu gateway trust bundle."
} on-error={
  :put "ASTRID API-SSL SETUP FAILED. No success was reported; inspect the preceding RouterOS error before retrying."
}
`;
}
