import crypto from "node:crypto";

import type { Policy, PolicyRepository } from "@parmana/policy";
import { PolicyNotFoundError,
  PolicyVersionImmutableError,
} from "@parmana/policy";
import type { PolicyChangeCrypto } from "@parmana/crypto";
import {
  ConflictError,
  type PendingPolicyChange,
  type PolicyChangeApprovalRecord,
  type PolicyChangeApprovalRecordRepository,
} from "@parmana/shared";

export interface PolicyChangeApprovalServiceOptions {
  readonly policyRepository: PolicyRepository;
  readonly policyChangeCrypto: PolicyChangeCrypto;
  readonly policyChangeApprovalRecordRepository: PolicyChangeApprovalRecordRepository;
}

/**
 * Resolves an approved PendingPolicyChange into its two durable
 * effects: the live policies/{name}/{version}/policy.json write, and
 * a signed PolicyChangeApprovalRecord -- see PendingPolicyChange's
 * and PolicyChangeApprovalRecord's own doc comments for why neither
 * exists until this service runs.
 *
 * Must be called from the approve route handler BEFORE
 * PendingPolicyChangeRepository.resolve, never after: if the write or
 * the signing fails, the pending change must remain PENDING_APPROVAL,
 * not be left APPROVED with no corresponding live effect.
 *
 * Rejections never call this service -- see PendingPolicyChange's own
 * doc comment: a rejected change's rejectionReason is itself the
 * durable evidence a rejection leaves behind.
 *
 * The write target is `proposedContent.policyVersion`, not the
 * PendingPolicyChange's own `policyVersion` ("the version being
 * replaced") -- see PendingPolicyChange's own doc comment for why
 * those can legitimately differ.
 *
 * At most one record per pending change. A retry by the same approver
 * after a partial failure (record written, then the file write or the
 * route's resolve failed, leaving the change PENDING_APPROVAL) reuses
 * the record the first attempt wrote and finishes the file write,
 * instead of signing a second record. Any other approver gets a
 * ConflictError (409); so does a second approval that races the first
 * past this check, at the repository's unique constraint.
 */
export class PolicyChangeApprovalService {
  private readonly policyRepository: PolicyRepository;
  private readonly policyChangeCrypto: PolicyChangeCrypto;

  private readonly policyChangeApprovalRecordRepository: PolicyChangeApprovalRecordRepository;

  constructor(options: PolicyChangeApprovalServiceOptions) {
    this.policyRepository = options.policyRepository;
    this.policyChangeCrypto = options.policyChangeCrypto;

    this.policyChangeApprovalRecordRepository =
      options.policyChangeApprovalRecordRepository;
  }

  async approve(
    change: PendingPolicyChange,
    approvedBy: string,
  ): Promise<PolicyChangeApprovalRecord> {
    const proposedContent = change.proposedContent as unknown as Policy;
    const writeVersion = proposedContent.policyVersion;

    const contentHashAfter =
      await this.policyChangeCrypto.hashPolicyContent(proposedContent);

    const alreadyRecorded =
      await this.policyChangeApprovalRecordRepository.findByPendingPolicyChangeId(
        change.pendingPolicyChangeId,
      );

    if (alreadyRecorded !== null) {
      if (
        alreadyRecorded.approvedBy !== approvedBy ||
        alreadyRecorded.contentHashAfter !== contentHashAfter
      ) {
        throw new ConflictError(
          `Pending Policy Change '${change.pendingPolicyChangeId}' already ` +
            `has an approval record by '${alreadyRecorded.approvedBy}'. Only ` +
            "that approver can complete it.",
        );
      }

      await this.policyRepository.save(
        change.policyName,
        writeVersion,
        proposedContent,
      );

      return alreadyRecorded;
    }

    const before = await this.policyRepository
      .load(change.policyName, writeVersion)
      .catch((error: unknown) => {
        if (error instanceof PolicyNotFoundError) {
          return null;
        }

        throw error;
      });

    const contentHashBefore =
      before === null
        ? undefined
        : await this.policyChangeCrypto.hashPolicyContent(before);

    //
    // A published version is immutable. Refuse a different-content approval
    // here, before any approval record is written: a record with no matching
    // stored content would fail the governance integrity check later.
    //
    if (
      before !== null &&
      contentHashBefore !== (await this.policyChangeCrypto.hashPolicyContent(proposedContent))
    ) {
      throw new PolicyVersionImmutableError(change.policyName, writeVersion);
    }

    // Chains this record to whatever approval record most recently
    // preceded it for this same (policyName, writeVersion) -- see
    // PolicyChangeApprovalRecord's own doc comment on
    // previousRecordHash for why. Absent only for the first approval
    // ever recorded for this pair.
    const priorRecord =
      await this.policyChangeApprovalRecordRepository.findMostRecentFor(
        change.policyName,
        writeVersion,
      );

    const previousRecordHash =
      priorRecord === null
        ? undefined
        : await this.policyChangeCrypto.hashPolicyContent(priorRecord);

    // Sign and durably persist the approval record BEFORE writing the
    // live file, not after: if persisting the record fails, nothing
    // has changed yet -- retry from a clean state. If it were the
    // other way around and the record-persist step failed after the
    // file write succeeded, the live policy would have changed with
    // no durable evidence anything approved it, a silent governance
    // gap with nothing to point an integrity check at. A persisted
    // record whose live file write hasn't happened yet is instead the
    // recoverable failure mode: the record itself is what a later
    // startup/deploy integrity check compares the live file against
    // (see PolicyChangeApprovalRecordRepository.findMostRecentFor's
    // own doc comment), so a mismatch here is detectable, not silent.
    const draft: Omit<PolicyChangeApprovalRecord, "signature"> = {
      policyChangeApprovalRecordId: crypto.randomUUID(),
      pendingPolicyChangeId: change.pendingPolicyChangeId,
      policyName: change.policyName,
      policyVersion: writeVersion,
      proposedBy: change.proposedBy,
      approvedBy,
      proposedAt: change.proposedAt,
      approvedAt: new Date(),
      ...(contentHashBefore !== undefined ? { contentHashBefore } : {}),
      contentHashAfter,
      ...(previousRecordHash !== undefined ? { previousRecordHash } : {}),
    };

    const signature = await this.policyChangeCrypto.sign(
      draft as PolicyChangeApprovalRecord,
    );

    const record: PolicyChangeApprovalRecord = {
      ...draft,
      signature,
    };

    const created =
      await this.policyChangeApprovalRecordRepository.create(record);

    await this.policyRepository.save(
      change.policyName,
      writeVersion,
      proposedContent,
    );

    return created;
  }
}
