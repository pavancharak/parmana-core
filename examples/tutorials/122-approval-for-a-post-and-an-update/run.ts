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
// A HubSpot deal update, with a person's signed approval. No agent action
// is authorized without one.
//
//   * policies/hubspot-deal-update/1.1.0: dealUpdateApproved, for the deal
//     (parameters.dealId), on every update. A stage move that is not
//     forward is refused even with an approval.
//   * policies/hubspot-deal-read/1.0.0: readApproved, for the deal. An
//     approval to update a deal is not an approval to read it.
//
// Runs the real RuntimeEngine with the policy files and the real approval
// check, with a demo approver (a key made in memory). On the server,
// HubSpotSignalStateVerifier checks the
// declared deal facts against the real deal; this tutorial shows only the
// approval.
//

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const runtime = new RuntimeBuilder()
  .withPolicyRepository(new FilePolicyRepository(join(repoRoot, "policies")))
  .withSignalStateVerifier(demoApprovalSignalVerifier())
  .build(new MemoryExecutionTrustRecordRepository());

let count = 0;

function request(options: {
  action: string;
  target: string;
  parameters: Record<string, unknown>;
  policy: { name: string; version: string };
  signals: Record<string, unknown>;
}): BusinessTransaction {
  count += 1;
  const id = `tutorial-122-${count}`;
  return {
    businessTransactionId: id,
    metadata: { businessTransactionId: id },
    authority: {
      authorityId: `${id}-authority`,
      authorityType: "SERVICE",
      principalId: "ops-agent",
      issuedAt: new Date(),
    },
    authorization: {
      authorizationId: `${id}-authorization`,
      authorityId: `${id}-authority`,
      purpose: "Tutorial 122",
      issuedAt: new Date(),
    },
    intent: {
      intentId: `${id}-intent`,
      authorizationId: `${id}-authorization`,
      action: options.action,
      target: options.target,
      parameters: options.parameters,
      createdAt: new Date(),
    },
    policy: { ...options.policy, schemaVersion: "1.0.0" },
    signals: options.signals,
    status: BusinessTransactionStatus.RECEIVED,
    createdAt: new Date(),
  } as unknown as BusinessTransaction;
}

function update(
  dealId: string,
  signals: Record<string, unknown> = {},
  transitionAllowed = true,
) {
  return request({
    action: "hubspot:deal-update",
    target: `hubspot://deals/${dealId}`,
    parameters: { dealId, dealstage: "qualifiedtobuy" },
    policy: { name: "hubspot-deal-update", version: "1.1.0" },
    signals: {
      currentDealStage: transitionAllowed
        ? "appointmentscheduled"
        : "closedwon",
      proposedDealStage: "qualifiedtobuy",
      dealStageChangeRequested: true,
      dealStageTransitionAllowed: transitionAllowed,
      amountChangeRequested: false,
      amountDeltaAbs: 0,
      amountChangeExceedsThreshold: false,
      ...signals,
    },
  });
}

function read(dealId: string, signals: Record<string, unknown> = {}) {
  return request({
    action: "hubspot:deal-fetch",
    target: `hubspot://deals/${dealId}`,
    parameters: { dealId },
    policy: { name: "hubspot-deal-read", version: "1.0.0" },
    signals,
  });
}

const signalsOf = (t: BusinessTransaction) =>
  t.signals as Record<string, unknown>;

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

console.log("Tutorial 122: an approval for a HubSpot deal update");
console.log();
console.log("HubSpot");
console.log();

await step(
  "1. Move deal 9001 forward with no approval: refused",
  update("9001"),
  false,
);

await step(
  "2. A person approves updating deal 9001; the agent moves it forward: approved",
  await withDemoApproval(update("9001")),
  true,
);

await step(
  "3. An approval for deal 9001 used to update deal 9002: refused",
  update("9002", signalsOf(await withDemoApproval(update("9001")))),
  false,
);

await step(
  "4. An approval for deal 9001, but the stage move is not forward: refused",
  update(
    "9001",
    signalsOf(await withDemoApproval(update("9001", {}, false))),
    false,
  ),
  false,
);

await step(
  "5. An approval to update deal 9001 used to read it: refused, a read needs its own",
  read("9001", {
    readApproved: true,
    approvalArtifact: signalsOf(await withDemoApproval(update("9001")))
      .approvalArtifact,
  }),
  false,
);

await step(
  "6. A person approves reading deal 9001: approved",
  await withDemoApproval(read("9001")),
  true,
);

const failed = results.filter((r) => r.expected !== r.actual);
console.log(
  failed.length === 0
    ? `✓ All ${results.length} steps behaved as the policies say.`
    : `✗ Unexpected: ${failed.map((f) => f.step).join("; ")}`,
);
process.exitCode = failed.length === 0 ? 0 : 1;
