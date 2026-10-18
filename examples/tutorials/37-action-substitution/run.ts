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
  console.log("Tutorial 37 - Action Substitution");
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

  const substituted: ExecutableContent = {
    businessTransactionId: transaction.businessTransactionId,

    action: "create-vendor",

    target: transaction.intent.target,

    parameters: transaction.intent.parameters,
  };

  const hasher = new ExecutableContentHasher(CryptoBootstrap.create());

  const substitutedHash = await hasher.hash(substituted);

  console.log("Authorized Action");

  console.log(transaction.intent.action);

  console.log();

  console.log("Substituted Action");

  console.log(substituted.action);

  console.log();

  console.log("Original Hash");

  console.log(originalHash);

  console.log();

  console.log("Substituted Hash");

  console.log(substitutedHash);

  console.log();

  if (originalHash !== substitutedHash) {
    console.log("✓ Action substitution detected.");

    console.log("Execution rejected.");
  } else {
    console.log("✗ Action substitution not detected.");
  }

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
