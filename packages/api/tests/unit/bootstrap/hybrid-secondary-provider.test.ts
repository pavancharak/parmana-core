import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertSigningKeyMaterialConfigured } from "../../../src/bootstrap/assertSigningKeyMaterialConfigured.js";

// The check runs before the port is bound. Hybrid mode without a secondary
// signature provider released actions and then could not sign their records.
describe("assertSigningKeyMaterialConfigured with CRYPTO_MODE=hybrid", () => {
  beforeEach(() => {
    // The startup assertion is skipped under NODE_ENV=test (vitest sets it),
    // so run it as a non-test process.
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CRYPTO_MODE", "hybrid");
    vi.stubEnv("KEY_PROVIDER", "local");
    vi.stubEnv("PRIMARY_SIGNATURE_PROVIDER", "ed25519");
    vi.stubEnv("SECONDARY_SIGNATURE_PROVIDER", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses to start when SECONDARY_SIGNATURE_PROVIDER is not set", () => {
    vi.stubEnv("SECONDARY_SIGNATURE_PROVIDER", "");
    expect(() => assertSigningKeyMaterialConfigured()).toThrow(
      /requires SECONDARY_SIGNATURE_PROVIDER/,
    );
  });

  it("refuses a secondary provider equal to the primary", () => {
    vi.stubEnv("SECONDARY_SIGNATURE_PROVIDER", "ed25519");
    expect(() => assertSigningKeyMaterialConfigured()).toThrow(/must differ/);
  });
});
