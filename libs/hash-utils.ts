import { createHash, safeStringify } from "../deps/std-hash.ts";

export function stableHash(value: unknown): string {
  return createHash("md5")
    .update(
      safeStringify.stableStringify(value),
    )
    .toString();
}
