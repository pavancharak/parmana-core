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
// Historical note: this tutorial previously chained the dead
// ExecutionPermit -> ExecutionTrustAttestation -> ExecutionReceipt ->
// ExecutionReceiptVerifier pipeline (Hybrid Signature Support
// milestone, Phase A: confirmed zero live callers, zero test
// coverage, deleted) into one script. It now chains Tutorials 53-55's
// real content -- build, receipt, verify (genuine and tampered) --
// through the same production pipeline `POST /execute`/`POST /verify`
// use, with CRYPTO_MODE=hybrid active throughout.
//

process.env.CRYPTO_MODE = "hybrid";
process.env.SECONDARY_SIGNATURE_PROVIDER = "dilithium3";

if (!isMlDsa65Supported()) {
  console.log(`Skipping Tutorial 56: ${ML_DSA_65_SKIP_REASON}`);
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
console.log(" Parmana Tutorial 56 - Complete Execution Flow");
console.log("========================================");

console.log();

console.log("Business Artifact");
console.log("--------------------------------------------------");
console.log(`Vendor  : ${transaction.intent.parameters.vendorId}`);
console.log(`Invoice : ${transaction.intent.parameters.invoiceId}`);
console.log(
  `Amount  : ${transaction.intent.parameters.amount} ${transaction.intent.parameters.currency}`,
);

console.log();

// --------------------------------------------------
// 1. Execute -- policy evaluation, decision, execution,
//    and a hybrid-signed Execution Trust Record.
// --------------------------------------------------

const trustRecord = await application.execute(
  await withDemoApproval(transaction),
);

console.log("1. Execution Trust Record");
console.log("--------------------------------------------------");
console.log(
  `Decision       : ${trustRecord.executions.at(-1)?.decision.outcome}`,
);
console.log(`Schema version : ${trustRecord.schemaVersion}`);
console.log(
  `Signatures     : ${trustRecord.signatures?.map((s) => s.algorithm).join(", ")}`,
);

console.log();

// --------------------------------------------------
// 2. Receipt -- generated as part of execute(), also
//    hybrid-signed.
// --------------------------------------------------

const receipt = trustRecord.receipts.at(-1);

if (!receipt) {
  throw new Error("Expected a Receipt to be generated as part of execute().");
}

console.log("2. Receipt");
console.log("--------------------------------------------------");
console.log(`Receipt ID     : ${receipt.receiptId}`);
console.log(`Schema version : ${receipt.schemaVersion}`);
console.log(
  `Signatures     : ${receipt.signatures?.map((s) => s.algorithm).join(", ")}`,
);

console.log();

// --------------------------------------------------
// 3. Verify -- genuine record.
// --------------------------------------------------

const genuineVerification = await application.verify(
  transaction.businessTransactionId,
);

console.log("3. Verification (genuine)");
console.log("--------------------------------------------------");
console.log(`Status : ${genuineVerification.status}`);

console.log();

// --------------------------------------------------
// 4. Verify -- tampered second signature, fail-closed.
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

console.log("4. Verification (tampered second signature)");
console.log("--------------------------------------------------");
console.log(`Status : ${tamperedVerification.status}`);

console.log();

// --------------------------------------------------
// Final trust decision
// --------------------------------------------------

console.log("Execution Trust");
console.log("--------------------------------------------------");

const flowCorrect =
  trustRecord.schemaVersion === 2 &&
  receipt.schemaVersion === 2 &&
  genuineVerification.status === "VERIFIED" &&
  tamperedVerification.status === "FAILED";

if (flowCorrect) {
  console.log(
    "✓ Enterprise action authorized, hybrid-signed end to end, and tamper-evident.",
  );
} else {
  console.log(
    "✗ Enterprise action cannot be trusted -- one or more steps did not behave as expected.",
  );
}

console.log();

console.log("Tutorial completed successfully.");
