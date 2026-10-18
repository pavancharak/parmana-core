import type {
  BusinessTransaction,
  ExecutionTrustRecord,
} from "@parmana/shared";

import type { RuntimeContext } from "./context/RuntimeContext.js";

/**
 * Result returned by the Parmana Runtime.
 *
 * Exposes the complete outcome of runtime
 * execution while preserving the Runtime
 * façade as the public API.
 */
export interface RuntimeResult {
  /**
   * Final Business Transaction.
   */
  readonly transaction: BusinessTransaction;

  /**
   * Complete Runtime Context.
   */
  readonly context: RuntimeContext;

  /**
   * Generated Execution Trust Record.
   */
  readonly trustRecord: ExecutionTrustRecord;
}
