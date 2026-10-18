import { FilePolicyRepository } from "@parmana/policy";

import { RuntimeBuilder } from "@parmana/runtime";

import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import transaction from "./transaction.json" with { type: "json" };

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
    .withPolicyRepository(new FilePolicyRepository("policies"))
    .build(new MemoryExecutionTrustRecordRepository());

  console.log("Executing Business Transaction...");

  const result = await runtime.execute(transaction);

  const { context } = result;

  console.log();
  console.log("Runtime Pipeline");
  console.log("------------------------------");

  console.log(`Decision          : ${context.decision ? "✓" : "✗"}`);

  console.log(`Authorization     : ${context.authorization ? "✓" : "✗"}`);

  console.log(`Execution         : ${context.execution ? "✓" : "✗"}`);

  console.log(`Evidence          : ${context.evidence ? "✓" : "✗"}`);

  console.log(`Verification      : ${context.verification ? "✓" : "✗"}`);

  console.log(`Receipt           : ${context.receipt ? "✓" : "✗"}`);

  console.log(`Trust Record      : ${context.trustRecord ? "✓" : "✗"}`);

  console.log();

  console.log("Pipeline completed successfully.");

  console.log();
  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
