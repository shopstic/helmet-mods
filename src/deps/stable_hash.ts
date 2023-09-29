import originStableHash from "https://esm.sh/stable-hash@0.0.2?pin=v106";
import { crypto } from "https://deno.land/std@0.202.0/crypto/crypto.ts";
import { toHashString } from "https://deno.land/std@0.202.0/crypto/to_hash_string.ts";

export function stableHash(obj: unknown) {
  return toHashString(crypto.subtle.digestSync("SHA-256", new TextEncoder().encode(originStableHash(obj))));
}
