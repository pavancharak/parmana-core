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
  console.log("Tutorial 41 - Expired Authorization");
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

  const keyProvider = new FileKeyProvider();

  const publicKey = await keyProvider.getPublicKey(context.authorization.keyId);

  const verifier = new AuthorizationVerifier(CryptoBootstrap.create());

  //
  // Simulate verification after expiration.
  //
  const afterExpiry = new Date(
    Date.parse(context.authorization.payload.expiresAt) + 1000,
  );

  const result = await verifier.verify(
    context.authorization,
    publicKey,
    afterExpiry,
  );

  console.log("Authorization Lifetime");

  console.log("--------------------------------------------------");

  console.log(`Authorized At : ${context.authorization.payload.authorizedAt}`);

  console.log(`Expires At    : ${context.authorization.payload.expiresAt}`);

  console.log(`Verified At   : ${afterExpiry.toISOString()}`);

  console.log();

  console.log("Verification");

  console.log("--------------------------------------------------");

  console.log(`Version Supported : ${result.checks.versionSupported}`);

  console.log(`Signature Valid   : ${result.checks.signatureVerified}`);

  console.log(`Not Expired       : ${result.checks.notExpired}`);

  console.log();

  if (!result.valid) {
    console.log("✓ Expired authorization detected.");

    console.log("Execution rejected.");
  } else {
    console.log("✗ Expired authorization accepted.");
  }

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
