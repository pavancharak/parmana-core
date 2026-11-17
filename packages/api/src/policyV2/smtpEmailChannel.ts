import { createTransport } from "nodemailer";

import type { NotificationChannel } from "./policyV2Notifications.js";

/**
 * Email over SMTP. SMTP is an open standard, so any provider or relay that speaks it can be used:
 * a self-hosted server, a hosted relay, or Amazon SES's SMTP interface. The connection is one URL,
 * set by PARMANA_POLICY_V2_SMTP_URL, so switching provider changes that setting, not the code.
 */

/** The part of a mail transport the channel uses. Nodemailer's transport satisfies it. */
export interface SmtpSender {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<{ messageId?: string }>;
}

export class SmtpEmailChannel implements NotificationChannel {
  constructor(
    private readonly transport: SmtpSender,
    private readonly from: string,
  ) {}

  /** Sends one message. The server returns a message id when it accepts the message. */
  async send(message: {
    readonly to: string;
    readonly subject: string;
    readonly body: string;
  }): Promise<boolean> {
    const info = await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.body,
    });
    return typeof info.messageId === "string" && info.messageId.length > 0;
  }
}

/** A transport built from the SMTP URL. Pass one in tests. */
export function smtpTransportFromUrl(url: string): SmtpSender {
  return createTransport(url);
}
