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
  console.log("Tutorial 36 - Parameter Tampering");
  console.log("==================================================");
  console.log();

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

  const originalHash = context.authorization.payload.businessTransactionHash;

  const tampered: ExecutableContent = {
    businessTransactionId: transaction.businessTransactionId,
    action: transaction.intent.action,
    target: transaction.intent.target,
    parameters: {
      ...transaction.intent.parameters,
      paymentAmount: 500000,
    },
  };

  const hasher = new ExecutableContentHasher(CryptoBootstrap.create());

  const tamperedHash = await hasher.hash(tampered);

  console.log("Original Hash");

  console.log(originalHash);

  console.log();

  console.log("Tampered Hash");

  console.log(tamperedHash);

  console.log();

  if (originalHash !== tamperedHash) {
    console.log("✓ Parameter tampering detected.");

    console.log("Execution rejected.");
  } else {
    console.log("✗ Tampering not detected.");
  }

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
