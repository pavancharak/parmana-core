import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FilePolicyRepository } from "@parmana/policy";
import { RuntimeBuilder } from "@parmana/runtime";
import {
  BusinessTransactionStatus,
  type BusinessTransaction,
} from "@parmana/shared";
import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

//
// An approval for a read. Reads need a signed human approval too: an agent
// reading a pull request is still an agent acting, and what it reads can
// be what it acts on next.
//
// The real policy policies/github-pr-read/1.1.0/policy.json, bound to
// github:pr-fetch, approves only when readApproved is true, and
// readApproved is declared in approvalSignals with resourceId "target",
// so it counts only with a signed approval for that exact pull request
// (owner/repo#number), for github:pr-fetch, not expired, used once.
//
// Runs the real RuntimeEngine with the policy file and the real approval
// check; a demo approver (a key made in memory) plays the person. In
// production the approver signs with scripts/sign-approval.ts or the SDKs'
// signApproval, from a key added through maker checker.
//

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

// One runtime, one approval check, so an approval used once stays used.
const runtime = new RuntimeBuilder()
  .withPolicyRepository(new FilePolicyRepository(join(repoRoot, "policies")))
  .withSignalStateVerifier(demoApprovalSignalVerifier())
  .build(new MemoryExecutionTrustRecordRepository());

let count = 0;

function readRequest(
  pullRequest: string,
  signals: Record<string, unknown> = {},
  action = "github:pr-fetch",
): BusinessTransaction {
  count += 1;
  const id = `tutorial-121-${count}`;
  return {
    businessTransactionId: id,
    metadata: { businessTransactionId: id },
    authority: {
      authorityId: `${id}-authority`,
      authorityType: "SERVICE",
      principalId: "code-review-agent",
      issuedAt: new Date(),
    },
    authorization: {
      authorizationId: `${id}-authorization`,
      authorityId: `${id}-authority`,
      purpose: "Read a pull request before reviewing it",
      issuedAt: new Date(),
    },
    intent: {
      intentId: `${id}-intent`,
      authorizationId: `${id}-authorization`,
      action,
      target: pullRequest,
      parameters: {},
      createdAt: new Date(),
    },
    policy: {
      name: "github-pr-read",
      version: "1.1.0",
      schemaVersion: "1.0.0",
    },
    signals,
    status: BusinessTransactionStatus.RECEIVED,
    createdAt: new Date(),
  } as unknown as BusinessTransaction;
}

const results: Array<{ step: string; expected: boolean; actual: boolean }> = [];

async function step(
  label: string,
  transaction: BusinessTransaction,
  expected: boolean,
): Promise<void> {
  let approved = false;
  let reason: string;
  try {
    const { trustRecord } = await runtime.execute(transaction);
    approved = true;
    reason = `${trustRecord.executions.at(-1)?.decision.reason ?? ""}`;
  } catch (error) {
    reason = (error as Error).message;
  }
  results.push({ step: label, expected, actual: approved });
  console.log(label);
  console.log(`  ${approved ? "APPROVED" : "REFUSED "}  ${reason}`);
  console.log();
}

console.log("Tutorial 121: an approval for a read");
console.log();

await step(
  "1. The agent asks to read acme/api#42 with no approval: refused",
  readRequest("acme/api#42"),
  false,
);

await step(
  "2. The agent sends readApproved: true with no approval: refused",
  readRequest("acme/api#42", { readApproved: true }),
  false,
);

console.log(
  "A reviewer signs: github:pr-fetch, acme/api#42, 15 minutes, once.",
);
console.log();
const approved = await withDemoApproval(readRequest("acme/api#42"));

await step(
  "3. The agent sends the read with the signed approval: approved",
  approved,
  true,
);

await step(
  "4. The same approval sent again on a new request: refused, an approval is used once",
  readRequest("acme/api#42", approved.signals as Record<string, unknown>),
  false,
);

const forAnother = await withDemoApproval(readRequest("acme/api#43"));
await step(
  "5. An approval for acme/api#43 used to read acme/api#42: refused",
  readRequest("acme/api#42", forAnother.signals as Record<string, unknown>),
  false,
);

const forMerge = await withDemoApproval(
  readRequest("acme/api#44", {}, "github:pr-merge"),
);
await step(
  "6. An approval to merge acme/api#44 used to read it: refused, the approval names the action",
  readRequest("acme/api#44", forMerge.signals as Record<string, unknown>),
  false,
);

const failed = results.filter((r) => r.expected !== r.actual);
console.log(
  failed.length === 0
    ? `✓ All ${results.length} steps behaved as the policy says.`
    : `✗ Unexpected: ${failed.map((f) => f.step).join("; ")}`,
);
process.exitCode = failed.length === 0 ? 0 : 1;
