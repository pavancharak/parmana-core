import type {
  Connector,
  ConnectorCapabilities,
  ConnectorExecutionContext,
  ConnectorRequest,
  ConnectorResponse,
} from "@parmana/connector-sdk";

import {
  HUBSPOT_DEAL_FETCH_CAPABILITY,
  HUBSPOT_DEAL_UPDATE_CAPABILITY,
  type HubSpotConnectorOptions,
} from "@parmana/connector-hubspot";

import {
  HUBSPOT_ALLOWED_DEAL_UPDATE_PROPERTIES,
  HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN,
  isHubSpotCredentialValue,
  redactHubSpotToken,
  type HubSpotAllowedDealUpdateProperty,
  type HubSpotDeal,
} from "@parmana/connector-hubspot";

const DEFAULT_BASE_URL = "https://api.hubapi.com";

/**
 * HubSpot connector: deal fetch (read, used to learn the deal's current
 * dealstage/amount for policy evaluation) and deal update (the guarded
 * execution — PATCH dealstage and/or amount only).
 *
 * Not built on the generic HttpConnector: HubSpot's Private App auth is
 * a single Bearer token (this part IS what HttpConnector already
 * supports), but this connector also needs a deny-by-default property
 * allowlist enforced before any network call, which is business-specific
 * to this milestone and does not belong in a generic HTTP connector. A
 * sibling implementation is used instead, following HttpConnector's own
 * pattern: fetch-based, AbortController timeout, fail-closed on any
 * non-2xx response or network error.
 *
 * Deny-by-default, structurally: HUBSPOT_ALLOWED_DEAL_UPDATE_PROPERTIES
 * is the only set of Deal properties this connector will ever place in a
 * PATCH body. A request naming any other property is refused before any
 * network call, not silently dropped — silently dropping an unsupported
 * property could mask a caller's real intent (e.g. a bug that meant to
 * update "closedate" alongside dealstage) behind an update that quietly
 * did less than requested.
 *
 * Gateway-owned production adapter (Phase 1C) — migrated verbatim from
 * @parmana/connector-hubspot's HubSpotConnector; capability identifiers and
 * option/parameter DTOs stayed behind in connector-hubspot's
 * HubSpotCapabilities.ts (imported back here), only the executable class
 * moved.
 */
export class GatewayHubSpotAdapter implements Connector {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;
  private readonly baseUrl: string;

  constructor(private readonly options: HubSpotConnectorOptions) {
    this.connectorId = options.connectorId;
    this.capabilities = options.capabilities;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    Object.freeze(this);
  }

  async execute(
    request: ConnectorRequest,
    context: ConnectorExecutionContext,
  ): Promise<ConnectorResponse> {
    if (!this.capabilities.includes(request.capability)) {
      throw new Error(
        `HubSpotConnector "${this.connectorId}" does not declare capability "${request.capability}".`,
      );
    }

    if (!isHubSpotCredentialValue(context.credential.value)) {
      throw new Error(
        `HubSpotConnector "${this.connectorId}" received a credential that is not a resolved HubSpot Private App token.`,
      );
    }
    const { privateAppToken } = context.credential.value;

    // Fail closed before any network setup: the built-in test-mode
    // placeholder (createHubSpotCredentialProvider.ts's fallback when no
    // real test-mode credential is configured) is only ever safe against
    // a mock server reached through an explicit baseUrl override. Sent
    // to HubSpot's real API, it can only ever be rejected — but relying
    // on that rejection is an accident of HubSpot's behavior, not a
    // guarantee this codebase controls. Refuse outright instead. See
    // HubSpotTypes.ts's comment on HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN
    // for why this guard exists from this connector's first version.
    if (
      this.baseUrl === DEFAULT_BASE_URL &&
      privateAppToken === HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN
    ) {
      throw new Error(
        `HubSpotConnector "${this.connectorId}" refuses to send the built-in test-mode placeholder ` +
          `credential to HubSpot's real API (${DEFAULT_BASE_URL}). This placeholder is only safe against ` +
          "a mock server reached via an explicit baseUrl override. Configure TEST_HUBSPOT_PRIVATE_APP_TOKEN " +
          "(or HUBSPOT_PRIVATE_APP_TOKEN in production) with a real Private App token, or point baseUrl at " +
          "a mock server.",
      );
    }

    const authorizationHeader = `Bearer ${privateAppToken}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), context.timeoutMs);

    try {
      switch (request.capability) {
        case HUBSPOT_DEAL_FETCH_CAPABILITY:
          return await this.fetchDeal(
            request,
            authorizationHeader,
            controller.signal,
            privateAppToken,
          );
        case HUBSPOT_DEAL_UPDATE_CAPABILITY:
          return await this.updateDeal(
            request,
            authorizationHeader,
            controller.signal,
            privateAppToken,
          );
        default:
          throw new Error(
            `HubSpotConnector "${this.connectorId}" has no handler for capability "${request.capability}".`,
          );
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `HubSpotConnector "${this.connectorId}" request to capability "${request.capability}" ` +
            `timed out after ${context.timeoutMs}ms.`,
          { cause: error },
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchDeal(
    request: ConnectorRequest,
    authorizationHeader: string,
    signal: AbortSignal,
    token: string,
  ): Promise<ConnectorResponse> {
    const dealId = requireString(
      request.parameters.dealId,
      "parameters.dealId",
    );
    const deal = (await this.hubspotGet(
      `/crm/v3/objects/deals/${encodeURIComponent(dealId)}?properties=dealstage,amount,pipeline`,
      authorizationHeader,
      signal,
    )) as HubSpotDeal;
    return {
      success: true,
      metadata: { deal, bearerRedacted: redactHubSpotToken(token) },
    };
  }

  /**
   * Deny-by-default execution: only dealstage and amount ever reach the
   * PATCH body. Every other key present in request.parameters (besides
   * dealId) is refused before any network call.
   */
  private async updateDeal(
    request: ConnectorRequest,
    authorizationHeader: string,
    signal: AbortSignal,
    token: string,
  ): Promise<ConnectorResponse> {
    const dealId = requireString(
      request.parameters.dealId,
      "parameters.dealId",
    );
    const bearerRedacted = redactHubSpotToken(token);

    const disallowedKeys = Object.keys(request.parameters).filter(
      (key) =>
        key !== "dealId" &&
        !(HUBSPOT_ALLOWED_DEAL_UPDATE_PROPERTIES as readonly string[]).includes(
          key,
        ),
    );
    if (disallowedKeys.length > 0) {
      throw new Error(
        `HubSpotConnector "${this.connectorId}" refuses to update unsupported deal ` +
          `propert${disallowedKeys.length === 1 ? "y" : "ies"} ${disallowedKeys.map((key) => `"${key}"`).join(", ")}. ` +
          `Only ${HUBSPOT_ALLOWED_DEAL_UPDATE_PROPERTIES.join(", ")} are touchable this milestone.`,
      );
    }

    const dealstage = request.parameters.dealstage;
    const amount = request.parameters.amount;

    if (dealstage === undefined && amount === undefined) {
      throw new Error(
        `HubSpotConnector "${this.connectorId}" received a deal-update request with neither ` +
          "dealstage nor amount set — there is nothing to update.",
      );
    }

    const properties: Partial<
      Record<HubSpotAllowedDealUpdateProperty, string>
    > = {};
    if (dealstage !== undefined)
      properties.dealstage = requireString(dealstage, "parameters.dealstage");
    if (amount !== undefined)
      properties.amount = String(requireNumber(amount, "parameters.amount"));

    const updated = (await this.hubspotPatch(
      `/crm/v3/objects/deals/${encodeURIComponent(dealId)}`,
      { properties },
      authorizationHeader,
      signal,
    )) as HubSpotDeal;

    return { success: true, metadata: { deal: updated, bearerRedacted } };
  }

  private async hubspotGet(
    path: string,
    authorizationHeader: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      signal,
      headers: { Authorization: authorizationHeader },
    });
    return this.parseOrFailClosed(response);
  }

  private async hubspotPatch(
    path: string,
    body: Record<string, unknown>,
    authorizationHeader: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "PATCH",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: authorizationHeader,
      },
      body: JSON.stringify(body),
    });
    return this.parseOrFailClosed(response);
  }

  private async parseOrFailClosed(response: Response): Promise<unknown> {
    if (!response.ok) {
      throw new Error(
        `HubSpotConnector "${this.connectorId}" request failed with HTTP ${response.status}.`,
      );
    }
    const text = await response.text();

    try {
      return JSON.parse(text) as unknown;
    } catch {
      // A 2xx body that is not JSON is not evidence of the action. Recording
      // it as success would sign an outcome nothing confirmed.
      throw new Error(
        `${this.connectorId} returned a 2xx response that is not JSON; the outcome is not confirmed.`,
      );
    }
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `HubSpotConnector request is missing required field "${field}".`,
    );
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `HubSpotConnector request field "${field}" must be a finite number.`,
    );
  }
  return value;
}
