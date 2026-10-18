import "dotenv/config";

import crypto from "node:crypto";

import { loadConfig } from "@parmana/shared";
import type {
  PendingPolicyChange,
  PolicyChangeApprovalRecord,
} from "@parmana/shared";
import { PendingPolicyChangeStatus } from "@parmana/shared";
import { PolicyChangeCrypto } from "@parmana/crypto";
import { FilePolicyRepository } from "@parmana/policy";
import { StorageFactory } from "@parmana/storage";
import type { StorageProvider } from "@parmana/storage";

/**
 * One-time, manually-invoked backfill: every (policyName, policyVersion)
 * with a live policy.json, no PolicyChangeApprovalRecord, AND no open
 * (PENDING_APPROVAL) proposal -- i.e. genuinely never touched by Policy
 * Governance at all -- gets exactly one synthetic PendingPolicyChange
 * (proposed and resolved by a fixed system identity, never a real
 * human) and its corresponding signed PolicyChangeApprovalRecord,
 * content unchanged.
 *
 * Deliberately excludes any (policyName, policyVersion) that already
 * has a real PENDING_APPROVAL proposal -- see docs/CLAIMS.md's own
 * "Legacy-policy backfill" entry: as of 2026-08-19 every one of this
 * system's real production policies already has a genuine,
 * human-proposed PendingPolicyChange awaiting a distinct human
 * checker. Those are reported separately (awaitingRealApproval) and
 * never synthetically approved -- doing so would fabricate governance
 * evidence for a decision no human has actually made, for content
 * that has a real maker-checker workflow already in flight.
 *

 * Why this exists: verifyPolicyGovernanceIntegrityAtStartup.ts and
 * scripts/verify-policy-changes-approved.ts (its own doc comment,
 * "--full-scan will report every policy version that predates Policy
 * Governance ... as unapproved -- expected, not a false positive")
 * both treat "no approval record at all" as permanently out of scope,
 * not as a mismatch to fix -- there is nothing for a legacy policy's
 * live content to be consistent *with*. This script closes that gap
 * once, deliberately, rather than leaving it open indefinitely: after
 * running with --apply, every live policy has an approval record, and
 * both of those checks actually cover the full set of live policies
 * from then on.
 *
 * Deliberately NOT wired into server startup: this mutates the
 * durable approval-record audit trail (and, transitively, the
 * pending-policy-change history), which is exactly the kind of
 * consequential, hard-to-reverse action that should be a deliberate,
 * reviewed, one-time operation -- not implicit background magic that
 * reruns on every boot. Defaults to a dry run; pass --apply to
 * actually write.
 *
 * Never touches the live policy.json itself -- there is nothing to
 * write, since the content a legacy policy already has on disk *is*
 * the content this script attests to. contentHashBefore is
 * deliberately omitted (there is no prior *governed* state to name),
 * and contentHashAfter is the hash of that unchanged content.
 */

const SYSTEM_ACTOR = "system:legacy-policy-backfill";

const BACKFILL_REASON =
  "Legacy policy backfill into Policy Governance -- content unchanged; " +
  "this policy predates the maker-checker approval flow and had no " +
  "PolicyChangeApprovalRecord until this script ran.";

interface BackfillPlanItem {
  readonly policyName: string;
  readonly policyVersion: string;
}

interface BackfillOutcome extends BackfillPlanItem {
  readonly policyChangeApprovalRecordId: string;
  readonly pendingPolicyChangeId: string;
}

interface BackfillPlan {
  /** No approval record AND no open proposal -- safe to backfill. */
  readonly toBackfill: readonly BackfillPlanItem[];
  /**
   * No approval record, but a real PendingPolicyChange is already
   * PENDING_APPROVAL for this exact (name, version) -- e.g. a human
   * proposed a real change and is waiting on a distinct human checker.
   * NEVER touched by this script: creating a synthetic system
   * approval here would fabricate governance evidence for content a
   * real maker-checker decision hasn't actually been made on yet, and
   * calling pendingPolicyChanges.create() for it would fail anyway
   * (assertNoConflictingPendingChange) since at most one
   * PENDING_APPROVAL may exist per (name, version).
   */
  readonly awaitingRealApproval: readonly BackfillPlanItem[];
}

async function planBackfill(
  policyRepository: FilePolicyRepository,
  storage: StorageProvider,
): Promise<BackfillPlan> {
  const allVersions = await policyRepository.listAll();
  const toBackfill: BackfillPlanItem[] = [];
  const awaitingRealApproval: BackfillPlanItem[] = [];

  for (const { name, version } of allVersions) {
    const existingApproval =
      await storage.policyChangeApprovalRecords.findMostRecentFor(
        name,
        version,
      );

    if (existingApproval !== null) {
      continue;
    }

    const openProposal = await storage.pendingPolicyChanges.findPending(
      name,
      version,
    );

    if (openProposal !== null) {
      awaitingRealApproval.push({ policyName: name, policyVersion: version });
      continue;
    }

    toBackfill.push({ policyName: name, policyVersion: version });
  }

  return { toBackfill, awaitingRealApproval };
}

async function backfillOne(
  item: BackfillPlanItem,
  policyRepository: FilePolicyRepository,
  storage: StorageProvider,
  policyChangeCrypto: PolicyChangeCrypto,
): Promise<BackfillOutcome> {
  const content = await policyRepository.load(
    item.policyName,
    item.policyVersion,
  );
  const now = new Date();

  const pendingChange: PendingPolicyChange = {
    pendingPolicyChangeId: crypto.randomUUID(),
    policyName: item.policyName,
    policyVersion: item.policyVersion,
    proposedContent:
      content as unknown as PendingPolicyChange["proposedContent"],
    proposedBy: SYSTEM_ACTOR,
    proposedAt: now,
    status: PendingPolicyChangeStatus.PENDING_APPROVAL,
    reason: BACKFILL_REASON,
  };

  await storage.pendingPolicyChanges.create(pendingChange);

  const resolved = await storage.pendingPolicyChanges.resolve(
    pendingChange.pendingPolicyChangeId,
    { outcome: "approved", resolvedBy: SYSTEM_ACTOR },
  );

  const contentHashAfter = await policyChangeCrypto.hashPolicyContent(content);

  const draft: Omit<PolicyChangeApprovalRecord, "signature"> = {
    policyChangeApprovalRecordId: crypto.randomUUID(),
    pendingPolicyChangeId: resolved.pendingPolicyChangeId,
    policyName: item.policyName,
    policyVersion: item.policyVersion,
    proposedBy: SYSTEM_ACTOR,
    approvedBy: SYSTEM_ACTOR,
    proposedAt: now,
    approvedAt: now,
    contentHashAfter,
  };

  const signature = await policyChangeCrypto.sign(
    draft as PolicyChangeApprovalRecord,
  );
  const record: PolicyChangeApprovalRecord = { ...draft, signature };

  const created = await storage.policyChangeApprovalRecords.create(record);

  return {
    ...item,
    policyChangeApprovalRecordId: created.policyChangeApprovalRecordId,
    pendingPolicyChangeId: resolved.pendingPolicyChangeId,
  };
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const apply = argv.includes("--apply");

  const config = loadConfig();
  const policyRepository = new FilePolicyRepository(config.policy.directory);
  const storage = StorageFactory.createFromEnvironment();
  const policyChangeCrypto = new PolicyChangeCrypto();

  const { toBackfill, awaitingRealApproval } = await planBackfill(
    policyRepository,
    storage,
  );

  if (awaitingRealApproval.length > 0) {
    console.log(
      `${awaitingRealApproval.length} polic${awaitingRealApproval.length === 1 ? "y" : "ies"} ` +
        "have no approval record but a real PendingPolicyChange is already PENDING_APPROVAL " +
        "-- NOT touched by this script; these need a real, distinct human checker, not a " +
        "synthetic system approval:",
    );

    for (const item of awaitingRealApproval) {
      console.log(
        `  - ${item.policyName}@${item.policyVersion} (awaiting a human checker)`,
      );
    }

    console.log("");
  }

  if (toBackfill.length === 0) {
    console.log(
      "No genuinely legacy policies found -- every live policy either already has an " +
        "approval record or a real proposal already awaiting human approval.",
    );
    return;
  }

  console.log(
    `${toBackfill.length} legacy polic${toBackfill.length === 1 ? "y" : "ies"} with no ` +
      "approval record and no open proposal:",
  );

  for (const item of toBackfill) {
    console.log(`  - ${item.policyName}@${item.policyVersion}`);
  }

  if (!apply) {
    console.log(
      "\nDry run (default) -- no records written. Re-run with --apply to create the " +
        `synthetic PendingPolicyChange + PolicyChangeApprovalRecord (proposedBy/approvedBy ` +
        `'${SYSTEM_ACTOR}') for each policy listed above.`,
    );
    return;
  }

  for (const item of toBackfill) {
    const outcome = await backfillOne(
      item,
      policyRepository,
      storage,
      policyChangeCrypto,
    );

    console.log(
      `  backfilled ${outcome.policyName}@${outcome.policyVersion} ` +
        `(approval record ${outcome.policyChangeApprovalRecordId})`,
    );
  }

  console.log(
    `\nDone. ${toBackfill.length} polic${toBackfill.length === 1 ? "y" : "ies"} backfilled.`,
  );
}

if (process.env.VITEST === undefined) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { main, planBackfill, backfillOne };
