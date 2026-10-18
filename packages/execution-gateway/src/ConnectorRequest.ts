import type {
  ExecutableContent,
  SignedExecutionAuthorization,
} from "@parmana/shared";

import type { GatewayVerificationResult } from "./GatewayVerificationResult.js";

/**
 * Canonical request handed to a Connector.
 *
 * Produced only after the Execution Gateway's full
 * verification sequence has passed. The transaction
 * is the exact content whose hash was verified
 * against the authorization's businessTransactionHash
 * — the connector receives this same content, not a
 * re-derived copy, and it is deep-frozen so nothing
 * between verification and the connector call can
 * mutate it.
 */
export interface ConnectorRequest {
  /**
   * The verified, frozen Executable Content.
   */
  readonly transaction: Readonly<ExecutableContent>;

  /**
   * The Signed Execution Authorization that
   * authorized this exact content.
   */
  readonly authorization: SignedExecutionAuthorization;

  /**
   * The Gateway's full verification result, for
   * connectors that want to log or assert on it.
   */
  readonly verification: GatewayVerificationResult;
}
