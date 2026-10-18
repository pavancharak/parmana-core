import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertSigningKeyMaterialConfigured } from "../../../src/bootstrap/assertSigningKeyMaterialConfigured.js";

const ENV_KEYS = [
  "NODE_ENV",
  "PARMANA_KEY_DIR",
  "PARMANA_KEY_MATERIAL_JSON",
  "KEY_PROVIDER",
  "CRYPTO_MODE",
  "SECONDARY_SIGNATURE_PROVIDER",
] as const;

describe("assertSigningKeyMaterialConfigured", () => {
  const original = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "parmana-key-test-"));
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("is a no-op when NODE_ENV=test, regardless of key material presence", () => {
    process.env.NODE_ENV = "test";
    process.env.PARMANA_KEY_DIR = join(tempDir, "does-not-exist");

    expect(() => assertSigningKeyMaterialConfigured()).not.toThrow();
  });

  it("refuses to start when PARMANA_KEY_DIR is unset", () => {
    process.env.NODE_ENV = "production";
    delete process.env.PARMANA_KEY_DIR;

    expect(() => assertSigningKeyMaterialConfigured()).toThrow(
      /PARMANA_KEY_DIR is not set/,
    );
  });

  it("refuses to start when PARMANA_KEY_DIR is blank", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_KEY_DIR = "   ";

    expect(() => assertSigningKeyMaterialConfigured()).toThrow(
      /PARMANA_KEY_DIR is not set/,
    );
  });

  it("fails closed with a named, actionable error when the default key pair is absent", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_KEY_DIR = tempDir;
    delete process.env.PARMANA_KEY_MATERIAL_JSON;

    expect(() => assertSigningKeyMaterialConfigured()).toThrow(
      /default\.private\.pem/,
    );
    expect(() => assertSigningKeyMaterialConfigured()).toThrow(
      /Refusing to start/,
    );
  });

  it("does not throw when the default key pair already exists on disk", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_KEY_DIR = tempDir;
    delete process.env.PARMANA_KEY_MATERIAL_JSON;

    writeFileSync(
      join(tempDir, "default.private.pem"),
      "-----BEGIN PRIVATE KEY-----\nexisting\n-----END PRIVATE KEY-----\n",
    );
    writeFileSync(
      join(tempDir, "default.public.pem"),
      "-----BEGIN PUBLIC KEY-----\nexisting\n-----END PUBLIC KEY-----\n",
    );

    expect(() => assertSigningKeyMaterialConfigured()).not.toThrow();
  });

  it("materializes key material from PARMANA_KEY_MATERIAL_JSON when the key directory is empty", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_KEY_DIR = join(tempDir, "materialized");
    process.env.PARMANA_KEY_MATERIAL_JSON = JSON.stringify({
      default: {
        privateKeyPem:
          "-----BEGIN PRIVATE KEY-----\nfrom-env\n-----END PRIVATE KEY-----\n",
        publicKeyPem:
          "-----BEGIN PUBLIC KEY-----\nfrom-env\n-----END PUBLIC KEY-----\n",
      },
    });

    expect(() => assertSigningKeyMaterialConfigured()).not.toThrow();

    const privateContent = readFileSync(
      join(tempDir, "materialized", "default.private.pem"),
      "utf8",
    );
    expect(privateContent).toContain("from-env");
  });

  it("never overwrites a pre-mounted key file with PARMANA_KEY_MATERIAL_JSON's value", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_KEY_DIR = tempDir;
    writeFileSync(
      join(tempDir, "default.private.pem"),
      "-----BEGIN PRIVATE KEY-----\nmounted\n-----END PRIVATE KEY-----\n",
    );
    writeFileSync(
      join(tempDir, "default.public.pem"),
      "-----BEGIN PUBLIC KEY-----\nmounted\n-----END PUBLIC KEY-----\n",
    );
    process.env.PARMANA_KEY_MATERIAL_JSON = JSON.stringify({
      default: {
        privateKeyPem:
          "-----BEGIN PRIVATE KEY-----\nfrom-env\n-----END PRIVATE KEY-----\n",
        publicKeyPem:
          "-----BEGIN PUBLIC KEY-----\nfrom-env\n-----END PUBLIC KEY-----\n",
      },
    });

    expect(() => assertSigningKeyMaterialConfigured()).not.toThrow();

    const privateContent = readFileSync(
      join(tempDir, "default.private.pem"),
      "utf8",
    );
    expect(privateContent).toContain("mounted");
    expect(privateContent).not.toContain("from-env");
  });

  it("fails closed with a named, actionable error when PARMANA_KEY_MATERIAL_JSON is not valid JSON", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_KEY_DIR = tempDir;
    process.env.PARMANA_KEY_MATERIAL_JSON = "{not valid json";

    expect(() => assertSigningKeyMaterialConfigured()).toThrow(
      /not valid JSON/,
    );
  });

  it("fails closed with a named, actionable error when an entry is malformed", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_KEY_DIR = tempDir;
    process.env.PARMANA_KEY_MATERIAL_JSON = JSON.stringify({
      default: { privateKeyPem: 123 },
    });

    expect(() => assertSigningKeyMaterialConfigured()).toThrow(/privateKeyPem/);
  });

  it("still materializes a non-default key (e.g. the gateway attestation key) from PARMANA_KEY_MATERIAL_JSON when KEY_PROVIDER=aws-kms", () => {
    // Regression test: KEY_PROVIDER=aws-kms moves only the "default"
    // signing key's custody to KMS. It must not skip materializing
    // other keyIds this env var carries -- e.g. "gateway", the
    // separate attestation key createGatewayKeyPair.ts still reads
    // from local disk regardless of KEY_PROVIDER. Returning early
    // before materializeFromEnvIfConfigured() ran (this function's
    // original shape) silently skipped "gateway" too, which crashed
    // every request in production the moment KEY_PROVIDER=aws-kms
    // was set (2026-09-15).
    process.env.NODE_ENV = "production";
    process.env.KEY_PROVIDER = "aws-kms";
    process.env.PARMANA_KEY_DIR = join(tempDir, "materialized");
    process.env.PARMANA_KEY_MATERIAL_JSON = JSON.stringify({
      gateway: {
        privateKeyPem:
          "-----BEGIN PRIVATE KEY-----\ngateway-from-env\n-----END PRIVATE KEY-----\n",
        publicKeyPem:
          "-----BEGIN PUBLIC KEY-----\ngateway-from-env\n-----END PUBLIC KEY-----\n",
      },
    });

    expect(() => assertSigningKeyMaterialConfigured()).not.toThrow();

    const privateContent = readFileSync(
      join(tempDir, "materialized", "gateway.private.pem"),
      "utf8",
    );
    expect(privateContent).toContain("gateway-from-env");
  });

  it("does not require a local default.private.pem when KEY_PROVIDER=aws-kms", () => {
    process.env.NODE_ENV = "production";
    process.env.KEY_PROVIDER = "aws-kms";
    process.env.PARMANA_KEY_DIR = tempDir;
    delete process.env.PARMANA_KEY_MATERIAL_JSON;

    expect(() => assertSigningKeyMaterialConfigured()).not.toThrow();
  });

  function writeKeyPair(keyId: string): void {
    writeFileSync(join(tempDir, `${keyId}.private.pem`), "private");
    writeFileSync(join(tempDir, `${keyId}.public.pem`), "public");
  }

  it("refuses CRYPTO_MODE=hybrid with KEY_PROVIDER=aws-kms, whose hybrid signatures would need a local copy of the KMS key", () => {
    process.env.NODE_ENV = "production";
    process.env.KEY_PROVIDER = "aws-kms";
    process.env.CRYPTO_MODE = "hybrid";
    process.env.SECONDARY_SIGNATURE_PROVIDER = "dilithium3";
    process.env.PARMANA_KEY_DIR = tempDir;
    delete process.env.PARMANA_KEY_MATERIAL_JSON;

    expect(() => assertSigningKeyMaterialConfigured()).toThrow(
      /CRYPTO_MODE=hybrid is not supported with KEY_PROVIDER=aws-kms/,
    );
  });

  it("refuses CRYPTO_MODE=hybrid at startup when the secondary key pair is missing", () => {
    process.env.NODE_ENV = "production";
    process.env.KEY_PROVIDER = "local";
    process.env.CRYPTO_MODE = "hybrid";
    process.env.SECONDARY_SIGNATURE_PROVIDER = "dilithium3";
    process.env.PARMANA_KEY_DIR = tempDir;
    delete process.env.PARMANA_KEY_MATERIAL_JSON;
    writeKeyPair("default");

    expect(() => assertSigningKeyMaterialConfigured()).toThrow(
      /"default-secondary"/,
    );
  });

  it("starts in CRYPTO_MODE=hybrid when both key pairs are present", () => {
    process.env.NODE_ENV = "production";
    process.env.KEY_PROVIDER = "local";
    process.env.CRYPTO_MODE = "hybrid";
    process.env.SECONDARY_SIGNATURE_PROVIDER = "dilithium3";
    process.env.PARMANA_KEY_DIR = tempDir;
    delete process.env.PARMANA_KEY_MATERIAL_JSON;
    writeKeyPair("default");
    writeKeyPair("default-secondary");

    expect(() => assertSigningKeyMaterialConfigured()).not.toThrow();
  });
});
