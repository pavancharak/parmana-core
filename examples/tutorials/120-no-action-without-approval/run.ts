import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PolicyAction,
  PolicyValidator,
  type Policy,
  type PolicyCondition,
} from "@parmana/policy";
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
// No AI agent action is authorized without a signed human approval, reads
// included. Two checks enforce it, for every policy and every action:
//
//   * PolicyValidator refuses to load (or accept a proposal for) a policy
//     whose approve rule does not require an approvalSignals fact with
//     is_true, as its whole condition or directly inside its top level
//     "all".
//   * RuntimeEngine refuses an approval when no approval verifier is
//     configured, so the approval signal is never taken on the agent's word.
//
// This tutorial shows both, then checks every policy in policies/: the
// newest version of each loads, and every older version that approved
// without a person is refused. See docs/site/concepts/human-approval.mdx.
//

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const validator = new PolicyValidator();

const results: Array<{ step: string; expected: boolean; actual: boolean }> = [];

function record(
  step: string,
  expected: boolean,
  actual: boolean,
  detail: string,
) {
  results.push({ step, expected, actual });
  console.log(step);
  console.log(`  ${actual ? "LOADS   " : "REFUSED "}  ${detail}`);
  console.log();
}

function policyWith(
  condition: PolicyCondition,
  withApprovalSignal = true,
): Policy {
  return {
    policyId: "tutorial-120",
    policyVersion: "1.0.0",
    schemaVersion: "1.0.0",
    ...(withApprovalSignal && {
      approvalSignals: { humanApproved: { resourceId: "target" } },
    }),
    unboundSignalReasons: {
      riskScore: "Declared by the caller; it can only refuse.",
      ...(!withApprovalSignal && {
        humanApproved:
          "Declared by the caller, with no signed approval behind it.",
      }),
    },
    rules: [
      {
        id: "approve",
        condition,
        outcome: { action: PolicyAction.APPROVE, reason: "Approved." },
      },
      {
        id: "reject-not-approved",
        condition: { fact: "humanApproved", operator: "is_false" },
        outcome: { action: PolicyAction.REJECT, reason: "No approval." },
      },
      {
        id: "reject-default",
        condition: { always: true },
        outcome: { action: PolicyAction.REJECT, reason: "Refused." },
      },
    ],
  };
}

function tryLoad(step: string, policy: Policy, expected: boolean): void {
  try {
    validator.validate(policy);
    record(step, expected, true, "the policy loads");
  } catch (error) {
    record(step, expected, false, (error as Error).message);
  }
}

console.log("Tutorial 120: no action without a signed human approval");
console.log();
console.log("Part 1. Which approve rules a policy may have");
console.log();

tryLoad(
  "1. An approve rule that always approves",
  policyWith({ always: true }),
  false,
);

tryLoad(
  "2. An approve rule on facts the agent declares (riskScore at most 20)",
  policyWith({ fact: "riskScore", operator: "lte", value: 20 }),
  false,
);

tryLoad(
  "3. The approval signal only inside an any: the other branch could approve alone",
  policyWith({
    any: [
      { fact: "humanApproved", operator: "is_true" },
      { fact: "riskScore", operator: "lte", value: 20 },
    ],
  }),
  false,
);

tryLoad(
  "4. humanApproved is_true, but humanApproved is not declared in approvalSignals",
  policyWith({ fact: "humanApproved", operator: "is_true" }, false),
  false,
);

tryLoad(
  "5. humanApproved is_true, declared in approvalSignals, inside the top level all",
  policyWith({
    all: [
      { fact: "humanApproved", operator: "is_true" },
      { fact: "riskScore", operator: "lte", value: 20 },
    ],
  }),
  true,
);

console.log("Part 2. Every policy shipped in policies/");
console.log();

const policiesDir = join(repoRoot, "policies");
let newestLoad = 0;
let olderRefused = 0;
const problems: string[] = [];

for (const name of readdirSync(policiesDir).sort()) {
  const versions = readdirSync(join(policiesDir, name)).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  versions.forEach((version, index) => {
    const policy = JSON.parse(
      readFileSync(join(policiesDir, name, version, "policy.json"), "utf8"),
    ) as Policy;
    let loads = true;
    try {
      validator.validate(policy);
    } catch {
      loads = false;
    }
    const newest = index === versions.length - 1;
    if (newest && loads) newestLoad += 1;
    else if (!newest && !loads) olderRefused += 1;
    else if (newest) problems.push(`${name} ${version} is newest but refused`);
    console.log(
      `  ${loads ? "LOADS   " : "REFUSED "}  ${name} ${version}${newest ? " (newest)" : ""}`,
    );
  });
}
console.log();
results.push({
  step: "6. The newest version of every policy loads",
  expected: true,
  actual: problems.length === 0,
});
console.log(
  `6. ${newestLoad} newest versions load, ${olderRefused} older versions are refused` +
    (problems.length > 0 ? `; problems: ${problems.join(", ")}` : ""),
);
console.log();

console.log(
  "Part 3. The runtime never takes the approval signal on the agent's word",
);
console.log();

function transaction(id: string): BusinessTransaction {
  return {
    businessTransactionId: id,
    metadata: { businessTransactionId: id },
    authority: {
      authorityId: `${id}-authority`,
      authorityType: "SERVICE",
      principalId: "tutorial-120",
      issuedAt: new Date(),
    },
    authorization: {
      authorizationId: `${id}-authorization`,
      authorityId: `${id}-authority`,
      purpose: "Tutorial 120",
      issuedAt: new Date(),
    },
    intent: {
      intentId: `${id}-intent`,
      authorizationId: `${id}-authorization`,
      action: "tutorial:read-report",
      target: "report://q3-revenue",
      parameters: {},
      createdAt: new Date(),
    },
    policy: { name: "tutorial-120", version: "1.0.0", schemaVersion: "1.0.0" },
    signals: { humanApproved: true, riskScore: 5 },
    status: BusinessTransactionStatus.RECEIVED,
    createdAt: new Date(),
  } as unknown as BusinessTransaction;
}

const loadable = policyWith({
  all: [
    { fact: "humanApproved", operator: "is_true" },
    { fact: "riskScore", operator: "lte", value: 20 },
  ],
});
const repository = {
  load: async () => loadable,
  save: async () => undefined,
};

async function run(
  step: string,
  withVerifier: boolean,
  tx: BusinessTransaction,
  expected: boolean,
): Promise<void> {
  let builder = new RuntimeBuilder().withPolicyRepository(repository as never);
  if (withVerifier) {
    builder = builder.withSignalStateVerifier(demoApprovalSignalVerifier());
  }
  const runtime = builder.build(new MemoryExecutionTrustRecordRepository());
  try {
    await runtime.execute(tx);
    results.push({ step, expected, actual: true });
    console.log(step);
    console.log("  APPROVED");
  } catch (error) {
    results.push({ step, expected, actual: false });
    console.log(step);
    console.log(`  REFUSED   ${(error as Error).message}`);
  }
  console.log();
}

await run(
  "7. humanApproved: true, no signed approval, no approval verifier configured",
  false,
  transaction("tutorial-120-a"),
  false,
);

await run(
  "8. humanApproved: true, no signed approval, with the approval verifier",
  true,
  transaction("tutorial-120-b"),
  false,
);

await run(
  "9. A person signs an approval for report://q3-revenue, the agent attaches it",
  true,
  await withDemoApproval(transaction("tutorial-120-c"), loadable),
  true,
);

const failed = results.filter((r) => r.expected !== r.actual);
console.log(
  failed.length === 0
    ? `✓ All ${results.length} steps behaved as the rule says.`
    : `✗ Unexpected: ${failed.map((f) => f.step).join("; ")}`,
);
process.exitCode = failed.length === 0 ? 0 : 1;
