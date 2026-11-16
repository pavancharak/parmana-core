import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import { FilePolicyRepository } from "@parmana/policy";

import { RuntimeBuilder } from "@parmana/runtime";

import { LoggingHook } from "./LoggingHook.js";
import { MetricsHook } from "./MetricsHook.js";

import transaction from "./transaction.json" with { type: "json" };
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";
import { withRequiredFields } from "../../shared/helpers/business-transaction.js";

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 18 - Runtime Hooks");
  console.log("==================================================");
  console.log();

  //
  // Trust Record Repository
  //

  const repository = new MemoryExecutionTrustRecordRepository();

  //
  // Runtime
  //

  const runtime = new RuntimeBuilder()
    .withSignalStateVerifier(demoApprovalSignalVerifier())
    .withPolicyRepository(new FilePolicyRepository("policies"))
    .addHook(new LoggingHook())
    .addHook(new MetricsHook())
    .build(repository);

  //
  // Execute
  //

  const { trustRecord } = await runtime.execute(
    await withDemoApproval(withRequiredFields(transaction)),
  );

  console.log();
  console.log("==================================================");
  console.log("Execution Complete");
  console.log("==================================================");
  console.log();

  console.log(`Trust Record ID : ${trustRecord.trustRecordId}`);

  console.log(`Trust Record Hash : ${trustRecord.trustRecordHash}`);

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
