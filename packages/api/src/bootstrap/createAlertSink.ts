import { WebhookAlertSink, type AlertSink } from "@parmana/runtime";

/**
 * Creates the alert sink (G-138), or returns undefined when alerts are off.
 *
 * Off unless ALERT_WEBHOOK_URL is set, so deploying this code changes
 * nothing on its own. A URL that is set but unsafe (plain http to a remote
 * host) throws at startup rather than sending alerts somewhere unexpected.
 * ALERT_WEBHOOK_SECRET, when set, signs every alert body with HMAC-SHA256.
 */
export function createAlertSink(): AlertSink | undefined {
  const url = process.env.ALERT_WEBHOOK_URL?.trim();

  if (url === undefined || url === "") {
    return undefined;
  }

  const secret = process.env.ALERT_WEBHOOK_SECRET;

  return new WebhookAlertSink({
    url,
    secret: secret === undefined || secret === "" ? undefined : secret,
  });
}
