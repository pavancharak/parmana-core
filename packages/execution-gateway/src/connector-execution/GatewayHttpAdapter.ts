import type {
  Connector,
  ConnectorCapabilities,
  ConnectorExecutionContext,
  ConnectorRequest,
  ConnectorResponse,
} from "@parmana/connector-sdk";

export interface HttpConnectorOptions {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;
  readonly baseUrl: string;
  readonly headers?: Readonly<Record<string, string>>;
}

function httpMethodForCapability(capability: string): string {
  const [namespace, verb] = capability.split(":");
  if (namespace === "http" && verb !== undefined) {
    return verb.toUpperCase();
  }
  return "POST";
}

interface CredentialTokenValue {
  readonly token?: string;
}

function isCredentialTokenValue(value: unknown): value is CredentialTokenValue {
  return typeof value === "object" && value !== null;
}

/**
 * Capability-aware, hermetically-testable HTTP connector.
 *
 * Supports declared capabilities, per-request timeouts, credential
 * injection (Bearer token, from an already-resolved CredentialHandle —
 * never a raw secret), and deterministic responses. Fails closed: any
 * network error, timeout, or non-2xx response is a rejection, never a
 * guessed or partial success.
 *
 * This is a capability-aware connector implementation with its own
 * capability-to-method mapping.
 *
 * Gateway-owned production adapter (Phase 1C) — migrated verbatim from
 * @parmana/connector-sdk's HttpConnector; no protected file depended on
 * this one, so it moved wholesale (unlike HubSpot, no capability
 * constants needed to stay behind).
 */
export class GatewayHttpAdapter implements Connector {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;

  constructor(private readonly options: HttpConnectorOptions) {
    this.connectorId = options.connectorId;
    this.capabilities = options.capabilities;
    Object.freeze(this);
  }

  async execute(
    request: ConnectorRequest,
    context: ConnectorExecutionContext,
  ): Promise<ConnectorResponse> {
    if (!this.capabilities.includes(request.capability)) {
      throw new Error(
        `HttpConnector "${this.connectorId}" does not declare capability "${request.capability}".`,
      );
    }

    const method = httpMethodForCapability(request.capability);
    const path = request.target.startsWith("/")
      ? request.target
      : `/${request.target}`;
    const url = `${this.options.baseUrl}${path}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), context.timeoutMs);

    const credentialValue = context.credential.value;
    const bearer = isCredentialTokenValue(credentialValue)
      ? credentialValue.token
      : undefined;

    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...this.options.headers,
          ...(bearer !== undefined
            ? { Authorization: `Bearer ${bearer}` }
            : {}),
        },
        ...(method === "GET"
          ? {}
          : { body: JSON.stringify(request.parameters) }),
      });

      if (!response.ok) {
        throw new Error(
          `HttpConnector "${this.connectorId}" request failed with HTTP ${response.status}.`,
        );
      }

      const body: unknown = await response.json().catch(() => ({}));

      return {
        success: true,
        metadata: {
          status: response.status,
          body: body as Record<string, unknown>,
        },
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `HttpConnector "${this.connectorId}" request to capability "${request.capability}" ` +
            `timed out after ${context.timeoutMs}ms.`,
          {
            cause: error,
          },
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
