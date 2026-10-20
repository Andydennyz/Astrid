export type EncryptedCredential = {
  ciphertext: string;
  iv: string;
};

function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array) {
  return btoa(String.fromCharCode(...value));
}

async function importKey(encodedKey: string, usage: KeyUsage[]) {
  let keyBytes: Uint8Array;
  try {
    keyBytes = decodeBase64(encodedKey);
  } catch {
    throw new Error("PPPOE_CREDENTIAL_ENCRYPTION_KEY must be base64-encoded");
  }
  if (keyBytes.length !== 32) {
    throw new Error(
      "PPPOE_CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes",
    );
  }
  const rawKey = new ArrayBuffer(keyBytes.length);
  new Uint8Array(rawKey).set(keyBytes);
  return await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, usage);
}

export async function encryptSubscriberPassword(
  password: string,
  encodedKey: string,
): Promise<EncryptedCredential> {
  const key = await importKey(encodedKey, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(password),
  );
  return {
    ciphertext: encodeBase64(new Uint8Array(ciphertext)),
    iv: encodeBase64(iv),
  };
}

export async function decryptSubscriberPassword(
  credential: EncryptedCredential,
  encodedKey: string,
) {
  const key = await importKey(encodedKey, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(credential.iv) },
    key,
    decodeBase64(credential.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

export async function verifySubscriberPassword(
  password: string,
  credential: EncryptedCredential,
  encodedKey: string,
) {
  try {
    const savedPassword = await decryptSubscriberPassword(
      credential,
      encodedKey,
    );
    const submitted = new TextEncoder().encode(password);
    const saved = new TextEncoder().encode(savedPassword);
    let difference = submitted.length ^ saved.length;
    const length = Math.max(submitted.length, saved.length);
    for (let index = 0; index < length; index += 1) {
      difference |= (submitted[index] ?? 0) ^ (saved[index] ?? 0);
    }
    return difference === 0;
  } catch {
    return false;
  }
}
