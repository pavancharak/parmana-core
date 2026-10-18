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
  console.log("Tutorial 33 - Execution Boundary");
  console.log("==================================================");
  console.log();

  //
  // Build Runtime
  //
  const runtime = new RuntimeBuilder()
    .withSignalStateVerifier(demoApprovalSignalVerifier())
    .withPolicyRepository(new FilePolicyRepository("policies"))
    .build(new MemoryExecutionTrustRecordRepository());

  console.log("Executing Business Transaction...");

  const { context } = await runtime.execute(
    await withDemoApproval(transaction),
  );

  console.log();

  console.log("Execution Boundary");

  console.log("--------------------------------------------------");

  console.log("AI proposes the action.");

  console.log("✓ Policy evaluated.");

  console.log("✓ Execution authorized.");

  console.log("✓ Execution request created.");

  console.log();

  console.log("============== Execution Boundary ==============");

  console.log("Everything above is governed by Parmana.");

  console.log("Everything below belongs to the enterprise execution system.");

  console.log();

  console.log("Enterprise Execution");

  console.log("--------------------------------------------------");

  console.log("ERP / Payment System / CRM / Database");

  console.log("executes only after receiving");

  console.log("a valid Execution Authorization.");

  console.log();

  if (context.authorization) {
    console.log("Authorization");

    console.log("--------------------------------------------------");

    console.log(
      `Authorization ID : ${context.authorization.payload.authorizationId}`,
    );

    console.log(
      `Policy           : ${context.authorization.payload.policyName}@${context.authorization.payload.policyVersion}`,
    );

    console.log(
      `Decision         : ${context.authorization.payload.decisionId}`,
    );

    console.log(
      `Transaction      : ${context.authorization.payload.businessTransactionId}`,
    );
  }

  console.log();

  console.log("Execution Boundary Summary");

  console.log("--------------------------------------------------");

  console.log("• Parmana authorizes execution.");

  console.log("• Parmana never executes enterprise actions.");

  console.log("• Enterprise systems execute only authorized requests.");

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
