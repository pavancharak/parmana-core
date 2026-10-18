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
  console.log("Tutorial 45 - Connector Bypass");
  console.log("==================================================");
  console.log();

  //
  // Generate a legitimate authorization.
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

  console.log("Trusted Connector");

  console.log("--------------------------------------------------");

  console.log("✓ Valid Execution Authorization present.");

  console.log();

  console.log("Compromised Connector");

  console.log("--------------------------------------------------");

  //
  // Simulate a connector attempting to invoke the
  // enterprise system without presenting the
  // authorization.
  //
  const forwardedAuthorization = undefined;

  if (!forwardedAuthorization) {
    console.log("✗ Connector omitted Execution Authorization.");

    console.log("Gateway rejected the request.");

    console.log();

    console.log("Reason:");

    console.log("Connectors cannot bypass pre-execution authorization.");
  }

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
