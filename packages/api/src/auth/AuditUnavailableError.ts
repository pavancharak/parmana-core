import { RuntimeError } from "@parmana/runtime";

/**
 * Thrown when a caller-authentication audit write fails.
 *
 * Deliberate fail-closed design: an action that executes without an
 * audit record contradicts Parmana's core claim of independently
 * verifiable execution, so a failed audit write must fail the
 * request rather than let it proceed silently unaudited. The
 * availability cost of this is accepted — see
 * docs/VERIFICATION-GAPS.md's audit-sink decision note.
 *
 * Extends RuntimeError (not a new hierarchy) so
 * packages/api/src/middleware/error-handler.ts's existing generic
 * `instanceof RuntimeError` branch maps it to its own .status/.code
 * with no change to that file.
 */
export class AuditUnavailableError extends RuntimeError {
  constructor() {
    super(
      "Caller authentication audit trail is unavailable; refusing to " +
        "proceed without an audit record.",
      503,
      "AUDIT_UNAVAILABLE",
    );
  }
}
