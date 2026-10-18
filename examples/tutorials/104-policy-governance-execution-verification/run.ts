import crypto from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  BusinessTransactionStatus,
  PendingPolicyChangeStatus,
} from "@parmana/shared";
import type {
  Authority,
  Authorization,
  BusinessTransaction,
  PendingPolicyChange,
  TransactionMetadata,
} from "@parmana/shared";
import { PolicyChangeCrypto } from "@parmana/crypto";
import { FilePolicyRepository, PolicyAction } from "@parmana/policy";
import type { Policy } from "@parmana/policy";
import { RuntimeBuilder } from "@parmana/runtime";
import {
  MemoryExecutionTrustRecordRepository,
  MemoryPolicyChangeApprovalRecordRepository,
} from "@parmana/storage";
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

//
// docs/CLAIMS.md 2.35: on top of the maker-checker approval flow
// (Tutorial 103) and the deploy-time/periodic integrity check that
// detects a bypass after the fact, RuntimeEngine can now refuse
// execution BEFORE PolicyEngine ever evaluates a single rule, when a
// PolicyGovernanceExecutionVerifier is configured -- packages/api's
// production wiring (application.ts) only does this when
// POLICY_EXECUTION_VERIFICATION_ENFORCED=true, since every real policy
// in this system is still PENDING_APPROVAL. This tutorial builds the
// same verifier directly against a scratch policy directory so it can
// show all four outcomes without touching real state.
//
const { PolicyGovernanceExecutionVerifier } =
  await import("../../../packages/api/src/governance/PolicyGovernanceExecutionVerifier.js");
const { PolicyChangeApprovalService } =
  await import("../../../packages/api/src/governance/PolicyChangeApprovalService.js");
const { verifyPolicyGovernanceIntegrityAtStartup } =
  await import("../../../packages/api/src/governance/verifyPolicyGovernanceIntegrityAtStartup.js");

const scratchPolicyDir = mkdtempSync(
  path.join(tmpdir(), "parmana-tutorial-104-policies-"),
);

function policy(policyId: string): Policy {
  return {
    policyId,
    policyVersion: "1.0.0",
    schemaVersion: "1.0.0",
    // No action is authorized without a signed human approval.
    approvalSignals: { humanApproved: { resourceId: "target" } },
    rules: [
      {
        id: "approve-with-approval",
        condition: { fact: "humanApproved", operator: "is_true" },
        outcome: { action: PolicyAction.APPROVE, reason: "tutorial fixture" },
      },
    ],
  };
}

async function transactionFor(
  policyId: string,
  id: string,
): Promise<BusinessTransaction> {
  return withDemoApproval(
    {
      businessTransactionId: id,
      metadata: { executionMode: "SYNC" } as unknown as TransactionMetadata,
      authority: {} as Authority,
      authorization: {} as Authorization,
      intent: {
        intentId: `${id}-intent`,
        authorizationId: `${id}-authorization`,
        action: "tutorial:noop",
        target: "tutorial://target",
        parameters: {},
        createdAt: new Date(),
      },
      policy: { name: policyId, version: "1.0.0", schemaVersion: "1.0.0" },
      signals: {},
      status: BusinessTransactionStatus.RECEIVED,
      createdAt: new Date(),
    },
    policy(policyId),
  );
}

const policyRepository = new FilePolicyRepository(scratchPolicyDir);
const policyChangeCrypto = new PolicyChangeCrypto();
const policyChangeApprovalRecordRepository =
  new MemoryPolicyChangeApprovalRecordRepository();

const approvalService = new PolicyChangeApprovalService({
  policyRepository,
  policyChangeCrypto,
  policyChangeApprovalRecordRepository,
});

const executionVerifier = new PolicyGovernanceExecutionVerifier(
  policyChangeApprovalRecordRepository,
  policyChangeCrypto,
);

const runtime = new RuntimeBuilder()
  .withSignalStateVerifier(demoApprovalSignalVerifier())
  .withPolicyRepository(policyRepository)
  .withPolicyExecutionVerifier(executionVerifier)
  .build(new MemoryExecutionTrustRecordRepository());

async function approve(policyId: string): Promise<void> {
  const change: PendingPolicyChange = {
    pendingPolicyChangeId: crypto.randomUUID(),
    policyName: policyId,
    policyVersion: "1.0.0",
    proposedContent: policy(
      policyId,
    ) as unknown as PendingPolicyChange["proposedContent"],
    proposedBy: "tutorial-maker",
    proposedAt: new Date(),
    status: PendingPolicyChangeStatus.PENDING_APPROVAL,
    reason: "tutorial proposal",
  };

  await approvalService.approve(change, "tutorial-checker");
}

console.log();
console.log("==================================================");
console.log("Tutorial 104 - Policy Governance Execution Verification");
console.log("==================================================");
console.log();

try {
  console.log(
    "Scenario 1: A properly approved, unmodified policy executes normally",
  );
  console.log("--------------------------------------------------");
  await approve("tutorial-104-approved");
  const okResult = await runtime.execute(
    await transactionFor("tutorial-104-approved", "tx-1"),
  );
  console.log(
    `Decision outcome : ${okResult.trustRecord.executions[0]?.decision.outcome}`,
  );
  console.log();

  console.log(
    "Scenario 2: A policy with NO approval record is refused before PolicyEngine ever runs",
  );
  console.log("--------------------------------------------------");
  await policyRepository.save(
    "tutorial-104-unapproved",
    "1.0.0",
    policy("tutorial-104-unapproved"),
  );
  let scenario2Reason = "";
  try {
    await runtime.execute(
      await transactionFor("tutorial-104-unapproved", "tx-2"),
    );
  } catch (error) {
    scenario2Reason = error instanceof Error ? error.message : String(error);
  }
  console.log(`Refused : ${scenario2Reason}`);
  console.log();

  console.log(
    "Scenario 3: The approved policy's live file is edited outside the governed API -- refused",
  );
  console.log("--------------------------------------------------");
  const tampered: Policy = {
    ...policy("tutorial-104-approved"),
    rules: [
      {
        id: "approve-with-approval",
        condition: { fact: "humanApproved", operator: "is_true" },
        outcome: {
          action: PolicyAction.APPROVE,
          reason: "TAMPERED, not what was approved",
        },
      },
    ],
  };
  await policyRepository.save("tutorial-104-approved", "1.0.0", tampered);
  let scenario3Reason = "";
  try {
    await runtime.execute(
      await transactionFor("tutorial-104-approved", "tx-3"),
    );
  } catch (error) {
    scenario3Reason = error instanceof Error ? error.message : String(error);
  }
  console.log(`Refused : ${scenario3Reason}`);

  // Deploy-time/periodic detection (docs/CLAIMS.md 2.34) independently
  // catches the same live-file tampering scenario 3 just produced --
  // a second, structurally distinct layer, not a duplicate check.
  const integrityResult = await verifyPolicyGovernanceIntegrityAtStartup({
    policyRepository,
    policyChangeCrypto,
    policyChangeApprovalRecordRepository,
  });
  console.log(
    `Independently detected by the deploy-time integrity check too : ${JSON.stringify(integrityResult.mismatches)}`,
  );
  console.log();

  console.log(
    "Scenario 4: The stored approval record itself is tampered with -- refused (signature no longer verifies)",
  );
  console.log("--------------------------------------------------");
  await policyRepository.save(
    "tutorial-104-approved",
    "1.0.0",
    policy("tutorial-104-approved"),
  );
  const realRecord =
    await policyChangeApprovalRecordRepository.findMostRecentFor(
      "tutorial-104-approved",
      "1.0.0",
    );
  if (realRecord) {
    // Replaces the stored record (same record id) with an edited copy.
    // It names its own pending change, since the repository keeps one
    // approval record per pending change; its signature no longer
    // verifies either way.
    await policyChangeApprovalRecordRepository.create({
      ...realRecord,
      pendingPolicyChangeId: crypto.randomUUID(),
      approvedBy: "an-attacker",
    });
  }
  let scenario4Reason = "";
  try {
    await runtime.execute(
      await transactionFor("tutorial-104-approved", "tx-4"),
    );
  } catch (error) {
    scenario4Reason = error instanceof Error ? error.message : String(error);
  }
  console.log(`Refused : ${scenario4Reason}`);
  console.log();

  const allPassed =
    okResult.trustRecord.executions[0]?.decision.outcome === "APPROVED" &&
    scenario2Reason.includes("has no PolicyChangeApprovalRecord") &&
    scenario3Reason.includes(
      "does not match its most recent approval record",
    ) &&
    integrityResult.mismatches.length > 0 &&
    scenario4Reason.includes("signature does not verify");

  if (allPassed) {
    console.log(
      "✓ Execution-time prevention (RuntimeEngine) and deploy-time/periodic detection (verifyPolicyGovernanceIntegrityAtStartup) independently agree: only a policy with an intact, verifiable approval chain executes.",
    );
  } else {
    console.log(
      "✗ Expected every scenario above to behave exactly as documented.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 105 - Tenant Key Isolation");
} finally {
  rmSync(scratchPolicyDir, { recursive: true, force: true });
}
