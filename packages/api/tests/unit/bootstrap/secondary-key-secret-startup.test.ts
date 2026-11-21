import { generateKeyPairSync } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertSecondaryKeySecretReachable } from "../../../src/bootstrap/assertSigningKeyMaterialConfigured.js";

const SECRET_ID = "parmana/test/secondary-key";

function mlDsaPem(): string {
  const { privateKey } = generateKeyPairSync("ml-dsa-65");
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function ed25519Pem(): string {
  const { privateKey } = generateKeyPairSync("ed25519");
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

// The startup check for the secondary key secret (F26). The reader is injected,
// so these tests never call AWS.
describe("assertSecondaryKeySecretReachable", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PARMANA_SECONDARY_KEY_SECRET_ID", SECRET_ID);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does nothing when no secret is configured, and does not read one", async () => {
    vi.stubEnv("PARMANA_SECONDARY_KEY_SECRET_ID", "");
    const read = vi.fn(async () => mlDsaPem());
    await expect(
      assertSecondaryKeySecretReachable(read),
    ).resolves.toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });

  it("accepts a dilithium3 (ML-DSA-65) private key in PEM form", async () => {
    const read = vi.fn(async () => mlDsaPem());
    await expect(
      assertSecondaryKeySecretReachable(read),
    ).resolves.toBeUndefined();
    expect(read).toHaveBeenCalledWith(SECRET_ID);
  });

  it("refuses to start when the secret cannot be read, and keeps the cause", async () => {
    const cause = new Error("AccessDeniedException");
    const read = vi.fn(async () => {
      throw cause;
    });
    const error = await assertSecondaryKeySecretReachable(read).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(SECRET_ID);
    expect((error as Error).message).toContain("could not be read");
    expect((error as Error & { cause?: unknown }).cause).toBe(cause);
  });

  it("refuses a secret that is not a PEM private key, without echoing it", async () => {
    const notAKey = "not-a-pem-value-SECRET-MATERIAL";
    const read = vi.fn(async () => notAKey);
    const error = (await assertSecondaryKeySecretReachable(read).catch(
      (e: unknown) => e,
    )) as Error;
    expect(error.message).toContain("does not hold a private key in PEM");
    expect(error.message).not.toContain(notAKey);
  });

  it("refuses an ed25519 key, because the secondary key must be dilithium3", async () => {
    const read = vi.fn(async () => ed25519Pem());
    const error = (await assertSecondaryKeySecretReachable(read).catch(
      (e: unknown) => e,
    )) as Error;
    expect(error.message).toContain("holds a ed25519 key");
    expect(error.message).toContain("dilithium3");
    expect(error.message).not.toContain("BEGIN PRIVATE KEY");
  });
});
