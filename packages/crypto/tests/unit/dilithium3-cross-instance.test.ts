import { generateKeyPairSync } from "node:crypto";

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";

import { tmpdir } from "node:os";

import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isMlDsa65Supported,
  ML_DSA_65_SKIP_REASON,
} from "../../src/support/MlDsaSupport.js";

/**
 * Proves that two INDEPENDENTLY constructed bootstrap stacks
 * (separate CryptoBootstrap singletons, separate FileKeyProvider
 * instances) can sign and verify each other's authorizations when
 * they share only a key directory on disk — the scenario a real
 * signer process and a real receiving process are in.
 *
 * CryptoBootstrap caches its provider in a static class field, so
 * getting two genuinely independent instances within one test file
 * requires vi.resetModules() + a fresh dynamic import between them;
 * otherwise the second "instance" would just reuse the first's
 * cached provider and the test would prove nothing.
 */
describe.skipIf(!isMlDsa65Supported())(
  `Dilithium3 cross-instance signing (R6)${isMlDsa65Supported() ? "" : ` [SKIPPED: ${ML_DSA_65_SKIP_REASON}]`}`,
  () => {
    let keyDir: string;
    let previousPrimarySignatureProvider: string | undefined;
    let previousKeyDir: string | undefined;

    beforeEach(() => {
      keyDir = mkdtempSync(join(tmpdir(), "parmana-dilithium3-keys-"));

      const { privateKey, publicKey } = generateKeyPairSync("ml-dsa-65");

      writeFileSync(
        join(keyDir, "default.private.pem"),
        privateKey.export({ format: "pem", type: "pkcs8" }),
      );

      writeFileSync(
        join(keyDir, "default.public.pem"),
        publicKey.export({ format: "pem", type: "spki" }),
      );

      previousPrimarySignatureProvider = process.env.PRIMARY_SIGNATURE_PROVIDER;
      previousKeyDir = process.env.PARMANA_KEY_DIR;

      process.env.PRIMARY_SIGNATURE_PROVIDER = "dilithium3";
      process.env.PARMANA_KEY_DIR = keyDir;
    });

    afterEach(() => {
      if (previousPrimarySignatureProvider === undefined) {
        delete process.env.PRIMARY_SIGNATURE_PROVIDER;
      } else {
        process.env.PRIMARY_SIGNATURE_PROVIDER =
          previousPrimarySignatureProvider;
      }

      if (previousKeyDir === undefined) {
        delete process.env.PARMANA_KEY_DIR;
      } else {
        process.env.PARMANA_KEY_DIR = previousKeyDir;
      }

      rmSync(keyDir, { recursive: true, force: true });

      vi.resetModules();
    });

    it("signs with one bootstrap instance and verifies with a second, sharing only the key directory", async () => {
      vi.resetModules();

      const signerModule = await import("../../src/index.js");

      const signerCrypto = signerModule.CryptoBootstrap.create();

      expect(signerCrypto.signature.algorithm).toBe("dilithium3");

      const signerKeys = new signerModule.FileKeyProvider();
      const signingKey = await signerKeys.getPrivateKey("default");

      const signer = new signerModule.AuthorizationSigner(signerCrypto);

      const signed = await signer.sign(
        {
          decisionId: "decision-1",
          businessTransactionId: "txn-1",
          policyName: "policy-a",
          policyVersion: "1.0.0",
        },
        signingKey,
        "default",
        60,
      );

      expect(signed.algorithm).toBe("dilithium3");

      //
      // Force a completely fresh module graph: fresh CryptoBootstrap
      // static cache, fresh FileKeyProvider instance. This is the
      // "second freshly-constructed verifier stack" — it shares
      // nothing with the signer above except the key directory.
      //
      vi.resetModules();

      const verifierModule = await import("../../src/index.js");

      expect(verifierModule.CryptoBootstrap).not.toBe(
        signerModule.CryptoBootstrap,
      );

      const verifierCrypto = verifierModule.CryptoBootstrap.create();
      const verifierKeys = new verifierModule.FileKeyProvider();
      const verificationKey = await verifierKeys.getPublicKey("default");

      const verifier = new verifierModule.AuthorizationVerifier(verifierCrypto);

      const result = await verifier.verify(signed, verificationKey);

      expect(result.valid).toBe(true);
      expect(result.checks.signatureVerified).toBe(true);
      expect(result.checks.notExpired).toBe(true);
    });

    it("a tampered payload fails verification across the same two instances", async () => {
      vi.resetModules();
      const signerModule = await import("../../src/index.js");

      const signer = new signerModule.AuthorizationSigner(
        signerModule.CryptoBootstrap.create(),
      );

      const signingKey = await new signerModule.FileKeyProvider().getPrivateKey(
        "default",
      );

      const signed = await signer.sign(
        {
          decisionId: "decision-1",
          businessTransactionId: "txn-1",
          policyName: "policy-a",
          policyVersion: "1.0.0",
        },
        signingKey,
        "default",
        60,
      );

      const tampered = {
        ...signed,
        payload: { ...signed.payload, decisionId: "decision-2" },
      };

      vi.resetModules();
      const verifierModule = await import("../../src/index.js");

      const verifier = new verifierModule.AuthorizationVerifier(
        verifierModule.CryptoBootstrap.create(),
      );

      const verificationKey =
        await new verifierModule.FileKeyProvider().getPublicKey("default");

      const result = await verifier.verify(tampered, verificationKey);

      expect(result.valid).toBe(false);
      expect(result.checks.signatureVerified).toBe(false);
    });
  },
);
