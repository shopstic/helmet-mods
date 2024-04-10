import originalStableHash from "https://esm.sh/stable-hash@0.0.2?pin=v135";
import { crypto } from "@std/crypto/crypto";
import { encodeHex } from "@std/encoding/hex";

export function stableHash(obj: unknown) {
  return encodeHex(crypto.subtle.digestSync("SHA-256", new TextEncoder().encode(originalStableHash(obj))));
}
