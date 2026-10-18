import { CryptoBootstrap, ExecutableContentHasher } from "@parmana/crypto";

import { FilePolicyRepository } from "@parmana/policy";

import { RuntimeBuilder } from "@parmana/runtime";

import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import type { ExecutableContent } from "@parmana/shared";

import transaction from "./transaction.json" with { type: "json" };
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 46 - TOCTOU Protection");
  console.log("==================================================");
  console.log();

  //
  // Step 1
  // Policy evaluation and authorization.
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

  console.log("✓ Policy evaluated.");

  console.log("✓ Execution Authorization generated.");

  console.log();

  //
  // Step 2
  // Original executable content hash.
  //
  const authorizedHash = context.authorization.payload.businessTransactionHash;

  //
  // Step 3
  // Simulate modification after authorization.
  //
  const modified: ExecutableContent = {
    businessTransactionId: transaction.businessTransactionId,

    action: transaction.intent.action,

    target: transaction.intent.target,

    parameters: {
      ...transaction.intent.parameters,
      paymentAmount: 500000,
    },
  };

  const hasher = new ExecutableContentHasher(CryptoBootstrap.create());

  const currentHash = await hasher.hash(modified);

  console.log("Execution Gateway");

  console.log("--------------------------------------------------");

  console.log(`Authorized Hash : ${authorizedHash}`);

  console.log(`Current Hash    : ${currentHash}`);

  console.log();

  if (authorizedHash !== currentHash) {
    console.log("✓ TOCTOU attack detected.");

    console.log("Execution rejected before reaching the enterprise system.");
  } else {
    console.log("✗ TOCTOU attack not detected.");
  }

  console.log();

  console.log("Execution Authorization Summary");

  console.log("--------------------------------------------------");

  console.log("✓ Policy Evaluation");

  console.log("✓ Execution Authorization");

  console.log("✓ Authorization Binding");

  console.log("✓ Executable Content Verification");

  console.log("✓ Execution Gateway Protection");

  console.log("✓ Enterprise Execution Prevented");

  console.log();

  console.log("Parmana verifies what is about to execute,");

  console.log("not merely what was previously approved.");

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
