//
// docs/VERIFICATION-GAPS.md G-33/G-38/G-39: this tutorial doubles as a
// worked example of authoring a NEW policy correctly from day one under
// the fail-closed boundSignals discipline (G-33) and the advisory
// rule-conflict checker (G-39) -- rather than a policy that needed
// retrofitting, like the 10 pre-existing ones did.
//
// policies/api-key-issuance/1.1.0/policy.json:
//   - keyLifetimeDays has a genuine Intent-side equivalent (an amount-like
//     field) and is bound via boundSignals -> parameters.lifetimeDays, so
//     SignalIntentBinder catches a caller declaring one lifetime while the
//     Intent actually requests another (Scenario 2 below).
//   - requesterVerified/scopeAuthorized/riskScore are independently
//     attested facts with no Intent-side equivalent, each acknowledged
//     with a specific reason in unboundSignalReasons rather than left
//     unmentioned -- PolicyValidator.validate() would otherwise refuse to
//     load this policy at all.
//   - The five rules (one approve, three specific rejects, one trailing
//     always-true catch-all) are exactly the shape
//     PolicyValidator.findRuleConflicts() reports zero warnings for
//     (Scenario 4).
//

import path from "node:path";

import { FilePolicyRepository, PolicyValidator } from "@parmana/policy";
import { RuntimeBuilder } from "@parmana/runtime";
import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";
import type { BusinessTransaction } from "@parmana/shared";
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

const root = path.resolve(import.meta.dirname);

const policyRepository = new FilePolicyRepository(
  path.resolve(root, "../../../policies"),
);

const trustRecords = new MemoryExecutionTrustRecordRepository();

const runtime = new RuntimeBuilder()
  .withSignalStateVerifier(demoApprovalSignalVerifier())
  .withPolicyRepository(policyRepository)
  .build(trustRecords);

async function transactionFor(
  businessTransactionId: string,
  overrides: {
    readonly requesterVerified?: boolean;
    readonly scopeAuthorized?: boolean;
    readonly signaledLifetimeDays?: number;
    readonly intentLifetimeDays?: number;
    readonly riskScore?: number;
  } = {},
): Promise<BusinessTransaction> {
  const {
    requesterVerified = true,
    scopeAuthorized = true,
    signaledLifetimeDays = 30,
    intentLifetimeDays = signaledLifetimeDays,
    riskScore = 10,
  } = overrides;

  return withDemoApproval({
    businessTransactionId,

    metadata: { businessTransactionId },

    authority: {
      authorityId: "authority-106",
      authorityType: "SERVICE",
      principalId: "tutorial-106",
      issuedAt: new Date(),
    },

    authorization: {
      authorizationId: `${businessTransactionId}-authorization`,
      authorityId: "authority-106",
      purpose: "Tutorial 106",
      issuedAt: new Date(),
    },

    intent: {
      intentId: `${businessTransactionId}-intent`,
      authorizationId: `${businessTransactionId}-authorization`,
      action: "api-key-issuance",
      target: "caller/service-a",
      parameters: {
        lifetimeDays: intentLifetimeDays,
        scope: "read:invoices",
      },
      createdAt: new Date(),
    },

    policy: {
      name: "api-key-issuance",
      version: "1.1.0",
      schemaVersion: "1.0.0",
    },

    signals: {
      requesterVerified,
      scopeAuthorized,
      keyLifetimeDays: signaledLifetimeDays,
      riskScore,
    },

    status: "RECEIVED",

    createdAt: new Date(),
  } as unknown as BusinessTransaction);
}

console.log();
console.log("==================================================");
console.log("Tutorial 106 - API Key Issuance (writing a new policy)");
console.log("==================================================");
console.log();

console.log(
  "Scenario 1: verified requester, authorized scope, 30-day key, low risk -- approved",
);
console.log("--------------------------------------------------");
const { trustRecord: approved } = await runtime.execute(
  await transactionFor("tx-106-approve"),
);
console.log(`Decision outcome : ${approved.executions[0]?.decision.outcome}`);
console.log(`Reason           : ${approved.executions[0]?.decision.reason}`);
console.log();

console.log(
  "Scenario 2: signals declare a 30-day key, but the Intent actually requests 400 days -- boundSignals catches the mismatch before PolicyEngine ever runs",
);
console.log("--------------------------------------------------");
let scenario2Reason = "";
try {
  await runtime.execute(
    await transactionFor("tx-106-mismatch", {
      signaledLifetimeDays: 30,
      intentLifetimeDays: 400,
    }),
  );
} catch (error) {
  scenario2Reason = error instanceof Error ? error.message : String(error);
}
console.log(`Rejected : ${scenario2Reason}`);
console.log();

console.log(
  "Scenario 3: requester identity not verified -- rejected with a specific reason",
);
console.log("--------------------------------------------------");
//
// A REJECTED decision does not come back as a normal return value --
// RuntimeEngine throws a RuntimeError whose message is the matched
// rule's rejection reason (see the "Verify" section of Tutorial 14 /
// docs/site/guides/write-your-first-policy.mdx for why).
//
let scenario3Reason = "";
try {
  await runtime.execute(
    await transactionFor("tx-106-unverified", { requesterVerified: false }),
  );
} catch (error) {
  scenario3Reason = error instanceof Error ? error.message : String(error);
}
console.log(`Rejected : ${scenario3Reason}`);
console.log();

console.log(
  "Scenario 4: this policy has zero rule conflicts (the shape every policy in this repo now targets)",
);
console.log("--------------------------------------------------");
const policy = await policyRepository.load("api-key-issuance", "1.1.0");
const validator = new PolicyValidator();
const conflicts = validator.findRuleConflicts(policy);
console.log(`Rule-conflict warnings : ${conflicts.length}`);
console.log();

const allPassed =
  approved.executions[0]?.decision.outcome === "APPROVED" &&
  scenario2Reason.includes("do not match the executed intent") &&
  scenario3Reason.includes("identity has not been verified") &&
  conflicts.length === 0;

if (allPassed) {
  console.log(
    "✓ A new policy authored with boundSignals + unboundSignalReasons from the start loads cleanly, catches signal/intent drift on its bound fact, rejects with specific reasons, and reports zero rule conflicts.",
  );
} else {
  console.log(
    "✗ Expected every scenario above to behave exactly as documented.",
  );
}

console.log();
console.log("Tutorial Complete");
console.log("This is currently the last tutorial in the sequence.");
