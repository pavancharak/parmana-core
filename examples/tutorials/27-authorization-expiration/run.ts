import {
  AuthorizationVerifier,
  CryptoBootstrap,
  FileKeyProvider,
} from "@parmana/crypto";

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
  console.log("Tutorial 27 - Authorization Expiration");
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
  // Execute transaction
  //
  console.log("Executing transaction...");

  const { context } = await runtime.execute(
    await withDemoApproval(transaction),
  );

  if (!context.authorization) {
    throw new Error("Execution Authorization was not generated.");
  }

  console.log("✓ Execution Authorization generated.");

  //
  // Load Parmana public key
  //
  const keyProvider = new FileKeyProvider();

  const publicKey = await keyProvider.getPublicKey(context.authorization.keyId);

  //
  // Move time beyond expiration
  //
  const expiresAt = new Date(context.authorization.payload.expiresAt);

  const future = new Date(expiresAt.getTime() + 60_000);

  //
  // Verify
  //
  const verifier = new AuthorizationVerifier(CryptoBootstrap.create());

  console.log();
  console.log("Verifying expired authorization...");

  const result = await verifier.verify(
    context.authorization,
    publicKey,
    future,
  );

  console.log();

  console.log(`Valid               : ${result.valid}`);

  console.log(`Version Supported   : ${result.checks.versionSupported}`);

  console.log(`Signature Verified  : ${result.checks.signatureVerified}`);

  console.log(`Not Expired         : ${result.checks.notExpired}`);

  console.log();

  if (!result.valid) {
    console.log("✓ Authorization correctly rejected.");
  } else {
    console.log("✗ Authorization should have expired.");
  }

  console.log();
  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
