import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ExecutionIntent } from "@parmana/shared";

import { ArtifactSigner } from "../../src/ArtifactSigner.js";
import { canonicalExecutionIntent } from "../../src/ExecutionIntentCanonicalView.js";
import { ExecutionIntentCrypto } from "../../src/ExecutionIntentCrypto.js";
import { verifyExecutionIntentOffline } from "../../src/OfflineVerifier.js";
import { SignerBootstrap } from "../../src/SignerBootstrap.js";
import { TrustRecordHasher } from "../../src/TrustRecordHasher.js";
import { SHA256HashProvider } from "../../src/providers/hash/SHA256HashProvider.js";
import { Ed25519SignatureProvider } from "../../src/providers/signature/Ed25519SignatureProvider.js";

/**
 * ADR-0012: an Execution Intent verifies offline with only the intent and the
 * public key, and the offline verifier agrees with the signer the runtime uses.
 * Keys in the first group are generated in memory and passed as PEM strings,
 * exactly as an external auditor holding a published public key would do.
 */
function draftIntent(): Omit<ExecutionIntent, "intentHash" | "signature"> {
  return {
    intentId: "intent-1",
    businessTransactionId: "tx-1",
    decisionId: "decision-1",
    authorizationId: "authorization-1",
    policyName: "customer-refund",
    policyVersion: "1.0.0",
    policyContentHash: "policy-hash",
    signalsHash: "signals-hash",
    businessTransactionHash: "content-hash",
    action: "paytm:refund",
    target: "paytm://orders/1",
    submittedBy: "caller-1",
    createdAt: new Date("2026-09-21T00:00:00.000Z"),
  };
}

const algorithms = {
  hash: new SHA256HashProvider(),
  signature: new Ed25519SignatureProvider(),
};

async function signedIntent(
  privateKey: ReturnType<typeof generateKeyPairSync<"ed25519">>["privateKey"],
  keyId: string,
): Promise<ExecutionIntent> {
  const draft = draftIntent();

  const withoutSignature = {
    ...draft,
    intentHash: "",
    signature: {
      algorithm: "ed25519" as const,
      keyId,
      value: "",
      signedAt: draft.createdAt,
    },
  } as ExecutionIntent;

  const intentHash = await new TrustRecordHasher(algorithms).hash(
    canonicalExecutionIntent(withoutSignature),
  );

  const value = await new ArtifactSigner(algorithms).sign(
    canonicalExecutionIntent(withoutSignature),
    privateKey,
  );

  return {
    ...withoutSignature,
    intentHash,
    signature: { ...withoutSignature.signature, value },
  };
}

describe("verifyExecutionIntentOffline", () => {
  it("verifies a genuine intent with no network, disk or environment access", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const pem = publicKey.export({ format: "pem", type: "spki" }).toString();

    const result = await verifyExecutionIntentOffline(
      await signedIntent(privateKey, "offline-key"),
      { "offline-key": pem },
    );

    expect(result).toMatchObject({
      valid: true,
      hashValid: true,
      legacySignatureValid: true,
      errors: [],
    });
    expect(result.algorithmsChecked).toContain("ed25519");
  });

  it("still verifies after a JSON round trip, which is how an auditor receives it", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const pem = publicKey.export({ format: "pem", type: "spki" }).toString();

    const received = JSON.parse(
      JSON.stringify(await signedIntent(privateKey, "offline-key")),
    ) as ExecutionIntent;

    expect(
      (await verifyExecutionIntentOffline(received, { "offline-key": pem }))
        .valid,
    ).toBe(true);
  });

  it.each([
    ["action", { action: "paytm:cancel" }],
    ["target", { target: "paytm://orders/2" }],
    ["authorizationId", { authorizationId: "authorization-2" }],
    ["businessTransactionHash", { businessTransactionHash: "other-hash" }],
    ["policyVersion", { policyVersion: "2.0.0" }],
  ])(
    "reports both the hash and the signature as failed when %s is altered",
    async (_field, change) => {
      const { privateKey, publicKey } = generateKeyPairSync("ed25519");
      const pem = publicKey.export({ format: "pem", type: "spki" }).toString();

      const tampered = {
        ...(await signedIntent(privateKey, "offline-key")),
        ...change,
      } as ExecutionIntent;

      const result = await verifyExecutionIntentOffline(tampered, {
        "offline-key": pem,
      });

      expect(result.valid).toBe(false);
      expect(result.hashValid).toBe(false);
      expect(result.legacySignatureValid).toBe(false);
    },
  );

  it("fails against a different public key", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const other = generateKeyPairSync("ed25519")
      .publicKey.export({ format: "pem", type: "spki" })
      .toString();

    const result = await verifyExecutionIntentOffline(
      await signedIntent(privateKey, "offline-key"),
      { "offline-key": other },
    );

    expect(result.valid).toBe(false);
    expect(result.hashValid).toBe(true);
    expect(result.legacySignatureValid).toBe(false);
  });

  it("says so when no public key was supplied for the keyId", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");

    const result = await verifyExecutionIntentOffline(
      await signedIntent(privateKey, "offline-key"),
      {},
    );

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain(
      'no public key supplied for keyId "offline-key"',
    );
  });
});

describe("ExecutionIntentCrypto and the offline verifier agree", () => {
  it("verifies, with only the public key, an intent signed by the runtime's own signer", async () => {
    const crypto = new ExecutionIntentCrypto();

    const draft = {
      ...draftIntent(),
      intentHash: "",
      signature: {
        algorithm: "ed25519" as const,
        keyId: "default",
        value: "",
        signedAt: draftIntent().createdAt,
      },
    } as ExecutionIntent;

    const withHash = { ...draft, intentHash: await crypto.hash(draft) };
    const signature = await crypto.sign(withHash);
    const intent: ExecutionIntent = { ...withHash, signature };

    const signer = await SignerBootstrap.create();
    const publicKey = await signer.getPublicKey(signature.keyId);
    const pem = publicKey.export({ format: "pem", type: "spki" }).toString();

    expect(await crypto.verify(intent)).toBe(true);

    const offline = await verifyExecutionIntentOffline(
      JSON.parse(JSON.stringify(intent)) as ExecutionIntent,
      { [signature.keyId]: pem },
    );

    expect(offline.valid).toBe(true);
  });
});
