import { readFileSync } from "node:fs";
import path from "node:path";

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
// application.execute() runs the live Execution
// Trust pipeline: Runtime -> Verification -> Receipt,
// the same code path used by POST /execute.
// --------------------------------------------------

const trustRecord = await application.execute(
  await withDemoApproval(transaction),
);

const verification = trustRecord.verifications.at(-1);

const receipt = trustRecord.receipts.at(-1);

// --------------------------------------------------
// OUTPUT
// --------------------------------------------------

console.log("========================================");
console.log(" Parmana Tutorial 07 - Receipt Generation");
console.log("========================================");

console.log();

console.log("Execution Trust Record");

console.log(JSON.stringify(trustRecord, null, 2));

console.log();

console.log("Verification");

console.log(JSON.stringify(verification, null, 2));

console.log();

console.log("Receipt");

console.log(JSON.stringify(receipt, null, 2));

console.log();

console.log("Tutorial Complete");
console.log("Next: Tutorial 08 - Human Approval");
