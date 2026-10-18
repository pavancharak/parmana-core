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
  console.log("Tutorial 43 - Stolen Authorization");
  console.log("==================================================");
  console.log();

  //
  // Generate a legitimate authorization.
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

  console.log("✓ Valid Execution Authorization generated.");

  //
  // Simulate a stolen authorization being reused
  // for a different request.
  //
  const stolenRequest: ExecutableContent = {
    businessTransactionId: transaction.businessTransactionId,

    action: transaction.intent.action,

    target: transaction.intent.target,

    parameters: {
      ...transaction.intent.parameters,
      paymentAmount: 500000,
    },
  };

  const hasher = new ExecutableContentHasher(CryptoBootstrap.create());

  const stolenHash = await hasher.hash(stolenRequest);

  const authorizedHash = context.authorization.payload.businessTransactionHash;

  console.log();
  console.log("Authorization Binding");
  console.log("--------------------------------------------------");

  console.log(`Authorized Hash : ${authorizedHash}`);

  console.log(`Presented Hash  : ${stolenHash}`);

  console.log();

  if (authorizedHash !== stolenHash) {
    console.log("✓ Stolen authorization detected.");

    console.log("Execution rejected.");
  } else {
    console.log("✗ Stolen authorization accepted.");
  }

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
