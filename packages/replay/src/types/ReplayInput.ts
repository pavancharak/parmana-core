import type {
  BusinessTransaction,
  ExecutionTrustRecord,
} from "@parmana/shared";

import type { Policy } from "@parmana/policy";

/**
 * Input required to deterministically replay
 * a previously executed Business Transaction.
 */
export interface ReplayInput {
  /**
   * Immutable Execution Trust Record.
   */
  readonly trustRecord: ExecutionTrustRecord;

  /**
   * Original Business Transaction.
   */
  readonly transaction: BusinessTransaction;

  /**
   * Resolved immutable Policy used for replay.
   *
   * The runtime is responsible for resolving the
   * PolicyReference before invoking ReplayEngine.
   */
  readonly policy: Policy;
}
