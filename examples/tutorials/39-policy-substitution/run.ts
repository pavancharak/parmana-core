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
  console.log("Tutorial 39 - Policy Substitution");
  console.log("==================================================");
  console.log();

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

  const authorizedPolicy = `${context.authorization.payload.policyName}@${context.authorization.payload.policyVersion}`;

  const substitutedPolicy = `${context.authorization.payload.policyName}@3.0.0`;

  console.log("Authorized Policy");

  console.log(authorizedPolicy);

  console.log();

  console.log("Substituted Policy");

  console.log(substitutedPolicy);

  console.log();

  if (authorizedPolicy !== substitutedPolicy) {
    console.log("✓ Policy substitution detected.");

    console.log("Execution rejected.");
  } else {
    console.log("✗ Policy substitution not detected.");
  }

  console.log();

  console.log("Policy Integrity");

  console.log("--------------------------------------------------");

  console.log("Authorizations are valid only for the policy");

  console.log("under which they were originally issued.");

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
