import type { ExecutionCorrespondence } from "./execution-evidence.js";

/**
 * The fields of an authorization that correspondence is checked against.
 */
export interface CorrespondenceAuthorization {
  readonly nonce: string;
  readonly businessTransactionHash: string;
  readonly policyContentHash?: string;
  readonly authorityGrantId?: string;
}

/**
 * Outcome of a correspondence check.
 *
 * - "passed": every required field is present and matches the authorization.
 * - "failed": at least one field is missing, malformed or different.
 * - "not_checked": the record carries no correspondence fields. It is never
 *   reported as passed.
 */
export type CorrespondenceResult =
  | { readonly status: "passed" }
  | { readonly status: "failed"; readonly failures: readonly string[] }
  | { readonly status: "not_checked"; readonly reason: string };

const SUPPORTED_SCHEMA_VERSION = 1;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Checks that the dispatched content corresponds to the authorization.
 *
 * Pure: it compares strings only. Hashing happens in the caller, so this
 * module does not depend on the crypto package. Fails closed: any missing
 * or mismatched field is a failure.
 */
export function checkExecutionCorrespondence(
  correspondence: ExecutionCorrespondence | undefined,
  authorization: CorrespondenceAuthorization,
): CorrespondenceResult {
  if (correspondence === undefined) {
    return {
      status: "not_checked",
      reason: "record predates the correspondence fields",
    };
  }

  const failures: string[] = [];

  if (correspondence.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    failures.push(
      `unsupported correspondence schemaVersion ${String(correspondence.schemaVersion)}`,
    );
  }

  if (!isNonEmptyString(correspondence.authorizationNonce)) {
    failures.push("authorizationNonce is missing");
  } else if (correspondence.authorizationNonce !== authorization.nonce) {
    failures.push("authorizationNonce differs from the authorization");
  }

  if (!isNonEmptyString(correspondence.authorizedContentHash)) {
    failures.push("authorizedContentHash is missing");
  } else if (
    correspondence.authorizedContentHash !==
    authorization.businessTransactionHash
  ) {
    failures.push("authorizedContentHash differs from the authorization");
  }

  if (!isNonEmptyString(correspondence.dispatchedContentHash)) {
    failures.push("dispatchedContentHash is missing");
  } else if (
    correspondence.dispatchedContentHash !==
    correspondence.authorizedContentHash
  ) {
    failures.push("dispatched content differs from the authorized content");
  }

  if (authorization.policyContentHash !== undefined) {
    if (correspondence.policyContentHash !== authorization.policyContentHash) {
      failures.push("policyContentHash differs from the authorization");
    }
  }

  if (authorization.authorityGrantId !== undefined) {
    if (correspondence.authorityGrantId !== authorization.authorityGrantId) {
      failures.push("authorityGrantId differs from the authorization");
    }
  }

  return failures.length === 0
    ? { status: "passed" }
    : { status: "failed", failures };
}
