import originalStableHash from "https://esm.sh/stable-hash@0.0.2?pin=v106";
import { crypto } from "https://deno.land/std@0.205.0/crypto/crypto.ts";
import { encodeHex } from "https://deno.land/std@0.205.0/encoding/hex.ts";

export function stableHash(obj: unknown) {
  return encodeHex(crypto.subtle.digestSync("SHA-256", new TextEncoder().encode(originalStableHash(obj))));
}
