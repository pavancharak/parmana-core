import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown by @parmana/execution-gateway's ExecutionGateway.execute() when
 * every side-effect-free check (version, signature, expiry, TTL policy,
 * businessTransactionHash) passed, and the envelope's nonce alone was
 * already consumed — an isolated replay of an otherwise-valid,
 * previously-released authorization.
 *
 * Lives in @parmana/shared, not @parmana/execution-gateway or
 * @parmana/runtime, so packages/api's error-handler.ts can recognize it
 * without execution-gateway depending on @parmana/runtime (or the
 * reverse) — the same reasoning duplicate-business-transaction-error.ts
 * documents for the identical cross-package problem.
 *
 * Distinct from every other Gateway verification failure (forged
 * signature, expired envelope, tampered content) on purpose: those
 * remain a plain Error today, unchanged by this fix, because the check
 * that failed there was never side-effect-bearing — replaying an
 * already-consumed nonce is the one Gateway rejection that specifically
 * means "this exact authorization already ran," which is a 409-shaped
 * fact, not a 500-shaped one.
 */
export class NonceAlreadyConsumedError extends ParmanaError {
  constructor(businessTransactionId: string) {
    super(
      "NONCE_ALREADY_CONSUMED",
      `Execution Gateway rejected request for Business Transaction '${businessTransactionId}': ` +
        "authorization nonce has already been consumed (replay of an already-executed authorization).",
      409,
    );
  }
}
