import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../src/config/Config.js";
import { describeEffectiveCrypto } from "../../src/config/EffectiveConfig.js";

const SECRET_ID = "parmana-prod/secondary-key-SECRETVALUE";

describe("describeEffectiveCrypto", () => {
  beforeEach(() => {
    vi.stubEnv("PARMANA_POLICY_DIR", "/tmp/parmana-policies");
    vi.stubEnv("PARMANA_KEY_DIR", "/tmp/parmana-keys");
    vi.stubEnv("CRYPTO_MODE", "single");
    vi.stubEnv("PRIMARY_SIGNATURE_PROVIDER", "ed25519");
    vi.stubEnv("SECONDARY_SIGNATURE_PROVIDER", "");
    vi.stubEnv("KEY_PROVIDER", "local");
    vi.stubEnv("PARMANA_HYBRID_KMS", "");
    vi.stubEnv("PARMANA_SECONDARY_KEY_SECRET_ID", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports single mode with no secondary key source", () => {
    const summary = describeEffectiveCrypto(loadConfig());
    expect(summary.cryptoMode).toBe("single");
    expect(summary.secondarySignatureProvider).toBeNull();
    expect(summary.secondaryKeySource).toBe("none");
    expect(summary.keyProvider).toBe("local");
    expect(summary.hybridKmsPrimary).toBe(false);
  });

  it("reports the secondary key from a file when hybrid has no secret", () => {
    vi.stubEnv("CRYPTO_MODE", "hybrid");
    vi.stubEnv("SECONDARY_SIGNATURE_PROVIDER", "dilithium3");
    const summary = describeEffectiveCrypto(loadConfig());
    expect(summary.cryptoMode).toBe("hybrid");
    expect(summary.secondarySignatureProvider).toBe("dilithium3");
    expect(summary.secondaryKeySource).toBe("file");
  });

  it("reports the secondary key from a secret without showing the secret's name", () => {
    vi.stubEnv("CRYPTO_MODE", "hybrid");
    vi.stubEnv("SECONDARY_SIGNATURE_PROVIDER", "dilithium3");
    vi.stubEnv("PARMANA_SECONDARY_KEY_SECRET_ID", SECRET_ID);
    const summary = describeEffectiveCrypto(loadConfig());
    expect(summary.secondaryKeySource).toBe("secret");
    expect(JSON.stringify(summary)).not.toContain(SECRET_ID);
    expect(JSON.stringify(summary)).not.toContain("SECRETVALUE");
  });

  it("reports the KMS primary flag", () => {
    vi.stubEnv("KEY_PROVIDER", "aws-kms");
    vi.stubEnv("PARMANA_HYBRID_KMS", "true");
    const summary = describeEffectiveCrypto(loadConfig());
    expect(summary.keyProvider).toBe("aws-kms");
    expect(summary.hybridKmsPrimary).toBe(true);
  });

  it("contains only the documented fields, and no key material or ARNs", () => {
    vi.stubEnv("CRYPTO_MODE", "hybrid");
    vi.stubEnv("SECONDARY_SIGNATURE_PROVIDER", "dilithium3");
    vi.stubEnv("PARMANA_SECONDARY_KEY_SECRET_ID", SECRET_ID);
    const summary = describeEffectiveCrypto(loadConfig());
    expect(Object.keys(summary).sort()).toEqual(
      [
        "cryptoMode",
        "hybridKmsPrimary",
        "hybridSchemaVersion",
        "hybridSignatureRequired",
        "keyProvider",
        "primarySignatureProvider",
        "secondaryKeySource",
        "secondarySignatureProvider",
      ].sort(),
    );
    expect(JSON.stringify(summary)).not.toMatch(/arn:|BEGIN|PRIVATE/);
  });
});
