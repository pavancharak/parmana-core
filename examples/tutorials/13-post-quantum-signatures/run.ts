import { readFileSync } from "node:fs";
import path from "node:path";

import { FilePolicyRepository } from "@parmana/policy";

import { RuntimeBuilder } from "@parmana/runtime";

import { EnvelopeVerifier, MemoryNonceStore } from "@parmana/envelope-verifier";

import { FileKeyProvider } from "@parmana/crypto";

import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import { loadConfig, type BusinessTransaction } from "@parmana/shared";
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

const root = path.resolve(import.meta.dirname);

const config = loadConfig();

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
// ENVELOPE VERIFICATION
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

console.log(" Parmana Tutorial 13");

console.log(" Post-Quantum Signatures");

console.log("========================================");

console.log();

console.log(`Signature Provider : ${config.crypto.signatureProvider}`);

console.log();

console.log("Execution Authorization");

console.log(JSON.stringify(authorization, null, 2));

console.log();

console.log("Envelope Verification");

console.log(JSON.stringify(verification, null, 2));

console.log();

console.log("Execution Trust Record");

console.log(JSON.stringify(trustRecord, null, 2));

console.log();

console.log("This tutorial demonstrates cryptographic agility.");

console.log(
  "Switching between Ed25519 and Dilithium3 requires no application code changes.",
);

console.log("Only the SIGNATURE_PROVIDER configuration changes.");

console.log();

console.log("========================================");

console.log(" POST-QUANTUM DEMONSTRATION COMPLETE");

console.log("========================================");
