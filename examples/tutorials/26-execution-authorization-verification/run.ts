import { AuthorizationVerifier, CryptoBootstrap } from "@parmana/crypto";

import { FilePolicyRepository } from "@parmana/policy";

import { RuntimeBuilder } from "@parmana/runtime";

import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import { FileKeyProvider } from "@parmana/crypto";

import transaction from "./transaction.json" with { type: "json" };
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 26 - Execution Authorization Verification");
  console.log("==================================================");
  console.log();

  //
  // Build Runtime
  //

  const runtime = new RuntimeBuilder()
    .withSignalStateVerifier(demoApprovalSignalVerifier())
    .withPolicyRepository(new FilePolicyRepository("policies"))
    .build(new MemoryExecutionTrustRecordRepository());

  //
  // Execute
  //

  console.log("Executing transaction...");

  const { context } = await runtime.execute(
    await withDemoApproval(transaction),
  );

  if (!context.authorization) {
    throw new Error("Runtime did not produce an Execution Authorization.");
  }

  console.log("✓ Execution Authorization generated.");

  //
  // Verify Authorization
  //

  const verifier = new AuthorizationVerifier(CryptoBootstrap.create());

  const keyProvider = new FileKeyProvider();

  const publicKey = await keyProvider.getPublicKey(context.authorization.keyId);

  console.log();
  console.log("Verifying authorization...");

  const result = await verifier.verify(context.authorization, publicKey);

  console.log();

  console.log(`Valid               : ${result.valid}`);

  console.log(`Version Supported   : ${result.checks.versionSupported}`);

  console.log(`Signature Verified  : ${result.checks.signatureVerified}`);

  console.log(`Not Expired         : ${result.checks.notExpired}`);

  console.log();

  if (result.valid) {
    console.log("✓ Execution Authorization verified.");
  } else {
    console.log("✗ Execution Authorization rejected.");
  }

  console.log();
  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
