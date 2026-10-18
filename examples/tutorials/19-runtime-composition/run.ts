import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import { FilePolicyRepository } from "@parmana/policy";

import { RuntimeBuilder } from "@parmana/runtime";

import { LoggingHook } from "./LoggingHook.js";
import { MetricsHook } from "./MetricsHook.js";
import { CustomRuntimeComponent } from "./CustomRuntimeComponent.js";

import transaction from "./transaction.json" with { type: "json" };
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 19 - Runtime Composition");
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
    .addStage(new CustomRuntimeComponent())
    .addHook(new LoggingHook())
    .addHook(new MetricsHook())
    .build(repository);

  //
  // Execute
  //
  const { trustRecord } = await runtime.execute(
    await withDemoApproval(transaction),
  );

  console.log();
  console.log("==================================================");
  console.log("Execution Complete");
  console.log("==================================================");
  console.log();

  console.log(`Trust Record ID  : ${trustRecord.trustRecordId}`);

  console.log(`Trust Record Hash: ${trustRecord.trustRecordHash}`);

  console.log();

  console.log("Runtime successfully composed from:");

  console.log("  ✓ Policy Repository");

  console.log("  ✓ Runtime Component");

  console.log("  ✓ Logging Hook");

  console.log("  ✓ Metrics Hook");

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
