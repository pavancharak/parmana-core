import {
  AuthorizationVerifier,
  CryptoBootstrap,
  ExecutableContentHasher,
  FileKeyProvider,
} from "@parmana/crypto";

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
  console.log("Tutorial 31 - Authorization Binding");
  console.log("==================================================");
  console.log();

  //
  // Runtime
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
  // Verify signature first
  //
  const keyProvider = new FileKeyProvider();

  const publicKey = await keyProvider.getPublicKey(context.authorization.keyId);

  const verifier = new AuthorizationVerifier(CryptoBootstrap.create());

  const verification = await verifier.verify(context.authorization, publicKey);

  if (!verification.valid) {
    throw new Error("Authorization verification failed.");
  }

  console.log("✓ Authorization verified.");

  //
  // Simulate a different execution request
  //
  const modifiedContent: ExecutableContent = {
    businessTransactionId: transaction.businessTransactionId,
    action: transaction.intent.action,
    target: transaction.intent.target,
    parameters: {
      ...transaction.intent.parameters,
      paymentAmount: 50000,
    },
  };

  //
  // Recompute executable hash
  //
  const hasher = new ExecutableContentHasher(CryptoBootstrap.create());

  const computedHash = await hasher.hash(modifiedContent);

  const authorizedHash = context.authorization.payload.businessTransactionHash;

  console.log();
  console.log("Execution Binding Check");
  console.log("------------------------------");

  console.log(`Authorization Hash : ${authorizedHash}`);

  console.log(`Execution Hash     : ${computedHash}`);

  console.log();

  if (authorizedHash !== computedHash) {
    console.log("✓ Execution rejected.");

    console.log(
      "Reason: Authorization is bound to a different executable request.",
    );
  } else {
    console.log("✗ Binding verification failed.");
  }

  console.log();
  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
