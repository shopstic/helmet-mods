import { createHash, safeStringify } from "../deps/std_hash.ts";

export function stableHash(value: unknown): string {
  return createHash("md5")
    .update(
      safeStringify.stableStringify(value),
    )
    .toString();
}
