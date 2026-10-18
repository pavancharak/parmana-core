import { SLACK_TEST_MODE_PLACEHOLDER_TOKEN } from "@parmana/connector-slack";
import {
  StaticCredentialProvider,
  brandCredentialHandle,
  type CredentialHandle,
  type CredentialProvider,
} from "@parmana/connector-sdk";

const SLACK_CONNECTOR_ID = "slack";

/**
 * Resolves Slack's credential: a single bot token, mirroring HubSpot's
 * single-Private-App-token shape. A small dedicated provider is used
 * (rather than the generic EnvironmentCredentialProvider) so the
 * resolved value's field name (botToken) matches GatewaySlackAdapter's
 * own SlackCredentialValue shape exactly, and so error messages can
 * name SLACK_BOT_TOKEN specifically.
 *
 * botToken is read from process.env only inside resolve(), held only
 * in the returned CredentialHandle's value, and never placed anywhere
 * else -- not logged, not embedded in a thrown error (only the
 * variable name SLACK_BOT_TOKEN ever appears in messages).
 */
class SlackEnvironmentCredentialProvider implements CredentialProvider {
  readonly providerId = "environment";

  async resolve(connectorId: string): Promise<CredentialHandle> {
    if (connectorId !== SLACK_CONNECTOR_ID) {
      throw new Error(
        `SlackEnvironmentCredentialProvider cannot resolve credentials for connector "${connectorId}".`,
      );
    }

    const botToken = process.env.SLACK_BOT_TOKEN;

    if (botToken === undefined) {
      throw new Error(
        `Environment variable SLACK_BOT_TOKEN for connector "${SLACK_CONNECTOR_ID}" is not set.`,
      );
    }

    return brandCredentialHandle({
      providerId: this.providerId,
      credentialId: "SLACK_BOT_TOKEN",
      value: Object.freeze({ botToken }),
    });
  }
}

/**
 * Creates the Slack credential provider, or undefined when the
 * slack:post-message capability should not be registered at all.
 *
 * Test (NODE_ENV=test): a static botToken, overridable via
 * TEST_SLACK_BOT_TOKEN -- read directly, with no intermediate bridge
 * variable (the documented lesson from HubSpot/Paytm's own history:
 * a bridge variable that call sites must remember to populate is a
 * gotcha waiting to happen).
 *
 * Production: SLACK_BOT_TOKEN. If unset, this returns undefined rather
 * than a partially-configured provider or a fallback to mock
 * credentials -- createConnectorRegistry.ts does not register the
 * Slack connector at all in that case.
 */
export function createSlackCredentialProvider():
  CredentialProvider | undefined {
  if (process.env.NODE_ENV === "test") {
    return new StaticCredentialProvider({
      [SLACK_CONNECTOR_ID]: {
        botToken:
          process.env.TEST_SLACK_BOT_TOKEN ?? SLACK_TEST_MODE_PLACEHOLDER_TOKEN,
      },
    });
  }

  if (process.env.SLACK_BOT_TOKEN === undefined) {
    return undefined;
  }

  return new SlackEnvironmentCredentialProvider();
}
