import { readFileSync } from "node:fs";
import path from "node:path";

import { FilePolicyRepository } from "@parmana/policy";

import { RuntimeBuilder } from "@parmana/runtime";

import { EnvelopeVerifier, MemoryNonceStore } from "@parmana/envelope-verifier";

import { FileKeyProvider } from "@parmana/crypto";

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
// EXECUTE
// --------------------------------------------------

const result = await runtime.execute(await withDemoApproval(transaction));

const authorization = result.context.authorization;

if (!authorization) {
  throw new Error("Execution Authorization was not generated.");
}

// --------------------------------------------------
// VERIFY ENVELOPE
// --------------------------------------------------

const keyProvider = new FileKeyProvider();

const publicKey = await keyProvider.getPublicKey(authorization.keyId);
const verifier = new EnvelopeVerifier({
  publicKey,
  nonceStore: new MemoryNonceStore(),
});

const verification = await verifier.verify(authorization);

// --------------------------------------------------
// OUTPUT
// --------------------------------------------------

console.log("========================================");
console.log(" Parmana Tutorial 12");
console.log(" Envelope Verification");
console.log("========================================");

console.log();

console.log("Verification Result");

console.log(JSON.stringify(verification, null, 2));

console.log();

console.log("Checks");

console.log(JSON.stringify(verification.checks, null, 2));

console.log();

console.log("========================================");
console.log(" ENVELOPE VERIFIED");
console.log("========================================");
