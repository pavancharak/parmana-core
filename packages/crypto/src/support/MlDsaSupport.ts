import { generateKeyPairSync } from "node:crypto";

let cached: boolean | undefined;

/**
 * Detects at runtime whether the current Node/OpenSSL build supports
 * ML-DSA-65 (generateKeyPairSync("ml-dsa-65")). Requires Node >=24 with
 * OpenSSL >=3.5; older runtimes throw synchronously. Cached after the
 * first call since the answer cannot change within a process lifetime.
 */
export function isMlDsa65Supported(): boolean {
  if (cached !== undefined) {
    return cached;
  }

  try {
    generateKeyPairSync("ml-dsa-65");
    cached = true;
  } catch {
    cached = false;
  }

  return cached;
}

export const ML_DSA_65_SKIP_REASON =
  "ml-dsa-65 unsupported on this Node/OpenSSL build (requires Node >=24 with OpenSSL >=3.5)";
