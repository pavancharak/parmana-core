import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import { FilePolicyRepository } from "@parmana/policy";

import { RuntimeBuilder } from "@parmana/runtime";

import transaction1 from "./transaction-1.json" with { type: "json" };

import transaction2 from "./transaction-2.json" with { type: "json" };

import transaction3 from "./transaction-3.json" with { type: "json" };

import transaction4 from "./transaction-4.json" with { type: "json" };
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

type Failure = {
  businessTransactionId: string;
  reason: string;
};

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 21 - Partial Failure Handling");
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

  const transactions = [transaction1, transaction2, transaction3, transaction4];

  const failures: Failure[] = [];

  let successful = 0;

  for (const [index, transaction] of transactions.entries()) {
    console.log(`Processing Transaction ${index + 1}...`);

    try {
      const { context } = await runtime.execute(
        await withDemoApproval(transaction),
      );

      console.log(`✓ ${context.decision.outcome}`);

      successful++;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";

      console.log(`✗ ${reason}`);

      failures.push({
        businessTransactionId: transaction.businessTransactionId,
        reason,
      });
    }

    console.log();
  }

  console.log("==================================================");
  console.log("Summary");
  console.log("==================================================");
  console.log();

  console.log(`Processed : ${transactions.length}`);

  console.log(`Succeeded : ${successful}`);

  console.log(`Failed    : ${failures.length}`);

  if (failures.length > 0) {
    console.log();
    console.log("Failed Transactions");
    console.log();

    for (const failure of failures) {
      console.log(`• ${failure.businessTransactionId}`);

      console.log(`  ${failure.reason}`);

      console.log();
    }
  }

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
