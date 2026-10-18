import { readFileSync } from "node:fs";
import path from "node:path";

import { FilePolicyRepository } from "@parmana/policy";

import { RuntimeBuilder } from "@parmana/runtime";

import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

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

// --------------------------------------------------
// EXECUTION
// --------------------------------------------------

const result = await runtime.execute(await withDemoApproval(transaction));

const trustRecord = result.trustRecord;

const authorization = result.context.authorization;

if (!authorization) {
  throw new Error("Execution Authorization was not generated.");
}

// --------------------------------------------------
// OUTPUT
// --------------------------------------------------

console.log("========================================");
console.log(" Parmana Tutorial 11");
console.log(" Execution Authorization");
console.log("========================================");

console.log();

console.log("Business Transaction");

console.log(JSON.stringify(transaction, null, 2));

console.log();

console.log("Execution Authorization");

console.log(JSON.stringify(authorization, null, 2));

console.log();

console.log("Authorization Summary");

console.log(`Payload Version  : ${authorization.payload.version}`);

console.log(`Authorization ID : ${authorization.payload.authorizationId}`);

console.log(`Decision ID      : ${authorization.payload.decisionId}`);

console.log(
  `Transaction ID   : ${authorization.payload.businessTransactionId}`,
);

console.log(
  `Policy           : ${authorization.payload.policyName}@${authorization.payload.policyVersion}`,
);

console.log(`Algorithm        : ${authorization.algorithm}`);

console.log(`Key ID           : ${authorization.keyId}`);

console.log(`Authorized At    : ${authorization.payload.authorizedAt}`);

console.log(`Expires At       : ${authorization.payload.expiresAt}`);

console.log(`Nonce            : ${authorization.payload.nonce}`);

console.log(
  `Content Hash     : ${authorization.payload.businessTransactionHash}`,
);

console.log();

console.log("Execution Trust Record");

console.log(JSON.stringify(trustRecord, null, 2));

console.log();

console.log("========================================");
console.log(" EXECUTION AUTHORIZATION GENERATED");
console.log("========================================");
