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
  console.log("Tutorial 35 - Replay Attack");
  console.log("==================================================");
  console.log();

  //
  // Build Runtime
  //
  const runtime = new RuntimeBuilder()
    .withSignalStateVerifier(demoApprovalSignalVerifier())
    .withPolicyRepository(new FilePolicyRepository("policies"))
    .build(new MemoryExecutionTrustRecordRepository());

  console.log("Generating Execution Authorization...");

  const { context } = await runtime.execute(
    await withDemoApproval(transaction),
  );

  if (!context.authorization) {
    throw new Error("Execution Authorization was not generated.");
  }

  console.log("✓ Authorization generated.");

  //
  // Build Envelope Verifier
  //
  const keyProvider = new FileKeyProvider();

  const publicKey = await keyProvider.getPublicKey(context.authorization.keyId);

  const verifier = new EnvelopeVerifier({
    publicKey,
    nonceStore: new MemoryNonceStore(),
  });

  //
  // First request
  //
  console.log();
  console.log("First Request");
  console.log("--------------------------------------------------");

  const first = await verifier.verify(context.authorization);

  console.log(`Accepted : ${first.valid}`);

  console.log(`Nonce Unseen : ${first.checks.nonceUnseen}`);

  //
  // Replay attack
  //
  console.log();
  console.log("Replay Attempt");
  console.log("--------------------------------------------------");

  const replay = await verifier.verify(context.authorization);

  console.log(`Accepted : ${replay.valid}`);

  console.log(`Nonce Unseen : ${replay.checks.nonceUnseen}`);

  console.log();

  if (!replay.valid) {
    console.log("✓ Replay attack detected.");

    console.log("Execution rejected.");
  } else {
    console.log("✗ Replay protection failed.");
  }

  console.log();
  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
