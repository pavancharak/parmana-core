import { afterAll, beforeEach } from "vitest";

const KEYS = ["CRYPTO_MODE", "SECONDARY_SIGNATURE_PROVIDER"] as const;

/**
 * For test files whose assertions are about single-signature behaviour, or about business logic that is not about
 * signing. Clears the hybrid settings before each test, so a run with CRYPTO_MODE=hybrid does not change them. A test
 * that needs hybrid mode sets it itself, after this runs. The original values are restored when the file finishes.
 *
 * Call it once, at the top level of the test file.
 */
export function useSingleSignatureMode(): void {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  beforeEach(() => {
    for (const key of KEYS) delete process.env[key];
  });
  afterAll(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
}
