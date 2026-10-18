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
  console.log("Tutorial 23 - Production Deployment");
  console.log("==================================================");
  console.log();

  //
  // Production configuration
  //

  console.log("Loading production configuration...");

  const trustRecords = new MemoryExecutionTrustRecordRepository();

  const policyRepository = new FilePolicyRepository("policies");

  console.log("✓ Policy Repository configured.");

  console.log("✓ Trust Record Repository configured.");

  //
  // Runtime
  //

  const runtime = new RuntimeBuilder()
    .withSignalStateVerifier(demoApprovalSignalVerifier())
    .withPolicyRepository(policyRepository)
    .build(trustRecords);

  console.log("✓ Runtime initialized.");

  console.log();

  //
  // Execute
  //

  console.log("Executing transaction...");

  const { context, trustRecord } = await runtime.execute(
    await withDemoApproval(transaction),
  );

  console.log(`✓ ${context.decision.outcome}`);

  console.log();

  console.log("Execution Trust Record stored.");

  console.log(`Trust Record ID   : ${trustRecord.trustRecordId}`);

  console.log(`Trust Record Hash : ${trustRecord.trustRecordHash}`);

  console.log();

  console.log("==================================================");
  console.log("Production Runtime completed successfully.");
  console.log("==================================================");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
