import type {
  Connector,
  ConnectorCapabilities,
  ConnectorExecutionContext,
  ConnectorRequest,
  ConnectorResponse,
} from "@parmana/connector-sdk";

import {
  PAYTM_AGENT_WIRE_ACTION,
  PAYTM_REFUND_CAPABILITY,
  type PaytmConnectorOptions,
} from "@parmana/connector-paytm";

import {
  PAYTM_ALLOWED_REFUND_PARAMETERS,
  PAYTM_AUTHORIZATION_SIGNATURE_TTL_MS,
  PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET,
  PAYTM_REFUND_REASON_MAX_LENGTH,
  PAYTM_REFUND_REFERENCE_MAX_LENGTH,
  canonicalPaytmAuthorizationString,
  deriveDeterministicPaytmRefId,
  isPaytmAgentRefundExecutionResult,
  isPaytmConnectorCredentialValue,
  redactPaytmConnectorSecret,
} from "@parmana/connector-paytm";

import { DEFAULT_KEY_ID, SignerBootstrap } from "@parmana/crypto";

const PAYTM_REFUND_PATH = "/connector/paytm-refund";

/**
 * Paytm connector: forwards an already Parmana-authorized paytm:refund
 * ConnectorRequest to the trusted, out-of-process Paytm connector
 * service (parmana-paytm-agent) over HTTPS, and validates what comes
 * back before trusting it as execution evidence.
 *
 * This is a REMOTE connector, unlike GatewayHubSpotAdapter/
 * GatewayGitHubAdapter which call the vendor's real API in-process:
 *
 *   Parmana Execution Gateway -> GatewayPaytmAdapter (this class)
 *     -> HTTPS -> PAYTM_CONNECTOR_URL/connector/paytm-refund
 *     -> (a separate, trusted service) -> Paytm /refund/apply
 *
 * This connector never calls Paytm's own API, never holds
 * PAYTM_MERCHANT_KEY, and never re-runs authorization -- the request it
 * forwards is exactly the ConnectorRequest the Gateway already verified
 * against the signed, policy-approved envelope. Paytm's own merchant
 * key and checksum verification live exclusively inside the connector
 * service; the shared secret this class sends is transport
 * authentication between Parmana and its own connector service, not a
 * substitute for Parmana's policy authorization and not Paytm
 * authentication itself. See docs/connectors/PAYTM_CONNECTOR.md.
 *
 * Wire format: matches the REAL parmana-paytm-agent connector service's
 * POST /connector/paytm-refund contract, verified against that
 * repository's own source (src/server/index.ts,
 * executeAuthorizedConnectorRequest) -- NOT the generic flattened
 * ConnectorRequest shape other Gateway adapters send. That contract
 * expects a {transaction, authorization} envelope, "txnId" rather than
 * "transactionId", a caller-supplied "refId" (the connector service has
 * no server-side idempotency derivation of its own), and the hyphenated
 * action string PAYTM_AGENT_WIRE_ACTION rather than Parmana's own
 * namespaced "paytm:refund" capability id. Parmana's internal capability
 * identity is never renamed to satisfy this -- only the one outbound
 * HTTP body this class builds uses the wire action string.
 *
 * Deny-by-default, structurally: PAYTM_ALLOWED_REFUND_PARAMETERS is the
 * only set of parameter names this connector will ever forward. A
 * request naming any other parameter is refused before any network
 * call, not silently dropped.
 *
 * Idempotency: refId is deterministically derived from (orderId,
 * transactionId), plus the caller's refundReference when one is sent
 * (G-71) -- never Math.random()/Date.now() -- so a retried request for
 * the same logical refund always carries the same refId.
 * See deriveDeterministicPaytmRefId's own doc comment for why this
 * matters given the connector service's own idempotency gap.
 *
 * Response-validation, structurally: the connector service's response
 * must echo back businessTransactionId, action, and the orderId/txnId
 * parameters exactly as sent. Any mismatch is refused -- this
 * connector never accepts a response at face value as proof it
 * corresponds to the request that produced it (defends against a
 * misrouted, replayed, or malicious response).
 */
export class GatewayPaytmAdapter implements Connector {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;
  private readonly baseUrl: string;

  constructor(private readonly options: PaytmConnectorOptions) {
    this.connectorId = options.connectorId;
    this.capabilities = options.capabilities;
    this.baseUrl = options.baseUrl;

    // Fail closed at construction, not per-request: a production
    // process must never even register a Paytm connector pointed at a
    // plaintext endpoint. NODE_ENV=test is exempt so the hermetic mock
    // server (http://127.0.0.1:<port>) keeps working.
    if (
      process.env.NODE_ENV !== "test" &&
      !this.baseUrl.startsWith("https://")
    ) {
      throw new Error(
        `PaytmConnector "${this.connectorId}" requires an HTTPS PAYTM_CONNECTOR_URL in production; ` +
          `received "${this.baseUrl}". Refusing to register a connector that would send a governed ` +
          "refund request over plaintext HTTP.",
      );
    }

    Object.freeze(this);
  }

  async execute(
    request: ConnectorRequest,
    context: ConnectorExecutionContext,
  ): Promise<ConnectorResponse> {
    if (!this.capabilities.includes(request.capability)) {
      throw new Error(
        `PaytmConnector "${this.connectorId}" does not declare capability "${request.capability}".`,
      );
    }

    if (request.capability !== PAYTM_REFUND_CAPABILITY) {
      throw new Error(
        `PaytmConnector "${this.connectorId}" has no handler for capability "${request.capability}".`,
      );
    }

    if (!isPaytmConnectorCredentialValue(context.credential.value)) {
      throw new Error(
        `PaytmConnector "${this.connectorId}" received a credential that is not a resolved connector shared secret.`,
      );
    }
    const { sharedSecret } = context.credential.value;

    // Never rely on the far side happening to reject a test-mode
    // placeholder -- refuse outright unless the target is plainly local
    // (a hermetic mock server). See PaytmTypes.ts's comment on
    // PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET.
    const isLocalTarget =
      this.baseUrl.startsWith("http://127.0.0.1") ||
      this.baseUrl.startsWith("http://localhost");
    if (
      !isLocalTarget &&
      sharedSecret === PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET
    ) {
      throw new Error(
        `PaytmConnector "${this.connectorId}" refuses to send the built-in test-mode placeholder shared ` +
          `secret to a non-local endpoint (${this.baseUrl}). Configure TEST_PAYTM_CONNECTOR_SHARED_SECRET ` +
          "(or PAYTM_CONNECTOR_SHARED_SECRET in production) with a real shared secret, or point " +
          "PAYTM_CONNECTOR_URL at a local mock server.",
      );
    }

    const disallowedKeys = Object.keys(request.parameters).filter(
      (key) =>
        !(PAYTM_ALLOWED_REFUND_PARAMETERS as readonly string[]).includes(key),
    );
    if (disallowedKeys.length > 0) {
      throw new Error(
        `PaytmConnector "${this.connectorId}" refuses to forward unsupported refund ` +
          `parameter${disallowedKeys.length === 1 ? "" : "s"} ${disallowedKeys.map((key) => `"${key}"`).join(", ")}. ` +
          `Only ${PAYTM_ALLOWED_REFUND_PARAMETERS.join(", ")} are forwarded this milestone.`,
      );
    }

    const orderId = requireString(
      request.parameters.orderId,
      "parameters.orderId",
    );
    const txnId = requireString(
      request.parameters.transactionId,
      "parameters.transactionId",
    );
    const amount = requireNumber(
      request.parameters.amount,
      "parameters.amount",
    );
    const amountString = amount.toFixed(2);
    // G-71: both optional. A reference makes the refId per refund, not
    // per transaction; a reason reaches Paytm as the refund comment.
    const refundReference = optionalBoundedString(
      request.parameters.refundReference,
      "parameters.refundReference",
      PAYTM_REFUND_REFERENCE_MAX_LENGTH,
    );
    const refundReason = optionalBoundedString(
      request.parameters.refundReason,
      "parameters.refundReason",
      PAYTM_REFUND_REASON_MAX_LENGTH,
    );
    const refId = deriveDeterministicPaytmRefId(
      orderId,
      txnId,
      refundReference,
    );

    // ADR-0009 Phase 2B: sign the authorization so parmana-paytm-agent
    // can cryptographically verify this request was actually approved
    // by Parmana's policy engine, not merely sent by someone who knows
    // the shared secret alone (that secret is transport authentication
    // between Parmana and its own connector service -- see this file's
    // class doc comment -- never a substitute for policy authorization).
    const expiresAt = Date.now() + PAYTM_AUTHORIZATION_SIGNATURE_TTL_MS;

    const canonicalAuthorization = canonicalPaytmAuthorizationString({
      businessTransactionId: request.businessTransactionId,
      action: PAYTM_AGENT_WIRE_ACTION,
      orderId,
      txnId,
      amount: amountString,
      expiresAt,
    });

    const signer = await SignerBootstrap.create();
    const signature = await signer.sign(
      DEFAULT_KEY_ID,
      Buffer.from(canonicalAuthorization, "utf8"),
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), context.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${PAYTM_REFUND_PATH}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sharedSecret}`,
        },
        body: JSON.stringify({
          transaction: {
            businessTransactionId: request.businessTransactionId,
            intent: {
              action: PAYTM_AGENT_WIRE_ACTION,
              target: request.target,
              parameters: {
                orderId,
                txnId,
                refId,
                amount: amountString,
                ...(refundReason !== undefined ? { reason: refundReason } : {}),
              },
            },
          },
          authorization: {
            payload: {
              businessTransactionId: request.businessTransactionId,
              grantedCapability: PAYTM_AGENT_WIRE_ACTION,
              expiresAt,
            },
            signature,
            keyId: DEFAULT_KEY_ID,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `PaytmConnector "${this.connectorId}" request to the Paytm connector service failed with HTTP ${response.status}.`,
        );
      }

      const body: unknown = await response.json().catch(() => undefined);

      if (!isPaytmAgentRefundExecutionResult(body)) {
        throw new Error(
          `PaytmConnector "${this.connectorId}" received a malformed response from the Paytm connector ` +
            "service -- missing or invalid required fields.",
        );
      }

      // Never accept the response at face value as proof it corresponds
      // to this request -- every identifying field must echo back
      // exactly, or this is refused as a binding-validation failure.
      const mismatches: string[] = [];
      if (body.businessTransactionId !== request.businessTransactionId)
        mismatches.push("businessTransactionId");
      if (body.action !== PAYTM_AGENT_WIRE_ACTION) mismatches.push("action");
      if (body.parameters.orderId !== orderId) mismatches.push("orderId");
      if (body.parameters.txnId !== txnId) mismatches.push("txnId");

      if (mismatches.length > 0) {
        throw new Error(
          `PaytmConnector "${this.connectorId}" refuses a connector-service response whose ` +
            `${mismatches.join(", ")} did not match the request that was sent -- binding validation failed.`,
        );
      }

      return {
        success: body.success,
        metadata: {
          refId: body.parameters.refId,
          orderId: body.parameters.orderId,
          txnId: body.parameters.txnId,
          executedAt: body.executedAt,
          ...body.metadata,
          sharedSecretRedacted: redactPaytmConnectorSecret(sharedSecret),
        },
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `PaytmConnector "${this.connectorId}" request to capability "${request.capability}" ` +
            `timed out after ${context.timeoutMs}ms.`,
          { cause: error },
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `PaytmConnector request is missing required field "${field}".`,
    );
  }
  return value;
}

function optionalBoundedString(
  value: unknown,
  field: string,
  maxLength: number,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    throw new Error(
      `PaytmConnector request field "${field}" must be a non empty string of at most ${maxLength} characters.`,
    );
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `PaytmConnector request field "${field}" must be a finite number.`,
    );
  }
  //
  // The amount is sent as amount.toFixed(2). An amount with more than
  // two decimals would be approved and recorded as given but refunded
  // rounded, so the refund and its evidence would disagree. Refused.
  //
  if (Math.abs(Math.round(value * 100) - value * 100) > 1e-6) {
    throw new Error(
      `PaytmConnector request field "${field}" must have at most two decimal places.`,
    );
  }
  return value;
}
