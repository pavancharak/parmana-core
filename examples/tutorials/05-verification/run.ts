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

//
// Default execution system used for tutorials.
// In production, replace this with a real
// ExecutionSystem implementation.
//
const executionSystem = new DefaultExecutionSystem();

const application = RuntimeFactory.create(
  transactions,
  trustRecords,
  policyRepository,
  executionSystem,
  undefined,
  demoApprovalSignalVerifier(),
);

//
// application.execute() runs the complete
// Execution Trust pipeline, including:
//
// - Trust chain validation
// - Policy evaluation
// - Decision creation
// - Execution authorization
// - Execution
// - Trust Record generation
// - Cryptographic signing
//
const trustRecord = await application.execute(
  await withDemoApproval(transaction),
);

//
// Verification uses the same verification
// pipeline exposed by the REST API.
//
const verification = await application.verify(
  transaction.businessTransactionId,
);

console.log("========================================");
console.log(" Parmana Tutorial 05 - Verification");
console.log("========================================");

console.log();

console.log("Execution Trust Record");

console.log(JSON.stringify(trustRecord, null, 2));

console.log();

console.log("Verification");

console.log(JSON.stringify(verification, null, 2));

console.log();

console.log("Tutorial Complete");
console.log("Next: Tutorial 06 - Replay");
