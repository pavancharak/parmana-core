import { readFileSync } from "node:fs";
import path from "node:path";

import { FilePolicyRepository } from "@parmana/policy";

import { RuntimeBuilder } from "@parmana/runtime";

import { DefaultExecutionSystem } from "@parmana/execution-system";

import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import type { BusinessTransaction } from "@parmana/shared";

import { LoggingComponent } from "./LoggingComponent.js";

import { MetricsComponent } from "./MetricsComponent.js";

import { NotificationComponent } from "./NotificationComponent.js";
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

const trustRecords = new MemoryExecutionTrustRecordRepository();

const executionSystem = new DefaultExecutionSystem();

//
// Build a custom Runtime Pipeline.
//
const runtime = new RuntimeBuilder()
  .withSignalStateVerifier(demoApprovalSignalVerifier())
  .withPolicyRepository(policyRepository)
  .addStage(new LoggingComponent())
  .addStage(new MetricsComponent())
  .addStage(new NotificationComponent())
  .build(trustRecords, executionSystem);

//
// Execute.
//
const result = await runtime.execute(await withDemoApproval(transaction));

const trustRecord = result.trustRecord;

const verification = trustRecord.verifications.at(-1);

const receipt = trustRecord.receipts.at(-1);

console.log("========================================");

console.log(" Parmana Tutorial 16");

console.log(" Runtime Pipeline");

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

console.log("========================================");

console.log(" RUNTIME PIPELINE COMPLETED");

console.log("========================================");
