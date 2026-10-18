import type {
  Connector,
  ConnectorCapabilities,
  ConnectorExecutionContext,
  ConnectorRequest,
  ConnectorResponse,
} from "@parmana/connector-sdk";

import {
  SLACK_POST_MESSAGE_CAPABILITY,
  type SlackConnectorOptions,
} from "@parmana/connector-slack";

import {
  SLACK_ALLOWED_POST_MESSAGE_PARAMETERS,
  SLACK_TEST_MODE_PLACEHOLDER_TOKEN,
  isSlackCredentialValue,
  isSlackPostMessageResponse,
  redactSlackToken,
} from "@parmana/connector-slack";

const DEFAULT_BASE_URL = "https://slack.com";
const POST_MESSAGE_PATH = "/api/chat.postMessage";

/**
 * Slack connector: posts a message to a channel via Slack's real
 * chat.postMessage Web API, in-process (like GatewayHubSpotAdapter/
 * GatewayGitHubAdapter -- this connector calls Slack's own API directly,
 * unlike GatewayPaytmAdapter's remote-proxy pattern).
 *
 * Deny-by-default, structurally: SLACK_ALLOWED_POST_MESSAGE_PARAMETERS
 * is the only set of parameter names this connector will ever forward.
 * A request naming any other parameter is refused before any network
 * call, not silently dropped -- silently dropping an unsupported
 * parameter could mask a caller's real intent behind a post that
 * quietly did less than requested (mirrors HubSpot's own
 * HUBSPOT_ALLOWED_DEAL_UPDATE_PROPERTIES rationale).
 *
 * Slack-specific correctness a naive example would miss: Slack's API
 * always answers HTTP 200 -- failure is signaled only by the JSON
 * body's `ok: false` plus an `error` string. A connector that only
 * checked `response.ok` would treat every Slack-side failure (invalid
 * channel, revoked token, rate limit) as a silent success. This
 * connector checks `ok` explicitly and fails closed when it is false.
 */
export class GatewaySlackAdapter implements Connector {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;
  private readonly baseUrl: string;

  constructor(private readonly options: SlackConnectorOptions) {
    this.connectorId = options.connectorId;
    this.capabilities = options.capabilities;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

    // Fail closed at construction, not per-request: a production
    // process must never even register a Slack connector pointed at a
    // plaintext endpoint. NODE_ENV=test is exempt so the hermetic mock
    // server (http://127.0.0.1:<port>) keeps working.
    if (
      process.env.NODE_ENV !== "test" &&
      !this.baseUrl.startsWith("https://")
    ) {
      throw new Error(
        `SlackConnector "${this.connectorId}" requires an HTTPS base URL in production; ` +
          `received "${this.baseUrl}". Refusing to register a connector that would send a governed ` +
          "message post over plaintext HTTP.",
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
        `SlackConnector "${this.connectorId}" does not declare capability "${request.capability}".`,
      );
    }

    if (request.capability !== SLACK_POST_MESSAGE_CAPABILITY) {
      throw new Error(
        `SlackConnector "${this.connectorId}" has no handler for capability "${request.capability}".`,
      );
    }

    if (!isSlackCredentialValue(context.credential.value)) {
      throw new Error(
        `SlackConnector "${this.connectorId}" received a credential that is not a resolved Slack bot token.`,
      );
    }
    const { botToken } = context.credential.value;

    // Never rely on Slack happening to reject a test-mode placeholder
    // -- refuse outright unless the target is plainly local (a
    // hermetic mock server). Mirrors HubSpot's own
    // HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN guard.
    const isLocalTarget =
      this.baseUrl.startsWith("http://127.0.0.1") ||
      this.baseUrl.startsWith("http://localhost");
    if (!isLocalTarget && botToken === SLACK_TEST_MODE_PLACEHOLDER_TOKEN) {
      throw new Error(
        `SlackConnector "${this.connectorId}" refuses to send the built-in test-mode placeholder bot ` +
          `token to a non-local endpoint (${this.baseUrl}). Configure TEST_SLACK_BOT_TOKEN (or ` +
          "SLACK_BOT_TOKEN in production) with a real bot token, or point baseUrl at a mock server.",
      );
    }

    const disallowedKeys = Object.keys(request.parameters).filter(
      (key) =>
        !(SLACK_ALLOWED_POST_MESSAGE_PARAMETERS as readonly string[]).includes(
          key,
        ),
    );
    if (disallowedKeys.length > 0) {
      throw new Error(
        `SlackConnector "${this.connectorId}" refuses to send unsupported ` +
          `parameter${disallowedKeys.length === 1 ? "" : "s"} ${disallowedKeys.map((key) => `"${key}"`).join(", ")}. ` +
          `Only ${SLACK_ALLOWED_POST_MESSAGE_PARAMETERS.join(", ")} are sent.`,
      );
    }

    const channel = requireString(
      request.parameters.channel,
      "parameters.channel",
    );

    // G-76: the policy binds channelId to the target, so the channel the
    // message goes to must be that target. Otherwise a caller could name
    // an allowed channel in the target and post somewhere else.
    if (channel !== request.target) {
      throw new Error(
        `SlackConnector "${this.connectorId}" refuses to post: parameters.channel ` +
          `"${channel}" is not the authorized target "${request.target}".`,
      );
    }
    const text = requireString(request.parameters.text, "parameters.text");
    const bearerRedacted = redactSlackToken(botToken);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), context.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${POST_MESSAGE_PATH}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${botToken}`,
        },
        body: JSON.stringify({ channel, text }),
      });

      if (!response.ok) {
        throw new Error(
          `SlackConnector "${this.connectorId}" request failed with HTTP ${response.status}.`,
        );
      }

      const body: unknown = await response.json().catch(() => undefined);

      if (!isSlackPostMessageResponse(body)) {
        throw new Error(
          `SlackConnector "${this.connectorId}" received a malformed response -- missing "ok" field.`,
        );
      }

      // Slack's own success/failure signal -- HTTP status alone is
      // never sufficient (see class doc comment above).
      if (!body.ok) {
        throw new Error(
          `SlackConnector "${this.connectorId}" was refused by Slack: ${body.error ?? "unknown_error"}.`,
        );
      }

      return {
        success: true,
        metadata: {
          channel: body.channel ?? channel,
          ts: body.ts,
          bearerRedacted,
        },
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `SlackConnector "${this.connectorId}" request to capability "${request.capability}" ` +
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
      `SlackConnector request is missing required field "${field}".`,
    );
  }
  return value;
}
