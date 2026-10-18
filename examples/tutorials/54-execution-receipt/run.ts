import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import path from "node:path";

import { isMlDsa65Supported, ML_DSA_65_SKIP_REASON } from "@parmana/crypto";

import { FilePolicyRepository } from "@parmana/policy";

import { RuntimeFactory } from "@parmana/runtime";

import { DefaultExecutionSystem } from "@parmana/execution-system";

import {
  MemoryBusinessTransactionRepository,
  MemoryExecutionTrustRecordRepository,
} from "@parmana/storage";

import type { BusinessTransaction } from "@parmana/shared";
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

//
// Historical note: this tutorial previously combined the dead
// ExecutionPermitBuilder/ExecutionTrustAttestationBuilder/
// ExecutionReceiptBuilder scaffolding (Hybrid Signature Support
// milestone, Phase A: confirmed zero live callers, zero test
// coverage, deleted). It now demonstrates the real Receipt,
// produced by the same production pipeline Tutorial 07 uses --
// with CRYPTO_MODE=hybrid active, so ReceiptCrypto additionally
// signs it with ML-DSA-65 alongside the default Ed25519 signature.
//

process.env.CRYPTO_MODE = "hybrid";
process.env.SECONDARY_SIGNATURE_PROVIDER = "dilithium3";

if (!isMlDsa65Supported()) {
  console.log(`Skipping Tutorial 54: ${ML_DSA_65_SKIP_REASON}`);
  process.exit(0);
}

//
// Self-provision the hybrid secondary key if this checkout hasn't
// generated one yet (npm run generate:hybrid-secondary-key), so this
// tutorial runs on a fresh clone without a manual setup step.
//
const keyDir = process.env.PARMANA_KEY_DIR ?? "./keys";
const secondaryPrivatePath = path.join(keyDir, "default-secondary.private.pem");
const secondaryPublicPath = path.join(keyDir, "default-secondary.public.pem");

if (!existsSync(secondaryPrivatePath)) {
  const { privateKey, publicKey } = generateKeyPairSync("ml-dsa-65");

  writeFileSync(
    secondaryPrivatePath,
    privateKey.export({ format: "pem", type: "pkcs8" }),
  );
  writeFileSync(
    secondaryPublicPath,
    publicKey.export({ format: "pem", type: "spki" }),
  );
}

const root = path.resolve(import.meta.dirname);

const transaction = JSON.parse(
  readFileSync(
    path.join(root, "../../shared/vendor-payment-transaction.json"),
    "utf8",
  ),
) as BusinessTransaction;

const policyRepository = new FilePolicyRepository(
  path.resolve(root, "../../../policies"),
);

const transactions = new MemoryBusinessTransactionRepository();

const trustRecords = new MemoryExecutionTrustRecordRepository();

const executionSystem = new DefaultExecutionSystem();

const application = RuntimeFactory.create(
  transactions,
  trustRecords,
  policyRepository,
  executionSystem,
  undefined,
  demoApprovalSignalVerifier(),
);

// --------------------------------------------------
// EXECUTION
//
// application.execute() runs the complete pipeline,
// including Receipt generation (ReceiptService, via the
// same ReceiptCrypto used in production) -- not a separate
// call, exactly as Tutorial 07 already shows.
// --------------------------------------------------

const trustRecord = await application.execute(
  await withDemoApproval(transaction),
);

const receipt = trustRecord.receipts.at(-1);

if (!receipt) {
  throw new Error("Expected a Receipt to be generated as part of execute().");
}

// --------------------------------------------------
// OUTPUT
// --------------------------------------------------

console.log("========================================");
console.log(" Parmana Tutorial 54 - Execution Receipt");
console.log("========================================");

console.log();

console.log("Receipt");

console.log(JSON.stringify(receipt, null, 2));

console.log();

console.log("Legacy signature (unchanged shape, always present)");
console.log(`  algorithm : ${receipt.algorithm}`);
console.log(`  length    : ${receipt.signature.length} characters`);

console.log();

console.log(
  `Schema version : ${receipt.schemaVersion ?? "(absent -- legacy single-signature receipt)"}`,
);

console.log();

console.log(
  "Additive hybrid signatures[] (present only under CRYPTO_MODE=hybrid)",
);

for (const entry of receipt.signatures ?? []) {
  console.log(`  ${entry.algorithm.padEnd(10)} keyId=${entry.keyId}`);
}

console.log();

if (receipt.schemaVersion === 2 && receipt.signatures?.length === 2) {
  console.log(
    "✓ Receipt carries both the legacy signature and the additive hybrid signatures[].",
  );
} else {
  console.log(
    "✗ Expected a hybrid-shaped Receipt (schemaVersion 2, two signatures).",
  );
}

console.log();

console.log("Tutorial Complete");
console.log("Next: Tutorial 55 - Execution Receipt Verification");
