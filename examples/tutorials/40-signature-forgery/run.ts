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
  console.log("Tutorial 40 - Signature Forgery");
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

  //
  // Copy the authorization and forge the signature.
  //
  const forged = {
    ...context.authorization,
    signature:
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
  };

  const keyProvider = new FileKeyProvider();

  const publicKey = await keyProvider.getPublicKey(forged.keyId);

  const verifier = new AuthorizationVerifier(CryptoBootstrap.create());

  const result = await verifier.verify(forged, publicKey);

  console.log("Signature Verification");

  console.log("--------------------------------------------------");

  console.log(`Version Supported : ${result.checks.versionSupported}`);

  console.log(`Signature Valid   : ${result.checks.signatureVerified}`);

  console.log(`Not Expired       : ${result.checks.notExpired}`);

  console.log();

  if (!result.valid) {
    console.log("✓ Signature forgery detected.");

    console.log("Execution rejected.");
  } else {
    console.log("✗ Forged signature accepted.");
  }

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
