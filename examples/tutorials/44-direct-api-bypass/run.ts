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
  console.log("Tutorial 44 - Direct API Bypass");
  console.log("==================================================");
  console.log();

  //
  // Generate a legitimate authorization so we can
  // compare it with a request that bypasses Parmana.
  //
  const runtime = new RuntimeBuilder()
    .withSignalStateVerifier(demoApprovalSignalVerifier())
    .withPolicyRepository(new FilePolicyRepository("policies"))
    .build(new MemoryExecutionTrustRecordRepository());

  const { context } = await runtime.execute(
    await withDemoApproval(transaction),
  );

  if (!context.authorization) {
    throw new Error("Execution Authorization missing.");
  }

  console.log("Legitimate Request");
  console.log("--------------------------------------------------");

  console.log("✓ Execution Authorization present.");

  console.log();

  console.log("Direct API Call");
  console.log("--------------------------------------------------");

  //
  // Simulate a request sent directly to the
  // enterprise API with no authorization.
  //
  const authorization = undefined;

  if (!authorization) {
    console.log("✗ No Execution Authorization supplied.");

    console.log("Gateway rejected the request.");

    console.log();

    console.log("Reason:");

    console.log("Sensitive APIs only accept requests");

    console.log("that carry a valid Execution Authorization.");
  }

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
