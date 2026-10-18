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
  console.log("Tutorial 30 - Policy Version Pinning");
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
  // Verify Authorization
  //
  const keyProvider = new FileKeyProvider();

  const publicKey = await keyProvider.getPublicKey(context.authorization.keyId);

  const verifier = new AuthorizationVerifier(CryptoBootstrap.create());

  console.log();
  console.log("Verifying authorization...");

  const verification = await verifier.verify(context.authorization, publicKey);

  if (!verification.valid) {
    throw new Error("Authorization verification failed.");
  }

  console.log("✓ Authorization verified.");

  //
  // Enterprise policy pinning
  //
  const expectedPolicyVersion = "2.1.0";

  const actualPolicyVersion = context.authorization.payload.policyVersion;

  console.log();
  console.log("Enterprise Policy Check");
  console.log("------------------------------");

  console.log(`Expected Policy : vendor-payment@${expectedPolicyVersion}`);

  console.log(`Authorization   : vendor-payment@${actualPolicyVersion}`);

  console.log();

  if (actualPolicyVersion !== expectedPolicyVersion) {
    console.log("✗ Authorization rejected.");

    console.log("Reason: Policy version mismatch.");
  } else {
    console.log("✓ Policy version accepted.");
  }

  console.log();
  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
