/**
 * @parmana/connector-slack
 *
 * Slack capability definitions, schemas, and mock-server test support
 * for Parmana: posting a message to a channel via chat.postMessage,
 * in-process, calling Slack's real Web API (like HubSpot/GitHub, not a
 * remote-proxy pattern like Paytm). Passive by design -- the executable
 * connector (GatewaySlackAdapter) is owned by @parmana/execution-gateway.
 */

export {
  SLACK_POST_MESSAGE_CAPABILITY,
  type SlackConnectorOptions,
  type SlackPostMessageParameters,
} from "./SlackCapabilities.js";

export { SlackMetadata } from "./SlackMetadata.js";

export {
  MockSlackServer,
  type MockSlackServerOptions,
} from "./MockSlackServer.js";

export {
  SLACK_ALLOWED_POST_MESSAGE_PARAMETERS,
  SLACK_TEST_MODE_PLACEHOLDER_TOKEN,
  isSlackCredentialValue,
  isSlackPostMessageResponse,
  redactSlackToken,
  type SlackAllowedPostMessageParameter,
  type SlackCredentialValue,
  type SlackPostMessageResponse,
} from "./SlackTypes.js";
