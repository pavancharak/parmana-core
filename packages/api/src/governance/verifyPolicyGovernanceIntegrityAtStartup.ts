import { PolicyNotFoundError } from "@parmana/policy";
import type { PolicyRepository } from "@parmana/policy";
import type { PolicyChangeCrypto } from "@parmana/crypto";
import type {
  PolicyChangeApprovalRecord,
  PolicyChangeApprovalRecordRepository,
} from "@parmana/shared";

export interface PolicyGovernanceIntegrityOptions {
  readonly policyRepository: PolicyRepository;
  readonly policyChangeCrypto: PolicyChangeCrypto;
  readonly policyChangeApprovalRecordRepository: PolicyChangeApprovalRecordRepository;
  /**
   * When true, a check that cannot run throws instead of logging. Used
   * only by assertPolicyGovernanceIntegrityAtStartup, where a check that
   * cannot run must stop the server from starting.
   */
  readonly failClosed?: boolean;
}

export type PolicyGovernanceIntegrityMismatchReason =
  /**
   * A (policyName, policyVersion) has an approval record, but no live
   * policy.json exists at that path -- the approved content was never
   * written, or was later removed, outside the pending-change API.
   */
  | "missing"
  /**
   * The live policy.json exists but its content hash does not match
   * the most recent approval record's contentHashAfter -- the file
   * was edited after approval, outside the pending-change API. This
   * is the exact governance bypass
   * PolicyChangeApprovalRecordRepository.findMostRecentFor's own doc
   * comment describes this check as existing to catch.
   */
  | "content-mismatch"
  /**
   * The most recent approval record's own signature does not verify.
   * Distinct from "content-mismatch": that check trusts the record's
   * contentHashAfter and asks whether the live file matches it; this
   * check asks whether the record itself is what PolicyChangeCrypto
   * actually signed at approval time. A record whose signature does
   * not verify is never trusted for the content-hash comparison below
   * -- there is nothing trustworthy left to compare the live file
   * against.
   */
  | "signature-invalid"
  /**
   * This record's previousRecordHash does not match the hash of the
   * approval record that preceded it for the same (policyName,
   * policyVersion) -- see PolicyChangeApprovalService's own doc
   * comment on why each new record embeds this. Indicates the
   * approval-record history itself was edited, reordered, or had a
   * record deleted, outside of PolicyChangeApprovalService ever
   * having produced that sequence.
   */
  | "chain-broken";

export interface PolicyGovernanceIntegrityMismatch {
  readonly policyName: string;
  readonly policyVersion: string;
  readonly reason: PolicyGovernanceIntegrityMismatchReason;
}

export interface PolicyGovernanceIntegrityResult {
  /**
   * Number of distinct (policyName, policyVersion) pairs that have
   * ever been approved and were checked. Pairs with no approval
   * record at all (a legacy policy that predates Policy Governance)
   * are out of scope -- there is nothing for their live content to be
   * consistent *with*.
   */
  readonly checked: number;
  readonly mismatches: readonly PolicyGovernanceIntegrityMismatch[];
}

/**
 * Deploy/startup integrity check (G-24, Policy Governance): for every
 * (policyName, policyVersion) pair that has ever gone through the
 * maker-checker approval flow, confirms the live
 * policies/{name}/{version}/policy.json content still matches the
 * most recent PolicyChangeApprovalRecord's contentHashAfter.
 *
 * Deliberately fail-OPEN, the opposite discipline of
 * assertStorageConfigured/assertSigningKeyMaterialConfigured: this
 * function NEVER throws and NEVER blocks startup or the execution
 * pipeline -- a governance-tooling inconsistency here (a file edited
 * outside the API, or the check itself unable to run because of a
 * storage outage) is a signal for an operator to investigate, not a
 * reason to take the whole API down. Every mismatch is logged loudly
 * via console.error, and the check's own outcome -- pass, mismatch,
 * or "could not run at all" -- is always logged, never silent, so
 * "nothing to report" and "couldn't check" never look the same in
 * deploy logs.
 */
export async function verifyPolicyGovernanceIntegrityAtStartup(
  options: PolicyGovernanceIntegrityOptions,
): Promise<PolicyGovernanceIntegrityResult> {
  let records;

  try {
    records = await options.policyChangeApprovalRecordRepository.list();
  } catch (error) {
    const message =
      "Policy Governance deploy/startup integrity check could not run " +
      "(could not list approval records).";

    console.error({
      event: "policy_governance_integrity_check_unavailable",
      message: options.failClosed
        ? `${message} The server will not start.`
        : `${message} This does NOT block startup.`,
      error: error instanceof Error ? error.message : String(error),
    });

    if (options.failClosed) {
      throw new Error(message, { cause: error });
    }

    return { checked: 0, mismatches: [] };
  }

  const distinctVersions = new Map<
    string,
    { readonly policyName: string; readonly policyVersion: string }
  >();

  for (const record of records) {
    distinctVersions.set(`${record.policyName} ${record.policyVersion}`, {
      policyName: record.policyName,
      policyVersion: record.policyVersion,
    });
  }

  const mismatches: PolicyGovernanceIntegrityMismatch[] = [];

  for (const { policyName, policyVersion } of distinctVersions.values()) {
    try {
      const [live, mostRecent] = await Promise.all([
        options.policyRepository
          .load(policyName, policyVersion)
          .catch((error: unknown) => {
            if (error instanceof PolicyNotFoundError) {
              return null;
            }

            throw error;
          }),
        options.policyChangeApprovalRecordRepository.findMostRecentFor(
          policyName,
          policyVersion,
        ),
      ]);

      // Can't happen given distinctVersions is derived from records
      // that exist, but never let a race with concurrent writes crash
      // the loop over the remaining pairs.
      if (mostRecent === null) {
        continue;
      }

      const signatureValid =
        await options.policyChangeCrypto.verify(mostRecent);

      if (!signatureValid) {
        mismatches.push({
          policyName,
          policyVersion,
          reason: "signature-invalid",
        });
        continue;
      }

      if (live === null) {
        mismatches.push({ policyName, policyVersion, reason: "missing" });
        continue;
      }

      const liveContentHash =
        await options.policyChangeCrypto.hashPolicyContent(live);

      if (liveContentHash !== mostRecent.contentHashAfter) {
        mismatches.push({
          policyName,
          policyVersion,
          reason: "content-mismatch",
        });
      }
    } catch (error) {
      console.error({
        event: "policy_governance_integrity_check_failed_for_version",
        policyName,
        policyVersion,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Chain integrity: for every (policyName, policyVersion) with more
  // than one approval record, each record after the first must embed
  // the hash of the record immediately before it (by approvedAt) --
  // see PolicyChangeApprovalService's own doc comment. This detects a
  // deleted, reordered, or substituted record in the approval-record
  // store itself, a bypass distinct from "content-mismatch" (which
  // only ever looks at the single most recent record).
  interface PairGroup {
    readonly policyName: string;
    readonly policyVersion: string;
    readonly records: PolicyChangeApprovalRecord[];
  }

  const recordsByPair = new Map<string, PairGroup>();

  for (const record of records) {
    const key = `${record.policyName} ${record.policyVersion}`;
    const existing = recordsByPair.get(key);

    if (existing) {
      existing.records.push(record);
    } else {
      recordsByPair.set(key, {
        policyName: record.policyName,
        policyVersion: record.policyVersion,
        records: [record],
      });
    }
  }

  for (const {
    policyName,
    policyVersion,
    records: pairRecords,
  } of recordsByPair.values()) {
    if (pairRecords.length < 2) {
      continue;
    }

    const sorted = [...pairRecords].sort(
      (a, b) => a.approvedAt.getTime() - b.approvedAt.getTime(),
    );

    for (let i = 1; i < sorted.length; i++) {
      const previous = sorted[i - 1];
      const current = sorted[i];

      if (previous === undefined || current === undefined) {
        continue;
      }

      try {
        const expectedHash =
          await options.policyChangeCrypto.hashPolicyContent(previous);

        if (current.previousRecordHash !== expectedHash) {
          mismatches.push({
            policyName,
            policyVersion,
            reason: "chain-broken",
          });
          break;
        }
      } catch (error) {
        console.error({
          event: "policy_governance_integrity_check_failed_for_version",
          policyName,
          policyVersion,
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }
  }

  if (mismatches.length > 0) {
    console.error({
      event: "policy_governance_integrity_mismatch",
      message:
        "One or more live policy.json files do not match the most recently " +
        "approved content for that (policyName, policyVersion) -- possible " +
        "governance bypass (a file edited outside the pending-change API), " +
        "or the approved content was never written / was later removed. " +
        "This does NOT block startup; investigate and reconcile manually.",
      checked: distinctVersions.size,
      mismatches,
    });
  } else {
    console.log({
      event: "policy_governance_integrity_check_passed",
      checked: distinctVersions.size,
    });
  }

  return { checked: distinctVersions.size, mismatches };
}

/**
 * The startup form of the check, used by server.ts before the port opens.
 * It resolves only if the check ran and found no mismatch. It rejects if
 * the check could not run, or if any approved policy's live file does not
 * match its approval record. The periodic re-run keeps the fail-open
 * behaviour above, so a mismatch found after startup is logged, not fatal.
 */
export async function assertPolicyGovernanceIntegrityAtStartup(
  options: PolicyGovernanceIntegrityOptions,
): Promise<void> {
  const result = await verifyPolicyGovernanceIntegrityAtStartup({
    ...options,
    failClosed: true,
  });

  if (result.mismatches.length > 0) {
    const found = result.mismatches
      .map((m) => `${m.policyName}@${m.policyVersion} (${m.reason})`)
      .join(", ");

    throw new Error(
      `Policy Governance integrity check found ${result.mismatches.length} ` +
        `mismatch(es); the server will not start: ${found}`,
    );
  }
}
