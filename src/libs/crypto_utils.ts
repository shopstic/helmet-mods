import { encodeToHex } from "../deps/std_encoding.ts";

/**
 * Do a constant time string comparison. Always compare the complete strings
 * against each other to get a constant time. This method does not short-cut
 * if the two string's length differs.
 */
export function constantTimeCompare(a: string, b: string) {
  const strA = String(a);
  let strB = String(b);
  const lenA = strA.length;
  let result = 0;

  if (lenA !== strB.length) {
    strB = strA;
    result = 1;
  }

  for (let i = 0; i < lenA; i++) {
    result |= strA.charCodeAt(i) ^ strB.charCodeAt(i);
  }

  return result === 0;
}

export async function createWebhookSigner(signingKey: string) {
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  const keyBuf = textEncoder.encode(signingKey);

  const key = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );

  return async (payload: ArrayBufferLike) => {
    const signature = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, payload),
    );

    return `sha256=${textDecoder.decode(encodeToHex(signature))}`;
  };
}
