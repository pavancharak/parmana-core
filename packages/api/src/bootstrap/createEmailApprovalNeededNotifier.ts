import { Resend } from "resend";

import type {
  ApprovalNeededEvent,
  ApprovalNeededNotifier,
} from "@parmana/runtime";

export const APPROVAL_EMAIL_TO_ENV = "APPROVAL_EMAIL_TO";
export const APPROVAL_EMAIL_FROM_ENV = "APPROVAL_EMAIL_FROM";

/**
 * Set by the Resend integration on Vercel (vercel integration add
 * resend/resend-email): the API key, and the verified domain to send
 * from.
 */
export const RESEND_API_KEY_ENV = "RESEND_API_KEY";
export const RESEND_EMAIL_DOMAIN_ENV = "RESEND_EMAIL_DOMAIN";

export interface ApprovalEmail {
  readonly from: string;
  readonly to: readonly string[];
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  /**
   * One email per refused request, even if the send is retried.
   */
  readonly idempotencyKey: string;
}

/**
 * Sends one email, answering an error message on failure. The Resend
 * SDK returns errors instead of throwing them.
 */
export type ApprovalEmailSender = (
  email: ApprovalEmail,
) => Promise<{ readonly error?: string }>;

export function resendSender(apiKey: string): ApprovalEmailSender {
  const resend = new Resend(apiKey);

  return async (email) => {
    const { error } = await resend.emails.send(
      {
        from: email.from,
        to: [...email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      },
      { idempotencyKey: email.idempotencyKey },
    );

    return error ? { error: error.message } : {};
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The email for one approval.needed event: what was refused, and exactly
 * what to sign. Carries the same fields as the webhook event and nothing
 * else from the request.
 */
export function composeApprovalEmail(
  event: ApprovalNeededEvent,
  from: string,
  to: readonly string[],
): ApprovalEmail {
  const [first] = event.approvals;
  const resource = first?.resourceId ?? event.target;
  const amount = first?.value !== undefined ? ` up to ${first.value}` : "";

  const lines = [
    `A request was refused because it needs a signed approval.`,
    ``,
    `Action:       ${event.action}`,
    `Target:       ${event.target}`,
    `Policy:       ${event.policyId} ${event.policyVersion}`,
    `Transaction:  ${event.businessTransactionId}`,
    `Refused at:   ${event.occurredAt}`,
    ...(event.submittedBy !== undefined
      ? [`Sent by:      ${event.submittedBy}`]
      : []),
    ``,
    `To approve, sign on your own machine:`,
    ...event.approvals.map((approval) =>
      [
        `  capability  ${event.action}`,
        `  resourceId  ${approval.resourceId ?? "(not in the request)"}`,
        ...(approval.value !== undefined
          ? [`  maxAmount   ${approval.value}`]
          : []),
        `  signal      ${approval.signal}`,
      ].join("\n"),
    ),
    ``,
    `Then send the approval to the agent, which resends the request with it.`,
    `If you do not approve, do nothing: the request stays refused.`,
    ``,
    `Guide: https://docs.parmanasystems.com/concepts/human-approval`,
  ];

  const text = lines.join("\n");

  return {
    from,
    to,
    subject: `Approval needed: ${event.action} ${resource}${amount}`,
    text,
    html: `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px">${escapeHtml(text)}</pre>`,
    idempotencyKey: `approval-needed/${event.decisionId}`,
  };
}

/**
 * Emails each approval.needed event to the configured approvers through
 * Resend. Best effort, like the webhook: RuntimeEngine logs a failure,
 * and the request stays refused either way.
 */
export class EmailApprovalNeededNotifier implements ApprovalNeededNotifier {
  constructor(
    private readonly from: string,
    private readonly to: readonly string[],
    private readonly send: ApprovalEmailSender,
  ) {}

  async notify(event: ApprovalNeededEvent): Promise<void> {
    const { error } = await this.send(
      composeApprovalEmail(event, this.from, this.to),
    );

    if (error !== undefined) {
      throw new Error(`The approval email was not sent: ${error}`);
    }
  }
}

const EMAIL = /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/;

/**
 * Creates the email notifier from APPROVAL_EMAIL_TO (comma separated
 * addresses), or undefined when it is not set. Needs RESEND_API_KEY, and
 * a sender: APPROVAL_EMAIL_FROM, or approvals@ the RESEND_EMAIL_DOMAIN.
 * Fails at startup on an address that is not valid or a missing key or
 * sender, rather than failing every email later.
 */
export function createEmailApprovalNeededNotifier(
  env: NodeJS.ProcessEnv = process.env,
  sender: (apiKey: string) => ApprovalEmailSender = resendSender,
): ApprovalNeededNotifier | undefined {
  const toValue = env[APPROVAL_EMAIL_TO_ENV]?.trim();

  if (!toValue) {
    return undefined;
  }

  const to = toValue
    .split(",")
    .map((address) => address.trim())
    .filter((address) => address.length > 0);

  const invalid = to.filter((address) => !EMAIL.test(address));

  if (to.length === 0 || invalid.length > 0) {
    throw new Error(
      `${APPROVAL_EMAIL_TO_ENV} must be email addresses separated by commas.`,
    );
  }

  const apiKey = env[RESEND_API_KEY_ENV]?.trim();

  if (!apiKey) {
    throw new Error(
      `${APPROVAL_EMAIL_TO_ENV} is set, but ${RESEND_API_KEY_ENV} is not. Add the Resend integration.`,
    );
  }

  const domain = env[RESEND_EMAIL_DOMAIN_ENV]?.trim();
  const from =
    env[APPROVAL_EMAIL_FROM_ENV]?.trim() ||
    (domain ? `Parmana approvals <approvals@${domain}>` : undefined);

  if (from === undefined) {
    throw new Error(
      `${APPROVAL_EMAIL_TO_ENV} is set, but there is no sender: set ${APPROVAL_EMAIL_FROM_ENV} or ${RESEND_EMAIL_DOMAIN_ENV}.`,
    );
  }

  return new EmailApprovalNeededNotifier(from, to, sender(apiKey));
}
