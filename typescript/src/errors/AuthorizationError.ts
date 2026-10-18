import { ErrorCode, ParmanaError } from "./ParmanaError.js";

/**
 * Raised when the Runtime returns HTTP 403 for a caller that is
 * authenticated but not permitted to do the specific thing it asked
 * for. Covers two distinct denials, both intentionally collapsed to
 * this one SDK error class since both share the same "who you are is
 * known; you can't do this" shape — distinguish them via `serverCode`/
 * `message` if needed, not via `instanceof`:
 * - a caller asserting an authority.principalId it isn't permitted to
 *   assert (isPrincipalAllowed, packages/api/src/routes/execute.ts and
 *   transactions.ts) — carries no `code` field of its own.
 * - a caller invoking a capability (intent.action) it isn't permitted
 *   to invoke (isCapabilityAllowed.ts) — carries
 *   `code: "CAPABILITY_NOT_ALLOWED"`, preserved on `serverCode` below.
 * Distinct from AuthenticationError (401, no valid credential at all).
 */
export class AuthorizationError extends ParmanaError {
  /**
   * The Runtime's own `code` field, when the 403 carried one (currently
   * only the capability-denied case: "CAPABILITY_NOT_ALLOWED"). Undefined
   * for the principal-mismatch case, which the Runtime sends with no
   * `code` at all — see mapHttpErrorResponse.ts for the exact check.
   */
  public readonly serverCode?: string;

  constructor(
    message: string,
    options?: {
      requestId?: string;
      cause?: unknown;
      serverCode?: string;
    },
  ) {
    super({
      code: ErrorCode.AUTHORIZATION_ERROR,

      message,

      ...(options?.requestId !== undefined && {
        requestId: options.requestId,
      }),

      ...(options?.cause !== undefined && {
        cause: options.cause,
      }),
    });

    this.name = "AuthorizationError";

    if (options?.serverCode !== undefined) {
      this.serverCode = options.serverCode;
    }
  }
}
