import { SLACK_POST_MESSAGE_CAPABILITY } from "@parmana/connector-slack";
import type {
  PolicySignals,
  SignalStateVerificationRequest,
  SignalStateVerifier,
  SignalStateViolation,
} from "@parmana/policy";

/**
 * Comma separated Slack channel ids this deployment may post to.
 */
export const SLACK_ALLOWED_CHANNEL_IDS_ENV = "SLACK_ALLOWED_CHANNEL_IDS";

/**
 * The slack-post-message signals this verifier checks itself, so the
 * caller's value is not what counts.
 */
export const SLACK_VERIFIED_SIGNAL_KEYS = ["channelAuthorized"] as const;

/**
 * Checks a slack:post-message against a channel allowlist the server
 * holds (G-76), instead of trusting the caller's channelAuthorized.
 *
 * slack-post-message 1.0.0 approves when the caller declares
 * contentApproved and channelAuthorized true, and binds only channelId
 * to the Intent's target. The connector posts to parameters.channel,
 * which nothing compared with the target. So an agent could post
 * anything to any channel the bot is in, by its own word, or name an
 * allowed channel in target and post to another one.
 *
 * A post passes only when parameters.channel is a string, equals the
 * target, and is in the allowlist. Anything else is reported as a
 * channelAuthorized violation, so the request is refused before
 * authorization and again at release. An empty or unset allowlist
 * refuses every post (fails closed). Other actions are not touched.
 */
export class SlackChannelSignalVerifier implements SignalStateVerifier {
  constructor(private readonly allowedChannelIds: ReadonlySet<string>) {}

  async findViolations(
    request: SignalStateVerificationRequest,
    signals: PolicySignals,
  ): Promise<readonly SignalStateViolation[]> {
    if (request.action !== SLACK_POST_MESSAGE_CAPABILITY) {
      return [];
    }

    const channel = request.intentParameters?.channel;

    const allowed =
      typeof channel === "string" &&
      channel === request.intentTarget &&
      this.allowedChannelIds.has(channel);

    return allowed
      ? []
      : [
          {
            signalKey: SLACK_VERIFIED_SIGNAL_KEYS[0],
            declaredValue: signals.channelAuthorized,
            actualValue: false,
          },
        ];
  }
}

/**
 * Splits SLACK_ALLOWED_CHANNEL_IDS on commas, trims, drops empty parts.
 */
export function parseAllowedSlackChannelIds(
  value: string | undefined,
): ReadonlySet<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}

export function createSlackChannelSignalVerifier(
  env: NodeJS.ProcessEnv = process.env,
): SlackChannelSignalVerifier {
  return new SlackChannelSignalVerifier(
    parseAllowedSlackChannelIds(env[SLACK_ALLOWED_CHANNEL_IDS_ENV]),
  );
}
