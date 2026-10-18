import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import { FilePolicyRepository } from "@parmana/policy";

import { RuntimeBuilder } from "@parmana/runtime";

import { PaymentService } from "./PaymentService.js";

import transaction from "./transaction.json" with { type: "json" };
import { demoApprovalSignalVerifier } from "../../shared/helpers/demo-approval.js";

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 24 - SDK Integration Patterns");
  console.log("==================================================");
  console.log();

  //
  // Infrastructure
  //

  const trustRecords = new MemoryExecutionTrustRecordRepository();

  const policyRepository = new FilePolicyRepository("policies");

  //
  // Parmana Runtime
  //

  const runtime = new RuntimeBuilder()
    .withSignalStateVerifier(demoApprovalSignalVerifier())
    .withPolicyRepository(policyRepository)
    .build(trustRecords);

  //
  // Application Service
  //

  const paymentService = new PaymentService(runtime);

  console.log("Submitting payment request...");

  const trustRecord = await paymentService.releasePayment(transaction);

  console.log("✓ Payment released.");

  console.log();

  console.log(`Trust Record ID   : ${trustRecord.trustRecordId}`);

  console.log(`Trust Record Hash : ${trustRecord.trustRecordHash}`);

  console.log();

  console.log("==================================================");
  console.log("SDK Integration completed successfully.");
  console.log("==================================================");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
