import originalStableHash from "npm:stable-hash@0.0.2";
import { crypto } from "jsr:@std/crypto@^0.221.0/crypto";
import { encodeHex } from "jsr:@std/encoding@^0.221.0/hex";

export function stableHash(obj: unknown) {
  return encodeHex(crypto.subtle.digestSync("SHA-256", new TextEncoder().encode(originalStableHash(obj))));
}
