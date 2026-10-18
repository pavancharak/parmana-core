import type { ExecutionTrustRecord } from "./execution-trust-record.js";

/**
 * Internal unsigned Trust Record used only during
 * construction prior to cryptographic signing.
 */
export type UnsignedExecutionTrustRecord = Omit<
  ExecutionTrustRecord,
  "signature"
>;
