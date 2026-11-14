import type { ExecutionTrustRecord } from "./execution-trust-record.js";

/**
 * A consumed authorization as recorded by the execution outcome store.
 */
export interface ConsumedOutcome {
  readonly nonce: string;
  readonly status: "in_flight" | "completed" | "failed";
}

/**
 * Result of reconciling outcomes against stored trust records.
 *
 * - "failed": a completed execution has no trust record. Its evidence is
 *   missing from the ledger (CE-04).
 * - "not_checked": no outcomes were supplied, or an execution is still in
 *   flight, so its evidence cannot yet be expected to exist.
 * - "passed": every completed execution has a matching trust record.
 */
export interface ReconciliationReport {
  readonly status: "passed" | "failed" | "not_checked";
  /** Nonces of completed executions with no trust record. */
  readonly missingEvidence: readonly string[];
  /** Nonces of executions still in flight. */
  readonly inFlight: readonly string[];
  /**
   * Trust records whose authorization matches no recorded outcome. Reported
   * for review. They do not change the status, because a record can exist
   * for a refusal that never reached the outcome store.
   */
  readonly unmatchedRecordIds: readonly string[];
}

/**
 * Reconciles the outcome store against the trust records.
 *
 * Pure: takes its inputs as values, so the same check can run against any
 * ledger export. Fails closed: a missing record for a completed execution is
 * a failure, and an empty outcome set is not reported as passed.
 */
export function reconcileExecutionEvidence(
  outcomes: readonly ConsumedOutcome[],
  trustRecords: readonly ExecutionTrustRecord[],
): ReconciliationReport {
  const recordedNonces = new Set<string>();
  const unmatchedRecordIds: string[] = [];

  for (const record of trustRecords) {
    const nonce = record.authorization?.payload.nonce;

    if (nonce === undefined) {
      unmatchedRecordIds.push(record.trustRecordId);
    } else {
      recordedNonces.add(nonce);
    }
  }

  const outcomeNonces = new Set(outcomes.map((outcome) => outcome.nonce));

  for (const record of trustRecords) {
    const nonce = record.authorization?.payload.nonce;

    if (nonce !== undefined && !outcomeNonces.has(nonce)) {
      unmatchedRecordIds.push(record.trustRecordId);
    }
  }

  const missingEvidence = outcomes
    .filter((o) => o.status === "completed" && !recordedNonces.has(o.nonce))
    .map((o) => o.nonce);

  const inFlight = outcomes
    .filter((o) => o.status === "in_flight")
    .map((o) => o.nonce);

  const status: ReconciliationReport["status"] =
    missingEvidence.length > 0
      ? "failed"
      : outcomes.length === 0 || inFlight.length > 0
        ? "not_checked"
        : "passed";

  return { status, missingEvidence, inFlight, unmatchedRecordIds };
}
