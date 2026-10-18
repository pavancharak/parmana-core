import {
  ChallengeRecord,
  ChallengeRecordDisclosure,
  ChallengeRecordFinding,
  ChallengeRecordInvestigationStep,
  ChallengeRecordOutcome,
  ChallengeRecordStatus,
} from "../domain/index.js";

import { ConflictError } from "../errors/index.js";

/**
 * One append-only operation against an existing ChallengeRecord
 * (RFC-0022). Exactly one of these per `append()` call — never a
 * partial-record patch — so every mutation is an explicit,
 * individually reviewable step, matching investigationSteps' own
 * one-entry-at-a-time shape.
 */
export type ChallengeRecordAppendOperation =
  | {
      readonly kind: "investigation-step";
      readonly step: ChallengeRecordInvestigationStep;
    }
  | { readonly kind: "status"; readonly status: ChallengeRecordStatus }
  | { readonly kind: "finding"; readonly finding: ChallengeRecordFinding }
  | { readonly kind: "outcome"; readonly outcome: ChallengeRecordOutcome }
  | {
      readonly kind: "disclosure";
      readonly disclosure: ChallengeRecordDisclosure;
    };

/**
 * Repository for Challenge Records (RFC-0022).
 *
 * Unlike RefusalRecordRepository (a single terminal write per
 * transaction), a ChallengeRecord is investigated over real time:
 * `create` starts it, `append` extends it. `append` never accepts a
 * full replacement record — only one of ChallengeRecordAppendOperation's
 * variants — so implementations can enforce append-only semantics
 * (investigationSteps only ever grows; status only ever moves
 * forward; finding/outcome/disclosure are each immutable once set) at
 * the repository boundary, not merely by caller convention. See
 * `applyChallengeRecordAppend`, which every implementation should
 * route through to keep that enforcement identical across backends.
 */
export interface ChallengeRecordRepository {
  create(record: ChallengeRecord): Promise<ChallengeRecord>;

  /**
   * Applies one append-only operation to an existing Challenge
   * Record and returns the updated record. Throws
   * ChallengeRecordNotFoundError if no record exists for the given
   * id, or ConflictError if the operation would violate append-only
   * semantics (see `applyChallengeRecordAppend`).
   */
  append(
    challengeRecordId: string,
    operation: ChallengeRecordAppendOperation,
  ): Promise<ChallengeRecord>;

  findById(challengeRecordId: string): Promise<ChallengeRecord | null>;

  list(): Promise<readonly ChallengeRecord[]>;
}

/**
 * Forward-only lifecycle order a `status` append operation must
 * respect. Index position, not the string values, is what "forward"
 * means here.
 */
const CHALLENGE_RECORD_STATUS_ORDER: readonly ChallengeRecordStatus[] = [
  "open",
  "investigating",
  "resolved",
];

/**
 * Pure, backend-independent enforcement of ChallengeRecord's
 * append-only rules (RFC-0022 § Proposal 1): investigationSteps only
 * grows; status only moves strictly forward (open -> investigating ->
 * resolved), never backward or in place; finding/outcome/disclosure
 * are each set at most once. Every ChallengeRecordRepository
 * implementation should call this rather than re-implementing the
 * same checks, so the enforcement is identical across backends (the
 * same reasoning `isUniqueViolation` gave for a shared mapping across
 * MemoryBusinessTransactionRepository / SupabaseBusinessTransactionRepository).
 *
 * Throws ConflictError, never silently drops or overwrites, on any
 * violation.
 */
export function applyChallengeRecordAppend(
  record: ChallengeRecord,
  operation: ChallengeRecordAppendOperation,
  appliedAt: Date,
): ChallengeRecord {
  switch (operation.kind) {
    case "investigation-step":
      return {
        ...record,
        investigationSteps: [...record.investigationSteps, operation.step],
        updatedAt: appliedAt,
      };

    case "status": {
      const currentIndex = CHALLENGE_RECORD_STATUS_ORDER.indexOf(record.status);
      const nextIndex = CHALLENGE_RECORD_STATUS_ORDER.indexOf(operation.status);

      if (nextIndex <= currentIndex) {
        throw new ConflictError(
          `Challenge Record '${record.challengeRecordId}' status cannot move from ` +
            `'${record.status}' to '${operation.status}' -- status only ever moves forward ` +
            "(open -> investigating -> resolved), never backward or in place. A challenge " +
            "believed resolved that needs reopening should become a new ChallengeRecord " +
            "linked via 'supersedes', not a status change on this one.",
        );
      }

      return { ...record, status: operation.status, updatedAt: appliedAt };
    }

    case "finding": {
      if (record.finding !== undefined) {
        throw new ConflictError(
          `Challenge Record '${record.challengeRecordId}' already has a finding recorded ` +
            `('${record.finding.outcome}') -- finding is immutable once set. A correction ` +
            "should become a new ChallengeRecord linked via 'supersedes', not an edit here.",
        );
      }

      return { ...record, finding: operation.finding, updatedAt: appliedAt };
    }

    case "outcome": {
      if (record.outcome !== undefined) {
        throw new ConflictError(
          `Challenge Record '${record.challengeRecordId}' already has an outcome recorded ` +
            "-- outcome is immutable once set. A correction should become a new " +
            "ChallengeRecord linked via 'supersedes', not an edit here.",
        );
      }

      return { ...record, outcome: operation.outcome, updatedAt: appliedAt };
    }

    case "disclosure": {
      if (record.disclosure !== undefined) {
        throw new ConflictError(
          `Challenge Record '${record.challengeRecordId}' already has a disclosure recorded ` +
            "-- disclosure is immutable once set. A correction should become a new " +
            "ChallengeRecord linked via 'supersedes', not an edit here.",
        );
      }

      return {
        ...record,
        disclosure: operation.disclosure,
        updatedAt: appliedAt,
      };
    }
  }
}
