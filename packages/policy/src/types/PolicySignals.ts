import type { JsonValue } from "@parmana/shared";

/**
 * Runtime signals evaluated by the policy engine.
 *
 * Examples:
 * {
 *   amount: 5000,
 *   currency: "USD",
 *   country: "IN",
 *   riskScore: 82
 * }
 */
export interface PolicySignals {
  [key: string]: JsonValue;
}
