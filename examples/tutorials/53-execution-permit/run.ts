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
// Historical note: this tutorial was originally "Execution Permit",
// demonstrating an ExecutionPermit/ExecutionPermitBuilder pair that
// never had any live caller in packages/api and no test coverage --
// confirmed and deleted as dead scaffolding by the Hybrid Signature
// Support milestone (Phase A). The directory/number is unchanged;
// the content now demonstrates that same milestone's real, tested
// replacement: a hybrid-signed Execution Trust Record, produced by
// the actual production pipeline, not a hand-rolled stand-in for it.
//

//
// CRYPTO_MODE=hybrid, set before RuntimeFactory.create() constructs
// the runtime's signing components -- Trust Records are additionally
// signed with SECONDARY_SIGNATURE_PROVIDER (ML-DSA-65) alongside the
// default Ed25519 signature, requiring both to verify.
//
process.env.CRYPTO_MODE = "hybrid";
process.env.SECONDARY_SIGNATURE_PROVIDER = "dilithium3";

if (!isMlDsa65Supported()) {
  console.log(`Skipping Tutorial 53: ${ML_DSA_65_SKIP_REASON}`);
  process.exit(0);
}

//
// Self-provision the hybrid secondary key if this checkout hasn't
// generated one yet (npm run generate:hybrid-secondary-key), so this
// tutorial runs on a fresh clone without a manual setup step --
// mirrors packages/runtime/tests/unit/verification-service-hybrid.test.ts's
// own beforeAll() exactly.
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
// application.execute() runs the live Execution Trust
// pipeline -- the same code path used by POST /execute --
// with CRYPTO_MODE=hybrid active, so BusinessTrustRecordBuilder
// additionally calls VerificationCrypto.signHybrid().
// --------------------------------------------------

const trustRecord = await application.execute(
  await withDemoApproval(transaction),
);

// --------------------------------------------------
// OUTPUT
// --------------------------------------------------

console.log("========================================");
console.log(" Parmana Tutorial 53 - Hybrid-Signed Execution Trust Record");
console.log("========================================");

console.log();

console.log("Execution Trust Record");

console.log(JSON.stringify(trustRecord, null, 2));

console.log();

console.log("Legacy signature (unchanged shape, always present)");
console.log(`  algorithm : ${trustRecord.signature.algorithm}`);
console.log(`  keyId     : ${trustRecord.signature.keyId}`);

console.log();

console.log(
  `Schema version : ${trustRecord.schemaVersion ?? "(absent -- legacy single-signature record)"}`,
);

console.log();

console.log(
  "Additive hybrid signatures[] (present only under CRYPTO_MODE=hybrid)",
);

for (const entry of trustRecord.signatures ?? []) {
  console.log(`  ${entry.algorithm.padEnd(10)} keyId=${entry.keyId}`);
}

console.log();

if (trustRecord.schemaVersion === 2 && trustRecord.signatures?.length === 2) {
  console.log(
    "✓ Trust Record carries both the legacy signature and the additive hybrid signatures[].",
  );
} else {
  console.log(
    "✗ Expected a hybrid-shaped Trust Record (schemaVersion 2, two signatures).",
  );
}

console.log();

console.log("Tutorial Complete");
console.log("Next: Tutorial 54 - Execution Receipt");
