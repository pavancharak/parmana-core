import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";

import { SmtpEmailChannel, smtpTransportFromUrl } from "./smtpEmailChannel.js";

import type {
  NotificationChannel,
  NotificationChannels,
} from "./policyV2Notifications.js";

/**
 * Email for policy version 2 alerts, sent through Amazon SES. The sender is set by
 * PARMANA_POLICY_V2_EMAIL_FROM, an address in a domain verified in SES. Credentials come from the
 * AWS credential chain, as the other AWS clients use. Bounces and complaints are not read back yet.
 */

/** The part of the SES client the channel uses. The real client satisfies it. */
export interface SesSender {
  send(command: SendEmailCommand): Promise<{ readonly MessageId?: string }>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class SesEmailChannel implements NotificationChannel {
  constructor(
    private readonly client: SesSender,
    private readonly from: string,
  ) {}

  /** Sends one message. SES returns a message id when it accepts the message. */
  async send(message: {
    readonly to: string;
    readonly subject: string;
    readonly body: string;
  }): Promise<boolean> {
    const result = await this.client.send(
      new SendEmailCommand({
        Source: this.from,
        Destination: { ToAddresses: [message.to] },
        Message: {
          Subject: { Data: message.subject, Charset: "UTF-8" },
          Body: { Text: { Data: message.body, Charset: "UTF-8" } },
        },
      }),
    );
    return typeof result.MessageId === "string" && result.MessageId.length > 0;
  }
}

/**
 * The notification channels configured from the environment. Email is configured only when
 * PARMANA_POLICY_V2_EMAIL_FROM is set. A sender that is not an address, or a missing AWS_REGION,
 * is refused at startup. With no sender, there are no channels, and alerts are shown on the console only.
 */
export function policyV2ChannelsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  client?: SesSender,
): NotificationChannels {
  const from = env.PARMANA_POLICY_V2_EMAIL_FROM?.trim();
  const smtpUrl = env.PARMANA_POLICY_V2_SMTP_URL?.trim();
  if (smtpUrl !== undefined && smtpUrl !== "") {
    // SMTP is the default, and works with any provider that speaks it.
    if (from === undefined || !EMAIL.test(from)) {
      throw new Error(
        "PARMANA_POLICY_V2_EMAIL_FROM must be an email address when PARMANA_POLICY_V2_SMTP_URL is set.",
      );
    }
    const transport = smtpTransportFromUrl(smtpUrl);
    return { email: new SmtpEmailChannel(transport, from) };
  }
  if (from === undefined || from === "") return {};
  if (!EMAIL.test(from)) {
    throw new Error(
      `PARMANA_POLICY_V2_EMAIL_FROM must be an email address, got "${from}".`,
    );
  }
  const region = env.AWS_REGION?.trim();
  if (client === undefined && (region === undefined || region === "")) {
    throw new Error(
      "AWS_REGION must be set when PARMANA_POLICY_V2_EMAIL_FROM is set.",
    );
  }
  const sender = client ?? new SESClient({ region: region! });
  return { email: new SesEmailChannel(sender, from) };
}
