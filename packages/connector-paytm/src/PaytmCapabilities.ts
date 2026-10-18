import type { ConnectorCapabilities } from "@parmana/connector-sdk";

/**
 * Paytm capability identifiers and connector-configuration/parameter
 * DTOs. Pure metadata -- no execution logic. The executable connector
 * (GatewayPaytmAdapter) lives in @parmana/execution-gateway and imports
 * these back from here (Phase 1C, mirrors @parmana/connector-hubspot).
 *
 * Exactly one capability is declared, matching exactly what the
 * connector implements -- refunding a specific, already-charged Paytm
 * order/transaction. There is no "paytm:*" wildcard and no additional
 * Paytm capability (charge, payout, settlement query, ...) declared
 * here; adding one is a deliberate, separate milestone, not an
 * incidental side effect of this one.
 */
export const PAYTM_REFUND_CAPABILITY = "paytm:refund";

/**
 * The action string the real parmana-paytm-agent connector service's
 * POST /connector/paytm-refund handler expects in the outbound wire
 * request (transaction.intent.action / authorization.payload.
 * grantedCapability) -- a hyphenated literal, not Parmana's own
 * namespaced capability id above. This is purely a transport-boundary
 * translation performed by GatewayPaytmAdapter: Parmana's internal
 * capability identity stays "paytm:refund" everywhere else (policy
 * binding, connector registration, capability declaration) and is
 * never renamed to satisfy one remote service's own wire convention.
 */
export const PAYTM_AGENT_WIRE_ACTION = "paytm-refund";

export interface PaytmConnectorOptions {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;

  /**
   * Base URL of the trusted, out-of-process Paytm connector service
   * (parmana-paytm-agent), e.g. https://paytm-connector.internal.example.com.
   * Required -- unlike HubSpot/GitHub there is no real-vendor default:
   * this connector never talks to Paytm's own API directly, only to
   * Parmana's own connector service, which is the only thing that ever
   * holds a real Paytm merchant key.
   */
  readonly baseUrl: string;
}

export interface PaytmRefundParameters {
  /** The Paytm Order ID the original transaction belongs to. */
  readonly orderId: string;
  /** The original Paytm transaction id being refunded. */
  readonly transactionId: string;
  /** Refund amount, in the same currency unit customer-refund's policy evaluates (boundSignals: parameters.amount). */
  readonly amount: number;
  /** Optional, human readable refund reason; sent to the connector service as `reason`, which passes it to Paytm as the refund comment (G-71). */
  readonly refundReason?: string;
  /** Optional caller id for ONE refund; when present the Paytm refId is derived from it too, so separate refunds of one transaction get separate refIds (G-71). */
  readonly refundReference?: string;
}
