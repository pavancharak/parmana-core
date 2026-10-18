import {
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VerificationCrypto } from "../../src/VerificationCrypto.js";

/**
 * G-52: VerificationCrypto.probeSigning() proves the evidence signing path
 * works before an action is released.
 */
describe("VerificationCrypto.probeSigning", () => {
  const ENV_NAMES = [
    "PARMANA_KEY_DIR",
    "PARMANA_POLICY_DIR",
    "PARMANA_VERIFICATION_KEY_ID",
    "KEY_PROVIDER",
  ] as const;

  const original: Record<string, string | undefined> = {};

  let dir: string;

  beforeEach(() => {
    for (const name of ENV_NAMES) original[name] = process.env[name];

    dir = mkdtempSync(path.join(tmpdir(), "parmana-probe-"));
    process.env.PARMANA_KEY_DIR = dir;
    process.env.PARMANA_POLICY_DIR = dir;
    process.env.PARMANA_VERIFICATION_KEY_ID = "probe-key";
    delete process.env.KEY_PROVIDER;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });

    for (const name of ENV_NAMES) {
      const value = original[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  function writeKeyFiles(publicKey: KeyObject, privateKey: KeyObject): void {
    writeFileSync(
      path.join(dir, "probe-key.private.pem"),
      privateKey.export({ format: "pem", type: "pkcs8" }),
    );

    writeFileSync(
      path.join(dir, "probe-key.public.pem"),
      publicKey.export({ format: "pem", type: "spki" }),
    );
  }

  it("resolves when the signing key is present and its public key matches", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    writeKeyFiles(createPublicKey(privateKey), privateKey);

    await expect(new VerificationCrypto().probeSigning()).resolves.toBe(
      undefined,
    );
  });

  it("rejects when the signing key is missing", async () => {
    await expect(new VerificationCrypto().probeSigning()).rejects.toThrow();
  });

  it("rejects when the published public key does not match the signing key", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const unrelated = generateKeyPairSync("ed25519");
    writeKeyFiles(unrelated.publicKey, privateKey);

    await expect(new VerificationCrypto().probeSigning()).rejects.toThrow(
      /did not verify/,
    );
  });
});
