import {
  checkExecutionCorrespondence,
  type CorrespondenceAuthorization,
  type CorrespondenceResult,
  type ExecutionTrustRecord,
} from "@parmana/shared";

/**
 * Correspondence result for one execution in a trust record.
 */
export interface ExecutionCorrespondenceEntry {
  readonly executionId: string;
  readonly result: CorrespondenceResult;
}

/**
 * Overall correspondence report for a trust record.
 *
 * - "failed": at least one execution does not correspond to the authorization.
 * - "not_checked": no execution was checked, or at least one could not be checked.
 * - "passed": every execution was checked and corresponds.
 *
 * Fails closed: a single unchecked execution prevents "passed".
 */
export interface ExecutionCorrespondenceReport {
  readonly status: "passed" | "failed" | "not_checked";
  readonly executions: readonly ExecutionCorrespondenceEntry[];
}

/**
 * Checks each execution in a trust record against the authorization the
 * record embeds.
 *
 * Stateless and offline, like verifyExecutionTrustRecordOffline. It does not
 * replace that check: a correspondence result is meaningful only for a
 * record whose signatures also verify. Run both.
 */
export function checkTrustRecordCorrespondenceOffline(
  trustRecord: ExecutionTrustRecord,
): ExecutionCorrespondenceReport {
  const payload = trustRecord.authorization?.payload;
  const authorization: CorrespondenceAuthorization | undefined =
    payload === undefined
      ? undefined
      : {
          nonce: payload.nonce,
          businessTransactionHash: payload.businessTransactionHash,
          ...(payload.policyContentHash !== undefined && {
            policyContentHash: payload.policyContentHash,
          }),
          ...(payload.authorityGrant !== undefined && {
            authorityGrantId: payload.authorityGrant.grantId,
          }),
        };

  const executions: ExecutionCorrespondenceEntry[] = trustRecord.executions.map(
    (execution) => {
      if (authorization === undefined) {
        return {
          executionId: execution.executionId,
          result: {
            status: "failed",
            failures: ["no authorization is embedded in the trust record"],
          },
        };
      }

      if (execution.evidence === undefined) {
        return {
          executionId: execution.executionId,
          result: {
            status: "not_checked",
            reason: "execution has no evidence recorded",
          },
        };
      }

      return {
        executionId: execution.executionId,
        result: checkExecutionCorrespondence(
          execution.evidence.correspondence,
          authorization,
        ),
      };
    },
  );

  if (executions.length === 0) {
    return { status: "not_checked", executions };
  }

  if (executions.some((entry) => entry.result.status === "failed")) {
    return { status: "failed", executions };
  }

  if (executions.some((entry) => entry.result.status === "not_checked")) {
    return { status: "not_checked", executions };
  }

  return { status: "passed", executions };
}
