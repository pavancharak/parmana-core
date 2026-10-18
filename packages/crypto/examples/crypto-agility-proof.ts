/**
 * Crypto-Agility Proof: same transaction, two algorithms, both verify
 * independently.
 *
 * Demonstrates that Parmana can sign an execution record with either
 * Ed25519 (classical, current default) or Dilithium3/ML-DSA-65
 * (post-quantum) and have each signature verify on its own, using the
 * same canonical serialization of the same record.
 *
 * Run: npx tsx packages/crypto/examples/crypto-agility-proof.ts
 */
import { generateKeyPairSync } from "node:crypto";

import { CanonicalSerializer } from "../src/CanonicalSerializer.js";
import { Ed25519SignatureProvider } from "../src/providers/signature/Ed25519SignatureProvider.js";
import { Dilithium3SignatureProvider } from "../src/providers/signature/Dilithium3SignatureProvider.js";
import {
  isMlDsa65Supported,
  ML_DSA_65_SKIP_REASON,
} from "../src/support/MlDsaSupport.js";

async function main(): Promise<void> {
  if (!isMlDsa65Supported()) {
    console.error(`Skipped: ${ML_DSA_65_SKIP_REASON}`);
    process.exit(1);
  }

  const executionRecord = {
    intent: "refund",
    amount: 500,
    currency: "INR",
    recipient: "acme-corp-account",
    timestamp: new Date().toISOString(),
    requestId: "refund-crypto-agility-proof",
  };

  const serializer = new CanonicalSerializer();
  const bytes = serializer.serialize(executionRecord);

  console.log();
  console.log("CRYPTO-AGILITY PROOF");
  console.log("=====================");
  console.log();
  console.log("Record:", JSON.stringify(executionRecord, null, 2));
  console.log();

  // TEST 1: Ed25519 (classical, current default)
  console.log("TEST 1: Ed25519");
  const ed25519Keys = generateKeyPairSync("ed25519");
  const ed25519Provider = new Ed25519SignatureProvider();
  const ed25519Signature = await ed25519Provider.sign(
    bytes,
    ed25519Keys.privateKey,
  );
  const ed25519Verified = await ed25519Provider.verify(
    bytes,
    ed25519Signature,
    ed25519Keys.publicKey,
  );

  if (!ed25519Verified) {
    throw new Error("Ed25519 verification failed");
  }
  console.log("Ed25519 signature created and verified:", ed25519Verified);
  console.log();

  // TEST 2: Dilithium3 / ML-DSA-65 (post-quantum)
  console.log("TEST 2: Dilithium3 (ML-DSA-65)");
  const dilithiumKeys = generateKeyPairSync("ml-dsa-65");
  const dilithiumProvider = new Dilithium3SignatureProvider();
  const dilithiumSignature = await dilithiumProvider.sign(
    bytes,
    dilithiumKeys.privateKey,
  );
  const dilithiumVerified = await dilithiumProvider.verify(
    bytes,
    dilithiumSignature,
    dilithiumKeys.publicKey,
  );

  if (!dilithiumVerified) {
    throw new Error("Dilithium3 verification failed");
  }
  console.log("Dilithium3 signature created and verified:", dilithiumVerified);
  console.log();

  console.log("CRYPTO-AGILITY PROOF COMPLETE");
  console.log("==============================");
  console.log("- Same record, signed with Ed25519 -> verified");
  console.log("- Same record, signed with Dilithium3 -> verified");
  console.log(
    "- Signatures differ (algorithms differ):",
    ed25519Signature !== dilithiumSignature,
  );
  console.log("- Both independently verifiable, no code changes between them");
}

main().catch((error) => {
  console.error("ERROR:", (error as Error).message);
  process.exit(1);
});
