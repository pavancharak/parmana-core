import type { SignedExecutionAuthorization } from "@parmana/shared";

/**
 * Canonical request sent by Parmana to an
 * Execution System.
 *
 * Produced only after successful authorization.
 */
export interface ExecutionRequest {
  /**
   * Business Transaction identifier.
   */
  readonly businessTransactionId: string;

  /**
   * Approved action.
   */
  readonly action: string;

  /**
   * Approved target.
   */
  readonly target: string;

  /**
   * Approved parameters.
   */
  readonly parameters: Readonly<Record<string, unknown>>;

  /**
   * Runtime signals the authorization's decision was evaluated
   * against (G-31, execution-boundary signal freshness). Optional so
   * every pre-existing construction site keeps compiling unchanged --
   * absent means no signal-freshness re-check is possible for this
   * request, not that signals are stale. When present, a receiving
   * gateway can recompute their hash against the authorization's own
   * signalsHash and, with a capability-scoped SignalStateVerifier,
   * independently re-derive whether the underlying real-world
   * conditions still hold.
   */
  readonly signals?: Readonly<Record<string, unknown>>;

  /**
   * Proof that Parmana authorized this execution.
   *
   * Receiving systems MUST verify this signature
   * and its expiry before executing.
   */
  readonly authorization: SignedExecutionAuthorization;
}
