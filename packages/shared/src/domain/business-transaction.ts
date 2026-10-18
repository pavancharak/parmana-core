import { Authority } from "./authority.js";
import { Authorization } from "./authorization.js";
import { Intent } from "./intent.js";
import { TransactionMetadata } from "./metadata.js";
import { PolicyReference } from "./policy-reference.js";

/**
 * Parmana Trust Core
 *
 * Business Transaction
 *
 * The canonical immutable business context
 * accepted by Parmana for execution.
 *
 * A Business Transaction captures the complete
 * upstream trust chain prior to policy evaluation.
 *
 * Authority
 *      ↓
 * Authorization
 *      ↓
 * Intent
 *      ↓
 * BusinessTransaction
 *      ↓
 * PolicyReference
 *
 * The Business Transaction is the immutable input
 * to deterministic policy evaluation.
 *
 * Every Business Transaction produces exactly one
 * Decision, one Execution, and one Execution Trust
 * Record.
 */
export interface BusinessTransaction {
  /**
   * Unique Business Transaction identifier.
   *
   * Same value as metadata.businessTransactionId.
   */
  readonly businessTransactionId: string;

  /**
   * Immutable transaction metadata.
   */
  readonly metadata: TransactionMetadata;

  /**
   * Authority responsible for this
   * Business Transaction.
   */
  readonly authority: Authority;

  /**
   * Authorization granted by the Authority.
   */
  readonly authorization: Authorization;

  /**
   * Intended business action.
   */
  readonly intent: Intent;

  /**
   * Exact Policy to execute.
   *
   * The PolicyReference is part of the
   * cryptographically verifiable trust chain.
   */
  readonly policy: PolicyReference;

  /**
   * Runtime signals supplied to the Policy.
   *
   * Signals are opaque runtime facts validated
   * against the Policy's declared Signal Schema.
   *
   * Parmana does not assign business meaning to
   * these values.
   */
  readonly signals: Readonly<Record<string, unknown>>;

  /**
   * Current Business Transaction lifecycle.
   */
  readonly status: BusinessTransactionStatus;

  /**
   * UTC timestamp when the Business Transaction
   * was accepted by Parmana.
   */
  readonly createdAt: Date;
}

/**
 * Business Transaction lifecycle.
 */
export enum BusinessTransactionStatus {
  RECEIVED = "RECEIVED",

  POLICY_EVALUATED = "POLICY_EVALUATED",

  APPROVED = "APPROVED",

  REJECTED = "REJECTED",

  OVERRIDDEN = "OVERRIDDEN",

  EXECUTING = "EXECUTING",

  EXECUTED = "EXECUTED",

  FAILED = "FAILED",

  VERIFIED = "VERIFIED",
}
