import { generateKeyPairSync } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
  parseApiKeys,
  parseCryptoMode,
  parseSecretsProvider,
  parseSignatureAlgorithm,
  parseStorageProvider,
} from "../../src/config/ConfigValidation.js";
import { isPostgresStorage } from "../../src/config/StorageProviders.js";

describe("parseSignatureAlgorithm", () => {
  it("defaults to ed25519 when unset", () => {
    expect(parseSignatureAlgorithm(undefined)).toBe("ed25519");
  });

  it("accepts the canonical 'dilithium3' identifier unchanged", () => {
    expect(parseSignatureAlgorithm("dilithium3")).toBe("dilithium3");
  });

  it("accepts 'ml-dsa-65' as an alias resolving to the canonical 'dilithium3' identifier", () => {
    expect(parseSignatureAlgorithm("ml-dsa-65")).toBe("dilithium3");
  });

  it("throws naming the invalid value for an unrecognized algorithm", () => {
    expect(() => parseSignatureAlgorithm("rsa")).toThrow(
      "Invalid SIGNATURE_PROVIDER: rsa",
    );
  });
});

describe("parseCryptoMode", () => {
  it("selects the mode named by CRYPTO_MODE", () => {
    expect(parseCryptoMode("single")).toBe("single");
    expect(parseCryptoMode("hybrid")).toBe("hybrid");
    expect(parseCryptoMode("pq")).toBe("pq");
  });

  it("defaults to single when CRYPTO_MODE is unset", () => {
    expect(parseCryptoMode(undefined)).toBe("single");
  });

  it("throws naming the invalid value for an unrecognized CRYPTO_MODE", () => {
    expect(() => parseCryptoMode("quantum")).toThrow(
      "Invalid CRYPTO_MODE: quantum",
    );
  });
});

describe("parseStorageProvider", () => {
  afterEach(() => {
    delete process.env.DATABASE_PROVIDER;
  });

  it("selects the provider named by PARMANA_STORAGE", () => {
    expect(parseStorageProvider("memory")).toBe("memory");
    expect(parseStorageProvider("supabase")).toBe("supabase");
    expect(parseStorageProvider("postgres")).toBe("postgres");
  });

  it("defaults to memory when PARMANA_STORAGE is unset", () => {
    expect(parseStorageProvider(undefined)).toBe("memory");
  });

  it("throws naming the invalid value for an unrecognized PARMANA_STORAGE", () => {
    expect(() => parseStorageProvider("sqlite")).toThrow(
      "Invalid PARMANA_STORAGE: sqlite",
    );
  });

  it("does not echo an invalid PARMANA_SECRETS_PROVIDER value, which may be a real secret", () => {
    const pasted = "sk_live_not_a_provider_name";

    expect(() => parseSecretsProvider(pasted)).toThrow(
      /^Invalid PARMANA_SECRETS_PROVIDER: expected one of /,
    );
    expect(() => parseSecretsProvider(pasted)).not.toThrow(pasted);
  });

  it("fails at startup naming the replacement when the retired DATABASE_PROVIDER is present", () => {
    process.env.DATABASE_PROVIDER = "supabase";

    expect(() => parseStorageProvider("memory")).toThrow(
      "DATABASE_PROVIDER is no longer read; set PARMANA_STORAGE instead.",
    );
  });
});

describe("isPostgresStorage (G-57)", () => {
  it("is true for postgres and supabase, which select the same Postgres storage", () => {
    expect(isPostgresStorage("postgres")).toBe(true);
    expect(isPostgresStorage("supabase")).toBe(true);
  });

  it("is false for memory, unset and unknown names", () => {
    expect(isPostgresStorage("memory")).toBe(false);
    expect(isPostgresStorage(undefined)).toBe(false);
    expect(isPostgresStorage("sqlite")).toBe(false);
  });
});

describe("parseApiKeys", () => {
  const validHash = "a".repeat(64);
  const otherHash = "b".repeat(64);

  it("returns an empty array when PARMANA_API_KEYS is unset", () => {
    expect(parseApiKeys(undefined)).toEqual([]);
  });

  it("returns an empty array when PARMANA_API_KEYS is blank", () => {
    expect(parseApiKeys("  ")).toEqual([]);
  });

  it("parses a single well-formed entry", () => {
    expect(
      parseApiKeys(
        JSON.stringify([{ callerId: "caller-1", keyHash: validHash }]),
      ),
    ).toEqual([{ callerId: "caller-1", keyHash: validHash }]);
  });

  it("parses multiple entries, including repeated callerIds for rotation", () => {
    expect(
      parseApiKeys(
        JSON.stringify([
          { callerId: "caller-1", keyHash: validHash },
          { callerId: "caller-1", keyHash: otherHash },
        ]),
      ),
    ).toEqual([
      { callerId: "caller-1", keyHash: validHash },
      { callerId: "caller-1", keyHash: otherHash },
    ]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseApiKeys("not json")).toThrow(
      "PARMANA_API_KEYS is not valid JSON",
    );
  });

  it("throws when the value is not a JSON array", () => {
    expect(() =>
      parseApiKeys(
        JSON.stringify({ callerId: "caller-1", keyHash: validHash }),
      ),
    ).toThrow("PARMANA_API_KEYS must be a JSON array");
  });

  it("throws naming the index of an entry missing callerId", () => {
    expect(() =>
      parseApiKeys(JSON.stringify([{ keyHash: validHash }])),
    ).toThrow("PARMANA_API_KEYS[0] is invalid");
  });

  it("throws naming the index of an entry with a malformed keyHash", () => {
    expect(() =>
      parseApiKeys(
        JSON.stringify([{ callerId: "caller-1", keyHash: "too-short" }]),
      ),
    ).toThrow("PARMANA_API_KEYS[0] is invalid");
  });

  it("throws on an empty callerId", () => {
    expect(() =>
      parseApiKeys(JSON.stringify([{ callerId: "", keyHash: validHash }])),
    ).toThrow("PARMANA_API_KEYS[0] is invalid");
  });

  it("parses allowedCapabilities when present", () => {
    expect(
      parseApiKeys(
        JSON.stringify([
          {
            callerId: "caller-1",
            keyHash: validHash,
            allowedCapabilities: [
              "razorpay:refund-create",
              "razorpay:refund-fetch",
            ],
          },
        ]),
      ),
    ).toEqual([
      {
        callerId: "caller-1",
        keyHash: validHash,
        allowedCapabilities: [
          "razorpay:refund-create",
          "razorpay:refund-fetch",
        ],
      },
    ]);
  });

  it('accepts the "*" wildcard as an ordinary allowedCapabilities entry', () => {
    expect(
      parseApiKeys(
        JSON.stringify([
          {
            callerId: "caller-1",
            keyHash: validHash,
            allowedCapabilities: ["*"],
          },
        ]),
      ),
    ).toEqual([
      { callerId: "caller-1", keyHash: validHash, allowedCapabilities: ["*"] },
    ]);
  });

  it("omits allowedCapabilities from the parsed entry when absent", () => {
    const [parsed] = parseApiKeys(
      JSON.stringify([{ callerId: "caller-1", keyHash: validHash }]),
    );

    expect(parsed.allowedCapabilities).toBeUndefined();
  });

  it("throws naming the index of an entry with a non-array allowedCapabilities", () => {
    expect(() =>
      parseApiKeys(
        JSON.stringify([
          {
            callerId: "caller-1",
            keyHash: validHash,
            allowedCapabilities: "razorpay:refund-create",
          },
        ]),
      ),
    ).toThrow("PARMANA_API_KEYS[0].allowedCapabilities must be an array");
  });

  it("parses allowedTenantIds when present", () => {
    const [entry] = parseApiKeys(
      JSON.stringify([
        {
          callerId: "caller-1",
          keyHash: validHash,
          allowedTenantIds: ["acme"],
        },
      ]),
    );

    expect(entry?.allowedTenantIds).toEqual(["acme"]);
  });

  it("throws naming the index of an entry with an invalid allowedTenantIds", () => {
    expect(() =>
      parseApiKeys(
        JSON.stringify([
          {
            callerId: "caller-1",
            keyHash: validHash,
            allowedTenantIds: ["acme", ""],
          },
        ]),
      ),
    ).toThrow("PARMANA_API_KEYS[0].allowedTenantIds must be an array");
  });

  it("throws naming the index of an entry with an empty-string allowedCapabilities entry", () => {
    expect(() =>
      parseApiKeys(
        JSON.stringify([
          {
            callerId: "caller-1",
            keyHash: validHash,
            allowedCapabilities: ["razorpay:refund-create", ""],
          },
        ]),
      ),
    ).toThrow("PARMANA_API_KEYS[0].allowedCapabilities must be an array");
  });

  it("parses credentialHolderType when present", () => {
    expect(
      parseApiKeys(
        JSON.stringify([
          {
            callerId: "caller-1",
            keyHash: validHash,
            credentialHolderType: "USER",
          },
        ]),
      ),
    ).toEqual([
      {
        callerId: "caller-1",
        keyHash: validHash,
        credentialHolderType: "USER",
      },
    ]);
  });

  it("omits credentialHolderType from the parsed entry when absent", () => {
    const [parsed] = parseApiKeys(
      JSON.stringify([{ callerId: "caller-1", keyHash: validHash }]),
    );

    expect(parsed.credentialHolderType).toBeUndefined();
  });

  it("throws naming the index of an entry with an invalid credentialHolderType", () => {
    expect(() =>
      parseApiKeys(
        JSON.stringify([
          {
            callerId: "caller-1",
            keyHash: validHash,
            credentialHolderType: "HUMAN",
          },
        ]),
      ),
    ).toThrow("PARMANA_API_KEYS[0].credentialHolderType must be one of");
  });

  it("parses a valid PEM-encoded Ed25519 stepUpPublicKey", () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const stepUpPublicKey = publicKey
      .export({ format: "pem", type: "spki" })
      .toString();

    const [parsed] = parseApiKeys(
      JSON.stringify([
        { callerId: "caller-1", keyHash: validHash, stepUpPublicKey },
      ]),
    );

    expect(parsed.stepUpPublicKey).toBe(stepUpPublicKey);
  });

  it("omits stepUpPublicKey from the parsed entry when absent", () => {
    const [parsed] = parseApiKeys(
      JSON.stringify([{ callerId: "caller-1", keyHash: validHash }]),
    );

    expect(parsed.stepUpPublicKey).toBeUndefined();
  });

  it("throws naming the index of an entry whose stepUpPublicKey is not valid PEM", () => {
    expect(() =>
      parseApiKeys(
        JSON.stringify([
          {
            callerId: "caller-1",
            keyHash: validHash,
            stepUpPublicKey: "not-a-pem-key",
          },
        ]),
      ),
    ).toThrow(
      "PARMANA_API_KEYS[0].stepUpPublicKey must be a PEM-encoded Ed25519 public key",
    );
  });

  it("throws naming the index of an entry whose stepUpPublicKey is a non-Ed25519 key", () => {
    const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const rsaPem = publicKey.export({ format: "pem", type: "spki" }).toString();

    expect(() =>
      parseApiKeys(
        JSON.stringify([
          { callerId: "caller-1", keyHash: validHash, stepUpPublicKey: rsaPem },
        ]),
      ),
    ).toThrow(
      "PARMANA_API_KEYS[0].stepUpPublicKey must be a PEM-encoded Ed25519 public key",
    );
  });
});
