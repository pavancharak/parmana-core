import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import { FilePolicyRepository } from "@parmana/policy";

import { RuntimeBuilder } from "@parmana/runtime";

import transaction from "./transaction.json" with { type: "json" };
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";
import { withRequiredFields } from "../../shared/helpers/business-transaction.js";

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
    .withPolicyRepository(new FilePolicyRepository("fixtures/policies"))
    .build(repository);

  console.log("Executing transaction...");
  console.log();

  const { context } = await runtime.execute(
    await withDemoApproval(withRequiredFields(transaction)),
  );

  console.log("✓ Policy approved.");

  console.log();
  console.log("Execution Permit");
  console.log("------------------------------");

  console.dir(context.authorization, { depth: null });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
