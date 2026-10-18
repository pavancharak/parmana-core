import { readFileSync } from "node:fs";
import path from "node:path";

import { FilePolicyRepository } from "@parmana/policy";

import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import { RuntimeBuilder } from "@parmana/runtime";

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

const trustRecords = new MemoryExecutionTrustRecordRepository();

const runtime = new RuntimeBuilder()
  .withSignalStateVerifier(demoApprovalSignalVerifier())
  .withPolicyRepository(policyRepository)
  .build(trustRecords);

const { trustRecord } = await runtime.execute(
  await withDemoApproval(transaction),
);

console.log("========================================");
console.log(" Parmana Tutorial 03 - Runtime Execution");
console.log("========================================");

console.log();

console.log("Business Transaction");

console.log(JSON.stringify(transaction, null, 2));

console.log();

console.log("Execution Trust Record");

console.log(JSON.stringify(trustRecord, null, 2));

console.log();

console.log("Tutorial Complete");
console.log("Next: Tutorial 04 - Policy Router");
