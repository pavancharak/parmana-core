import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The neutral events endpoint checks each request with an HMAC over its raw body, using a secret
 * we control. The signature travels in the X-Parmana-Signature header as sha256=<hex>. Any provider
 * adapter signs the same way, so the endpoint never depends on one vendor.
 */

export const EVENTS_SIGNATURE_HEADER = "x-parmana-signature";

export function signEvents(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verifyEventsSignature(
  body: string,
  header: string,
  secret: string,
): boolean {
  const expected = Buffer.from(signEvents(body, secret));
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
