/**
 * @parmana/connector-hubspot
 *
 * HubSpot Deal capability definitions, schemas, and signal-state
 * verification support for Parmana: dealstage and amount updates on CRM
 * Objects API Deals only (this milestone's scope — see docs/CLAIMS.md).
 * Passive by design — the executable connector (GatewayHubSpotAdapter)
 * is owned by @parmana/execution-gateway (Phase 1C).
 */

export {
  HUBSPOT_DEAL_FETCH_CAPABILITY,
  HUBSPOT_DEAL_UPDATE_CAPABILITY,
  type HubSpotConnectorOptions,
  type HubSpotDealFetchParameters,
  type HubSpotDealUpdateParameters,
} from "./HubSpotCapabilities.js";

export { HubSpotMetadata } from "./HubSpotMetadata.js";

export {
  MockHubSpotServer,
  type MockHubSpotServerOptions,
} from "./MockHubSpotServer.js";

export {
  HUBSPOT_ALLOWED_DEAL_UPDATE_PROPERTIES,
  HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN,
  isHubSpotCredentialValue,
  redactHubSpotToken,
  type HubSpotAllowedDealUpdateProperty,
  type HubSpotCredentialValue,
  type HubSpotDeal,
  type HubSpotDealProperties,
} from "./HubSpotTypes.js";

export {
  HUBSPOT_DEFAULT_STAGE_ORDER,
  HUBSPOT_LOST_STAGE,
  HUBSPOT_DEFAULT_AMOUNT_CHANGE_THRESHOLD,
  isHubSpotStageTransitionAllowed,
  buildHubSpotDealUpdateSignals,
  type BuildHubSpotDealUpdateSignalsInput,
} from "./HubSpotDealUpdateSignals.js";

export {
  buildHubSpotDealUpdateReceipt,
  type BuildHubSpotDealUpdateReceiptOptions,
  type HubSpotDealUpdateReceipt,
} from "./HubSpotDealUpdateReceipt.js";

export {
  executeHubSpotCapability,
  hubSpotConnectorResponseMetadata,
  type HubSpotCapabilityExecutionContent,
  type HubSpotCapabilityExecutionOptions,
} from "./HubSpotCapabilityExecution.js";

export {
  HUBSPOT_VERIFIED_SIGNAL_KEYS,
  HubSpotSignalStateVerifier,
  type HubSpotSignalStateVerifierOptions,
} from "./HubSpotSignalStateVerifier.js";
