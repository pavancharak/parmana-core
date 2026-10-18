import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import { FilePolicyRepository } from "@parmana/policy";

import { RuntimeBuilder } from "@parmana/runtime";

import transaction from "./transaction.json" with { type: "json" };
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 25 - Execution Permit Generation");
  console.log("==================================================");
  console.log();

  //
  // Repository
  //

  const repository = new MemoryExecutionTrustRecordRepository();

  //
  // Runtime
  //

  const runtime = new RuntimeBuilder()
    .withSignalStateVerifier(demoApprovalSignalVerifier())
    .withPolicyRepository(new FilePolicyRepository("policies"))
    .build(repository);

  console.log("Executing transaction...");
  console.log();

  const { context } = await runtime.execute(
    await withDemoApproval(transaction),
  );

  console.log("✓ Policy approved.");

  console.log();
  console.log("Execution Permit");
  console.log("------------------------------");

  console.dir(context.authorization, { depth: null });

  return;

  console.log(`Authorization ID : ${permit.authorizationId}`);

  console.log(`Decision ID      : ${permit.decisionId}`);

  console.log(
    `Policy           : ${permit.policyName}@${permit.policyVersion}`,
  );

  console.log(`Issued At        : ${permit.authorizedAt.toISOString()}`);

  console.log(`Expires At       : ${permit.expiresAt.toISOString()}`);

  console.log();

  console.log("Permit Signature");
  console.log("------------------------------");

  console.log(`Algorithm : ${context.authorization.algorithm}`);

  console.log(`Key ID    : ${context.authorization.keyId}`);

  console.log(`Signature : ${context.authorization.signature}`);

  console.log();

  console.log("✓ Signature generated.");

  console.log();
  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
