import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import { FilePolicyRepository } from "@parmana/policy";

import { RuntimeBuilder } from "@parmana/runtime";

import transaction1 from "./transaction-1.json" with { type: "json" };

import transaction2 from "./transaction-2.json" with { type: "json" };

import transaction3 from "./transaction-3.json" with { type: "json" };
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 20 - Batch Execution");
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

  const transactions = [transaction1, transaction2, transaction3];

  let successful = 0;
  let failed = 0;

  for (const [index, transaction] of transactions.entries()) {
    console.log(`Processing transaction ${index + 1}...`);

    try {
      const { context } = await runtime.execute(
        await withDemoApproval(transaction),
      );

      console.log(`✓ ${context.decision.outcome}`);

      successful++;
    } catch (error) {
      console.log(`✗ ${(error as Error).message}`);

      failed++;
    }

    console.log();
  }

  console.log("==================================================");
  console.log("Batch Summary");
  console.log("==================================================");
  console.log();

  console.log(`Total Transactions : ${transactions.length}`);

  console.log(`Successful         : ${successful}`);

  console.log(`Failed             : ${failed}`);

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
