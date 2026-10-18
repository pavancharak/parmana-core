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
  console.log("Tutorial 29 - Authorization Tampering");
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
  // Tamper with the payload
  //
  const tampered = {
    ...context.authorization,
    payload: {
      ...context.authorization.payload,
      policyVersion: "2.0.1",
    },
  };

  console.log();
  console.log("Authorization payload modified.");

  //
  // Load Parmana public key
  //
  const keyProvider = new FileKeyProvider();

  const publicKey = await keyProvider.getPublicKey(context.authorization.keyId);

  //
  // Verify
  //
  const verifier = new AuthorizationVerifier(CryptoBootstrap.create());

  console.log();
  console.log("Verifying tampered authorization...");

  const result = await verifier.verify(tampered, publicKey);

  console.log();

  console.log(`Valid               : ${result.valid}`);

  console.log(`Version Supported   : ${result.checks.versionSupported}`);

  console.log(`Signature Verified  : ${result.checks.signatureVerified}`);

  console.log(`Not Expired         : ${result.checks.notExpired}`);

  console.log();

  if (!result.valid) {
    console.log("✓ Tampering detected.");
  } else {
    console.log("✗ Tampering was not detected.");
  }

  console.log();
  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
