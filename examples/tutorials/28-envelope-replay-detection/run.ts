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
  console.log("Tutorial 28 - Envelope Replay Detection");
  console.log("==================================================");
  console.log();

  //
  // Build Runtime
  //
  const runtime = new RuntimeBuilder()
    .withSignalStateVerifier(demoApprovalSignalVerifier())
    .withPolicyRepository(new FilePolicyRepository("policies"))
    .build(new MemoryExecutionTrustRecordRepository());

  console.log("Generating authorization...");

  const { context } = await runtime.execute(
    await withDemoApproval(transaction),
  );

  if (!context.authorization) {
    throw new Error("Execution Authorization was not generated.");
  }

  console.log("✓ Authorization generated.");

  //
  // Create Envelope Verifier
  //
  const keyProvider = new FileKeyProvider();

  const publicKey = await keyProvider.getPublicKey(context.authorization.keyId);

  const verifier = new EnvelopeVerifier({
    publicKey,
    nonceStore: new MemoryNonceStore(),
  });

  //
  // First verification
  //
  console.log();
  console.log("First verification...");

  const first = await verifier.verify(context.authorization);

  console.log(`Valid           : ${first.valid}`);

  console.log(`Nonce Unseen    : ${first.checks.nonceUnseen}`);

  if (first.valid) {
    console.log("✓ Authorization accepted.");
  }

  //
  // Replay
  //
  console.log();
  console.log("Second verification...");

  const second = await verifier.verify(context.authorization);

  console.log(`Valid           : ${second.valid}`);

  console.log(`Nonce Unseen    : ${second.checks.nonceUnseen}`);

  if (!second.valid) {
    console.log("✓ Replay detected.");
  } else {
    console.log("✗ Replay was not detected.");
  }

  console.log();
  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
