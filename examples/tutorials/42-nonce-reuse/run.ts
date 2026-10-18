import { FileKeyProvider } from "@parmana/crypto";

import { EnvelopeVerifier, MemoryNonceStore } from "@parmana/envelope-verifier";

import { FilePolicyRepository } from "@parmana/policy";

import { RuntimeBuilder } from "@parmana/runtime";

import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import transaction from "./transaction.json" with { type: "json" };
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 42 - Nonce Reuse");
  console.log("==================================================");
  console.log();

  //
  // Generate Authorization
  //
  const runtime = new RuntimeBuilder()
    .withSignalStateVerifier(demoApprovalSignalVerifier())
    .withPolicyRepository(new FilePolicyRepository("policies"))
    .build(new MemoryExecutionTrustRecordRepository());

  const { context } = await runtime.execute(
    await withDemoApproval(transaction),
  );

  if (!context.authorization) {
    throw new Error("Execution Authorization missing.");
  }

  const keyProvider = new FileKeyProvider();

  const publicKey = await keyProvider.getPublicKey(context.authorization.keyId);

  //
  // Shared nonce store
  //
  const nonceStore = new MemoryNonceStore();

  const verifier = new EnvelopeVerifier({
    publicKey,
    nonceStore,
  });

  console.log("First Verification");

  console.log("--------------------------------------------------");

  const first = await verifier.verify(context.authorization);

  console.log(`Accepted     : ${first.valid}`);

  console.log(`Nonce Unseen : ${first.checks.nonceUnseen}`);

  console.log();

  console.log("Second Verification");

  console.log("--------------------------------------------------");

  const second = await verifier.verify(context.authorization);

  console.log(`Accepted     : ${second.valid}`);

  console.log(`Nonce Unseen : ${second.checks.nonceUnseen}`);

  console.log();

  if (!second.checks.nonceUnseen) {
    console.log("✓ Nonce reuse detected.");

    console.log("Execution rejected.");
  } else {
    console.log("✗ Nonce reuse not detected.");
  }

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
