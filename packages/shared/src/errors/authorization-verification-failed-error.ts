import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown when the Execution Gateway refuses an authorization because a
 * verification check failed: a forged or tampered signature, an expired envelope,
 * a content or policy mismatch. The message names the failed checks.
 *
 * This is the caller's error, so it is 403, not a server fault. Before this class,
 * these were plain Errors and reached callers as a generic 500.
 */
export class AuthorizationVerificationFailedError extends ParmanaError {
  constructor(message: string) {
    super("AUTHORIZATION_VERIFICATION_FAILED", message, 403);
  }
}
