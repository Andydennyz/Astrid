/**
 * Generate a WireGuard-compatible Curve25519 keypair using the Web Crypto API.
 * Returns base64-encoded private and public keys (standard WireGuard format).
 */
export async function generateWireGuardKeypair(): Promise<{ privateKey: string; publicKey: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "X25519" },
    true, // extractable
    ["deriveKey", "deriveBits"],
  ) as CryptoKeyPair;

  const privateKeyBuffer = await crypto.subtle.exportKey("raw", keyPair.privateKey);
  const publicKeyBuffer = await crypto.subtle.exportKey("raw", keyPair.publicKey);

  return {
    privateKey: bufferToBase64(privateKeyBuffer),
    publicKey: bufferToBase64(publicKeyBuffer),
  };
}

export async function generatePresharedKey(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const raw = await crypto.subtle.exportKey("raw", key);
  return bufferToBase64(raw);
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Renders a standard WireGuard .conf file for a MikroTik peer.
 */
export function buildWireGuardConfig(opts: {
  privateKey: string;
  tunnelIp: string;
  dns?: string;
  serverPublicKey: string;
  serverEndpoint: string;
  serverTunnelIp: string;
  allowedIPs: string;
  presharedKey?: string;
}): string {
  const dns = opts.dns ? `\nDNS = ${opts.dns}` : "";
  const psk = opts.presharedKey ? `\nPresharedKey = ${opts.presharedKey}` : "";

  return `[Interface]
PrivateKey = ${opts.privateKey}
Address = ${opts.tunnelIp}${dns}

[Peer]
PublicKey = ${opts.serverPublicKey}${psk}
Endpoint = ${opts.serverEndpoint}
AllowedIPs = ${opts.allowedIPs}
PersistentKeepalive = 25
`;
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
