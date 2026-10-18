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

const trustRecord = await application.execute(
  await withDemoApproval(transaction),
);

console.log("========================================");

console.log(" Parmana Tutorial 17");

console.log(" Multi Policy Routing");

console.log("========================================");

console.log();

console.log("Requested Policy");

console.log(`${transaction.policy.name}@${transaction.policy.version}`);

console.log();

console.log("Execution Trust Record");

console.log(JSON.stringify(trustRecord, null, 2));

console.log();

console.log("========================================");

console.log(" POLICY ROUTING COMPLETE");

console.log("========================================");
