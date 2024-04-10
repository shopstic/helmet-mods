import originalStableHash from "npm:stable-hash@0.0.4";
import { crypto } from "jsr:@std/crypto@^0.221.0/crypto";
import { encodeHex } from "jsr:@std/encoding@^0.221.0/hex";

export function stableHash(obj: unknown) {
  // deno-lint-ignore no-explicit-any
  return encodeHex(crypto.subtle.digestSync("SHA-256", new TextEncoder().encode((originalStableHash as any)(obj))));
}
