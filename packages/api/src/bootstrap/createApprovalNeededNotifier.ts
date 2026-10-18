import { createHmac } from "node:crypto";

import type {
  ApprovalNeededEvent,
  ApprovalNeededNotifier,
} from "@parmana/runtime";

import { SecretsProviderBootstrap } from "./secrets/SecretsProviderBootstrap.js";
import { createEmailApprovalNeededNotifier } from "./createEmailApprovalNeededNotifier.js";

export const APPROVAL_WEBHOOK_URL_ENV = "APPROVAL_WEBHOOK_URL";
export const APPROVAL_WEBHOOK_SECRET_ENV = "APPROVAL_WEBHOOK_SECRET";

export const APPROVAL_WEBHOOK_TIMEOUT_MS = 3000;

export const APPROVAL_WEBHOOK_SIGNATURE_HEADER = "parmana-webhook-signature";
export const APPROVAL_WEBHOOK_TIMESTAMP_HEADER = "parmana-webhook-timestamp";

/**
 * The signature a receiver recomputes to check an event came from this
 * deployment: HMAC SHA256, keyed with the shared secret, over the
 * timestamp header, a dot, and the exact request body, as lowercase hex
 * after "v1=". The receiver should also refuse an old timestamp.
 */
export function signApprovalWebhook(
  secret: string,
  timestamp: string,
  body: string,
): string {
  return (
    "v1=" +
    createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
  );
}

/**
 * POSTs each approval.needed event as JSON to a URL the operator
 * configures: a Slack workflow, an email relay, or any endpoint that
 * alerts the approver. The event names the transaction, the action,
 * and what the approval must cover, so the approver can sign one with
 * scripts/sign-approval.ts or the SDK's signApproval().
 *
 * Best effort. A failed or slow delivery is reported to RuntimeEngine,
 * which logs it; the request stays refused either way, and nothing is
 * retried. Refusal Records remain the complete list of refused
 * requests.
 */
export class WebhookApprovalNeededNotifier implements ApprovalNeededNotifier {
  private secret: Promise<string> | undefined;

  constructor(
    private readonly url: string,
    private readonly secretReference: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs: number = APPROVAL_WEBHOOK_TIMEOUT_MS,
  ) {}

  async notify(event: ApprovalNeededEvent): Promise<void> {
    this.secret ??= SecretsProviderBootstrap.create().then((secrets) =>
      secrets.getSecret(this.secretReference),
    );

    let secret: string;

    try {
      secret = await this.secret;
    } catch (error) {
      // Resolve again next time, rather than caching a failure.
      this.secret = undefined;
      throw error;
    }

    const body = JSON.stringify(event);
    const timestamp = String(Math.floor(Date.now() / 1000));

    const response = await this.fetchImpl(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [APPROVAL_WEBHOOK_TIMESTAMP_HEADER]: timestamp,
        [APPROVAL_WEBHOOK_SIGNATURE_HEADER]: signApprovalWebhook(
          secret,
          timestamp,
          body,
        ),
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`The approval webhook answered ${response.status}.`);
    }
  }
}

/**
 * Creates the webhook notifier from APPROVAL_WEBHOOK_URL and
 * APPROVAL_WEBHOOK_SECRET, or undefined when neither is set (refused
 * requests are then found by query). Fails at startup on half a
 * configuration, a URL that does not parse, or, outside test and
 * development, a URL that is not https: approval events name real
 * transactions and must not travel in the clear.
 */
export function createWebhookApprovalNeededNotifier(
  env: NodeJS.ProcessEnv = process.env,
): ApprovalNeededNotifier | undefined {
  const url = env[APPROVAL_WEBHOOK_URL_ENV]?.trim() || undefined;
  const secret = env[APPROVAL_WEBHOOK_SECRET_ENV]?.trim() || undefined;

  if (url === undefined && secret === undefined) {
    return undefined;
  }

  if (url === undefined || secret === undefined) {
    throw new Error(
      `${APPROVAL_WEBHOOK_URL_ENV} and ${APPROVAL_WEBHOOK_SECRET_ENV} must be set together.`,
    );
  }

  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${APPROVAL_WEBHOOK_URL_ENV} is not a valid URL.`);
  }

  const local = env.NODE_ENV === "test" || env.NODE_ENV === "development";

  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new Error(`${APPROVAL_WEBHOOK_URL_ENV} must be an https URL.`);
  }

  return new WebhookApprovalNeededNotifier(parsed.toString(), secret);
}

/**
 * Sends each approval.needed event to every configured channel: the
 * webhook (APPROVAL_WEBHOOK_URL) and email (APPROVAL_EMAIL_TO). All are
 * attempted; if any fails, the failure is reported, and the others are
 * still sent.
 */
export class CompositeApprovalNeededNotifier implements ApprovalNeededNotifier {
  constructor(private readonly notifiers: readonly ApprovalNeededNotifier[]) {}

  async notify(event: ApprovalNeededEvent): Promise<void> {
    const results = await Promise.allSettled(
      this.notifiers.map((notifier) => notifier.notify(event)),
    );

    const failures = results
      .filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      )
      .map((result) =>
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
      );

    if (failures.length > 0) {
      throw new Error(failures.join(" "));
    }
  }
}

/**
 * The approval notifier this deployment is configured with: webhook,
 * email, both, or none (undefined). Each channel fails at startup on a
 * bad configuration.
 */
export function createApprovalNeededNotifier(
  env: NodeJS.ProcessEnv = process.env,
): ApprovalNeededNotifier | undefined {
  const notifiers = [
    createWebhookApprovalNeededNotifier(env),
    createEmailApprovalNeededNotifier(env),
  ].filter(
    (notifier): notifier is ApprovalNeededNotifier => notifier !== undefined,
  );

  if (notifiers.length === 0) {
    return undefined;
  }

  return notifiers.length === 1
    ? notifiers[0]
    : new CompositeApprovalNeededNotifier(notifiers);
}
