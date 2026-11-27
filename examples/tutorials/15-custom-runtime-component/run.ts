import { readFileSync } from "node:fs";
import path from "node:path";

import { FilePolicyRepository } from "@parmana/policy";

import { RuntimeBuilder } from "@parmana/runtime";

import {
  MemoryExecutionTrustRecordRepository,
  MemoryRefusalRecordRepository,
} from "@parmana/storage";

import type { BusinessTransaction } from "@parmana/shared";

import { LoggingRuntimeComponent } from "./LoggingRuntimeComponent.js";
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";
import { demoTrustedSources } from "../../shared/helpers/demo-trusted-sources.js";

const root = path.resolve(import.meta.dirname);

const transaction = JSON.parse(
  readFileSync(path.join(root, "transaction.json"), "utf8"),
) as BusinessTransaction;

const policyRepository = new FilePolicyRepository(
  path.resolve(root, "../../../fixtures/policies"),
);

const trustRecords = new MemoryExecutionTrustRecordRepository();
const refusalRecords = new MemoryRefusalRecordRepository();

//
// Build a custom runtime.
//
const runtime = new RuntimeBuilder()
  .withBusinessSignalSources(demoTrustedSources())
  .withSignalStateVerifier(demoApprovalSignalVerifier())
  .withPolicyRepository(policyRepository)
  .addStage(new LoggingRuntimeComponent())
  .build(trustRecords, refusalRecords);

//
// Execute.
//
const result = await runtime.execute(await withDemoApproval(transaction));

const trustRecord = result.trustRecord;

console.log("========================================");

console.log(" Parmana Tutorial 15");

console.log(" Custom Runtime Component");

console.log("========================================");

console.log();

console.log("Execution Trust Record");

console.log(JSON.stringify(trustRecord, null, 2));

console.log();

console.log("========================================");

console.log(" CUSTOM RUNTIME COMPONENT COMPLETE");

console.log("========================================");
