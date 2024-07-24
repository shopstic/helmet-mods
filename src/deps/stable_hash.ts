import originalStableHash from "stable-hash";
import { crypto } from "@std/crypto";
import { encodeHex } from "@std/encoding";

export function stableHash(obj: unknown) {
  // deno-lint-ignore no-explicit-any
  return encodeHex(crypto.subtle.digestSync("SHA-256", new TextEncoder().encode((originalStableHash as any)(obj))));
}
