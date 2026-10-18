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

import type {
  BusinessTransaction,
  ExecutionTrustRecord,
} from "@parmana/shared";
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

//
// Historical note: this tutorial previously verified the dead
// ExecutionPermit/ExecutionTrustAttestation/ExecutionReceipt cluster
// via ExecutionReceiptVerifier -- a structural-only check (version
// === 1, permit/trustRecord defined), no cryptographic verification
// at all. That whole cluster was confirmed to have zero live callers
// and deleted by the Hybrid Signature Support milestone (Phase A). It
// now demonstrates the real thing: application.verify(), the same
// code path VerificationService exposes to POST /verify, requiring
// every entry in a hybrid-shaped record's signatures[] to
// independently verify -- and rejecting, fail-closed, the moment one
// doesn't.
//

process.env.CRYPTO_MODE = "hybrid";
process.env.SECONDARY_SIGNATURE_PROVIDER = "dilithium3";

if (!isMlDsa65Supported()) {
  console.log(`Skipping Tutorial 55: ${ML_DSA_65_SKIP_REASON}`);
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

console.log("========================================");
console.log(" Parmana Tutorial 55 - Execution Receipt Verification");
console.log("========================================");

console.log();

// --------------------------------------------------
// GENUINE VERIFICATION
// --------------------------------------------------

const trustRecord = await application.execute(
  await withDemoApproval(transaction),
);

const genuineVerification = await application.verify(
  transaction.businessTransactionId,
);

console.log("Genuine hybrid-signed record");
console.log("--------------------------------------------------");
console.log(`Status  : ${genuineVerification.status}`);
console.log(`Message : ${genuineVerification.message}`);

console.log();

// --------------------------------------------------
// FAIL-CLOSED: TAMPER WITH THE SECOND SIGNATURE
//
// Corrupts one entry in the stored record's signatures[] and
// re-verifies through the exact same application.verify() path --
// not a hand-rolled check -- to prove the real, wired verification
// service rejects a hybrid-shaped record when any one signature
// entry is invalid, never a silent downgrade to checking the legacy
// signature alone.
// --------------------------------------------------

if (!trustRecord.signatures || trustRecord.signatures.length !== 2) {
  throw new Error(
    "Expected a hybrid-shaped Trust Record (schemaVersion 2, two signatures).",
  );
}

const tampered: ExecutionTrustRecord = {
  ...trustRecord,
  signatures: trustRecord.signatures.map((entry) =>
    entry.algorithm === "dilithium3"
      ? { ...entry, signature: `${entry.signature.slice(0, -4)}AAAA` }
      : entry,
  ),
};

await trustRecords.create(tampered);

const tamperedVerification = await application.verify(
  transaction.businessTransactionId,
);

console.log("Tampered second signature");
console.log("--------------------------------------------------");
console.log(`Status  : ${tamperedVerification.status}`);
console.log(`Message : ${tamperedVerification.message}`);

console.log();

if (
  genuineVerification.status === "VERIFIED" &&
  tamperedVerification.status === "FAILED" &&
  tamperedVerification.message.includes("Signature check failed")
) {
  console.log(
    "✓ Genuine record verified; tampered record correctly rejected -- not a silent downgrade to the legacy signature alone.",
  );
} else {
  console.log(
    "✗ Expected genuine=VERIFIED and tampered=FAILED (Signature check failed).",
  );
}

console.log();

console.log("Tutorial Complete");
console.log("Next: Tutorial 56 - Complete Execution Flow");
