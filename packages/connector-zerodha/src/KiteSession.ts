import { createHash } from "node:crypto";
import { KITE_LOGIN_URL, KITE_API_VERSION } from "./ZerodhaCapabilities.js";

/**
 * Pure helpers for the Kite Connect login flow, as documented at
 * https://kite.trade/docs/connect/v3/user/. Nothing here performs I/O.
 *
 * The api_secret is an input, never a stored value. Callers must keep it
 * on the server side and must never embed it in a client application.
 */

/** Builds the URL a user opens to log in and obtain a request_token. */
export function kiteLoginUrl(apiKey: string): string {
  requireNonEmpty("apiKey", apiKey);
  const url = new URL(KITE_LOGIN_URL);
  url.searchParams.set("v", KITE_API_VERSION);
  url.searchParams.set("api_key", apiKey);
  return url.toString();
}

/**
 * The checksum Kite requires when exchanging a request_token for an
 * access_token: SHA-256 hex of (api_key + request_token + api_secret).
 */
export function kiteChecksum(
  apiKey: string,
  requestToken: string,
  apiSecret: string,
): string {
  requireNonEmpty("apiKey", apiKey);
  requireNonEmpty("requestToken", requestToken);
  requireNonEmpty("apiSecret", apiSecret);
  return createHash("sha256")
    .update(apiKey + requestToken + apiSecret, "utf8")
    .digest("hex");
}

/** The Authorization header value for authenticated Kite requests. */
export function kiteAuthorizationHeader(
  apiKey: string,
  accessToken: string,
): string {
  requireNonEmpty("apiKey", apiKey);
  requireNonEmpty("accessToken", accessToken);
  return `token ${apiKey}:${accessToken}`;
}

function requireNonEmpty(name: string, value: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Kite session input "${name}" must be a non-empty string.`);
  }
}
