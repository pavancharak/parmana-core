import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

//
// docs/VERIFICATION-GAPS.md G-48, and item 7 of the 2026-09-15 KMS migration
// troubleshooting guide (in git history) -- the most significant bug found migrating the gateway signing
// key to AWS KMS, and the one that produced the classic "ambiguous
// outcome" failure: a real, legitimate authorization failed
// verification with [signatureVerified, businessTransactionHashMatches,
// nonceUnseen] all false, indistinguishable from a forged request.
//
// Root cause: createExecutionGateway.ts passed an UNCONDITIONAL
// `new FileKeyProvider()` as ExecutionGateway's `keyProvider` option,
// regardless of KEY_PROVIDER. EnvelopeVerifier.resolveKey() uses
// `keyProvider` -- when supplied at all -- to resolve the verification
// key for EVERY authorization, not only tenant-scoped ones. Signing
// went through SignerBootstrap (the real KMS key, under
// KEY_PROVIDER=aws-kms); verification kept resolving a stale local key
// file. Signing key and verifying key silently diverged.
//
// This tutorial reproduces that exact shape -- two DIFFERENT key
// sources, one used to sign and a different one used to verify -- and
// then shows the real fix: SignerKeyProviderAdapter
// (packages/crypto/src/providers/SignerKeyProviderAdapter.ts), which
// makes the keyProvider option resolve through the SAME Signer that did
// the signing, so the two paths cannot structurally disagree.
//
// Entirely hermetic: KEY_PROVIDER is never set to aws-kms here (no AWS
// credentials needed) -- LocalFileSigner stands in for "whichever
// Signer backend is actually configured." The bug and the fix are both
// about whether signing and verification share ONE resolved Signer, not
// about which backend that Signer happens to wrap.
//

const keyDir = mkdtempSync(join(tmpdir(), "parmana-tutorial-114-keys-"));
process.env.PARMANA_KEY_DIR = keyDir;
delete process.env.KEY_PROVIDER; // ensure LocalFileSigner (the default)

function writeKeyPair(keyId: string): void {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  writeFileSync(
    join(keyDir, `${keyId}.private.pem`),
    privateKey.export({ format: "pem", type: "pkcs8" }),
  );
  writeFileSync(
    join(keyDir, `${keyId}.public.pem`),
    publicKey.export({ format: "pem", type: "spki" }),
  );
}

// The key actually used to sign -- materialized to disk, exactly like a
// real deployment's "default" keypair.
writeKeyPair("default");

// A SEPARATE, never-materialized-to-this-directory keypair, standing in
// for "a stale key file left over from before a migration" -- the exact
// scenario found in production (item 4 of the 2026-09-15 KMS migration troubleshooting
// guide, in git history: its fix kept an old default.public.pem present on disk as a side
// effect, which is exactly what this "stale" key represents here).
const stalePair = generateKeyPairSync("ed25519");

const {
  AuthorizationSigner,
  CryptoBootstrap,
  SignerBootstrap,
  SignerKeyProviderAdapter,
} = await import("@parmana/crypto");
const { EnvelopeVerifier, MemoryNonceStore } =
  await import("@parmana/envelope-verifier");
const { DEFAULT_KEY_ID } = await import("@parmana/crypto");

const crypto = CryptoBootstrap.create();
const signer = await SignerBootstrap.create();

const executableContent = {
  businessTransactionId: "tx-114",
  action: "paytm:refund",
  target: "paytm://orders/114",
  parameters: { orderId: "114", amount: 45 },
};

const authorization = await new AuthorizationSigner(crypto).signWithSigner(
  {
    decisionId: "decision-114",
    businessTransactionId: "tx-114",
    policyName: "customer-refund",
    policyVersion: "1.0.0",
    executableContent,
  },
  DEFAULT_KEY_ID,
  signer,
  60,
);

/**
 * A minimal KeyProvider test double that ALWAYS returns a fixed public
 * key, regardless of the requested keyId -- standing in for
 * `new FileKeyProvider()` pointed at a directory holding a key that no
 * longer matches what actually signs. This is the shape of the real
 * bug: the resolved key does not depend on what the Signer that
 * produced the signature actually used.
 */
class StaleKeyProvider {
  constructor(private readonly staleKey: KeyObject) {}

  async getMetadata() {
    return { keyId: DEFAULT_KEY_ID, algorithm: "ed25519" as const };
  }

  async getPrivateKey(): Promise<never> {
    throw new Error("not needed for this tutorial");
  }

  async getPublicKey(): Promise<KeyObject> {
    return this.staleKey;
  }

  async hasKey(): Promise<boolean> {
    return true;
  }
}

console.log();
console.log("==================================================");
console.log(
  "Tutorial 114 - Signing and Verification Must Agree on One Key Source",
);
console.log("==================================================");
console.log();

try {
  console.log(
    "Scenario 1 (THE BUG, reproduced): verification's keyProvider resolves a DIFFERENT key than the one that actually signed",
  );
  console.log("--------------------------------------------------");

  const buggyVerifier = new EnvelopeVerifier({
    publicKey: stalePair.publicKey,
    keyProvider: new StaleKeyProvider(stalePair.publicKey),
    nonceStore: new MemoryNonceStore(),
  });

  const buggyResult = await buggyVerifier.verifyChecks(
    authorization,
    new Date(),
  );

  console.log(`signatureVerified : ${buggyResult.checks.signatureVerified}`);
  console.log(
    "This is exactly what production logged: 'Execution Gateway rejected request:",
  );
  console.log(
    "failed checks [signatureVerified, businessTransactionHashMatches, nonceUnseen]' --",
  );
  console.log(
    "a real, legitimate authorization, indistinguishable from a forged one, because",
  );
  console.log(
    "verification never had a way to know it was checking the wrong key.",
  );
  console.log();

  console.log(
    "Scenario 2 (THE FIX): keyProvider resolves through the SAME Signer that signed",
  );
  console.log("--------------------------------------------------");

  const fixedVerifier = new EnvelopeVerifier({
    publicKey: await signer.getPublicKey(DEFAULT_KEY_ID),
    keyProvider: new SignerKeyProviderAdapter(signer),
    nonceStore: new MemoryNonceStore(),
  });

  const fixedResult = await fixedVerifier.verifyChecks(
    authorization,
    new Date(),
  );

  console.log(`signatureVerified : ${fixedResult.checks.signatureVerified}`);
  console.log(
    "createExecutionGateway.ts now resolves ONE Signer and shares it between the static",
  );
  console.log(
    "publicKey and the SignerKeyProviderAdapter passed as keyProvider -- signing and",
  );
  console.log(
    "per-authorization verification are structurally guaranteed to agree, not just",
  );
  console.log("usually agree by coincidence of current configuration.");
  console.log();

  const allPassed =
    buggyResult.checks.signatureVerified === false &&
    fixedResult.checks.signatureVerified === true;

  if (allPassed) {
    console.log(
      "✓ Reproduced the exact failure mode found in production, and confirmed the real fix (SignerKeyProviderAdapter) resolves it.",
    );
  } else {
    console.log("✗ Expected Scenario 1 to fail and Scenario 2 to succeed.");
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 115 - Per-Limiter Rate Limit Stores");
} finally {
  delete process.env.PARMANA_KEY_DIR;
  rmSync(keyDir, { recursive: true, force: true });
}
