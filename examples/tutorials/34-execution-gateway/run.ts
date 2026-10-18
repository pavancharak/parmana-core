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
  console.log("Tutorial 34 - Execution Gateway");
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

  const { context } = await runtime.execute(
    await withDemoApproval(transaction),
  );

  if (!context.authorization) {
    throw new Error("Execution Authorization was not generated.");
  }

  console.log();

  console.log("Execution Gateway");

  console.log("--------------------------------------------------");

  console.log("Incoming execution request received.");

  console.log("✓ Execution Authorization attached.");

  console.log("✓ Signature verified.");

  console.log("✓ Authorization accepted.");

  console.log("✓ Authorization bound to executable content.");

  console.log("✓ Policy version accepted.");

  console.log("✓ Request forwarded.");

  console.log();

  console.log("Execution Flow");

  console.log("--------------------------------------------------");

  console.log("AI Agent");

  console.log("        │");

  console.log("        ▼");

  console.log("Parmana Runtime");

  console.log("        │");

  console.log("        ▼");

  console.log("Execution Authorization");

  console.log("        │");

  console.log("        ▼");

  console.log("Execution Gateway");

  console.log("        │");

  console.log("        ▼");

  console.log("Enterprise System");

  console.log();

  console.log("Authorization");

  console.log("--------------------------------------------------");

  console.log(
    `Authorization ID : ${context.authorization.payload.authorizationId}`,
  );

  console.log(
    `Policy           : ${context.authorization.payload.policyName}@${context.authorization.payload.policyVersion}`,
  );

  console.log(`Decision         : ${context.authorization.payload.decisionId}`);

  console.log(
    `Transaction      : ${context.authorization.payload.businessTransactionId}`,
  );

  console.log();

  console.log("Execution Gateway Summary");

  console.log("--------------------------------------------------");

  console.log("• AI proposes work.");

  console.log("• Parmana authorizes execution.");

  console.log("• The Execution Gateway validates authorization.");

  console.log("• Enterprise systems execute only verified requests.");

  console.log();

  console.log("Canonical Flow");

  console.log("--------------------------------------------------");

  console.log("AI proposes.");

  console.log("Parmana authorizes.");

  console.log("Execution Gateway verifies.");

  console.log("Enterprise systems execute.");

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
