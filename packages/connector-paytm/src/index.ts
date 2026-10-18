/**
 * @parmana/connector-paytm
 *
 * Paytm refund capability definitions, schemas, and mock connector
 * service support for Parmana: forwarding an already-authorized
 * paytm:refund execution to the trusted, out-of-process Paytm connector
 * service (parmana-paytm-agent) -- this milestone's scope (see
 * docs/connectors/PAYTM_CONNECTOR.md). Passive by design -- the
 * executable connector (GatewayPaytmAdapter) is owned by
 * @parmana/execution-gateway (Phase 1C).
 */

export {
  PAYTM_REFUND_CAPABILITY,
  PAYTM_AGENT_WIRE_ACTION,
  type PaytmConnectorOptions,
  type PaytmRefundParameters,
} from "./PaytmCapabilities.js";

export { PaytmMetadata } from "./PaytmMetadata.js";

export {
  MockPaytmConnectorServer,
  type MockPaytmConnectorServerOptions,
} from "./MockPaytmConnectorServer.js";

export {
  PAYTM_ALLOWED_REFUND_PARAMETERS,
  PAYTM_AUTHORIZATION_SIGNATURE_TTL_MS,
  PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET,
  PAYTM_REFUND_REASON_MAX_LENGTH,
  PAYTM_REFUND_REFERENCE_MAX_LENGTH,
  canonicalPaytmAuthorizationString,
  deriveDeterministicPaytmRefId,
  isPaytmConnectorCredentialValue,
  isPaytmAgentRefundExecutionResult,
  redactPaytmConnectorSecret,
  type PaytmAllowedRefundParameter,
  type PaytmConnectorCredentialValue,
  type PaytmAgentRefundExecutionResult,
} from "./PaytmTypes.js";
