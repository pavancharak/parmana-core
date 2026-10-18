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
  console.log("Tutorial 32 - Runtime Pipeline");
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

  const result = await runtime.execute(await withDemoApproval(transaction));

  const { context, trustRecord } = result;

  console.log();
  console.log("Runtime Pipeline");
  console.log("------------------------------");

  console.log(`Decision          : ${context.decision ? "✓" : "✗"}`);

  console.log(`Authorization     : ${context.authorization ? "✓" : "✗"}`);

  console.log(`Execution         : ${context.execution ? "✓" : "✗"}`);

  console.log(`Trust Record      : ${trustRecord.trustRecordId ? "✓" : "✗"}`);

  console.log(`Signed            : ${trustRecord.signature.value ? "✓" : "✗"}`);

  console.log();
  console.log("Pipeline completed successfully.");

  console.log();
  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
