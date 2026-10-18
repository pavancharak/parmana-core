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
  readFileSync(path.join(root, "transaction.json"), "utf8"),
) as BusinessTransaction;

//
// Load the custom policy repository for this
// tutorial instead of the shared repository.
//
const policyRepository = new FilePolicyRepository(path.join(root, "policies"));

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

//
// Execute the Business Transaction using the
// custom High Value Payment policy.
//
// The Finance Director signs an approval for this vendor and amount; the
// policy's approvalSignals entry says what the approval must cover.
const trustRecord = await application.execute(
  await withDemoApproval(
    transaction,
    await policyRepository.load(
      transaction.policy.name,
      transaction.policy.version,
    ),
  ),
);

const verification = trustRecord.verifications.at(-1);

const receipt = trustRecord.receipts.at(-1);

console.log("========================================");
console.log(" Parmana Tutorial 14");
console.log(" Custom Policy");
console.log("========================================");

console.log();

console.log("Policy");

console.log(`${transaction.policy.name}@${transaction.policy.version}`);

console.log();

console.log("Business Transaction");

console.log(JSON.stringify(transaction, null, 2));

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

console.log("========================================");
console.log(" CUSTOM POLICY EXECUTED");
console.log("========================================");
