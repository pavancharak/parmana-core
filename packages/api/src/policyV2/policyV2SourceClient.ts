import { policyV2 } from "@parmana/policy";

/**
 * The source client. A policy version 2 decision asks it for each sourced claim; it sends the query
 * to the source adapter and returns the adapter's answer unchanged. The decision service verifies
 * the answer (signature, query match, key, expiry, nonce). This client never reads or changes a value.
 *
 * Any failure throws. The decision then refuses with SOURCE_UNAVAILABLE, so one slow or broken source
 * cannot approve anything.
 */

export interface PolicyV2SourceClientOptions {
  /** The adapter's base URL. Must be https, except a loopback address for local tests. */
  readonly url: string;
  /** The bearer token the adapter checks. Never logged. */
  readonly token: string;
  /** How long one question may take. Default 3000 ms. */
  readonly timeoutMs?: number;
  /** The fetch to use. Defaults to the global fetch; tests pass their own. */
  readonly fetch?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 3000;

/** True for a loopback host, the only place plain http is allowed (local fixture adapters). */
function isLoopback(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host === "::1"
  );
}

/** Refuses a non-https adapter URL, so the bearer token never travels in clear text. */
export function assertSourceUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("The source adapter URL is not a valid URL.");
  }
  if (url.protocol === "https:") return url;
  if (url.protocol === "http:" && isLoopback(url.hostname)) return url;
  throw new Error(
    "The source adapter URL must use https. Plain http is allowed only for a loopback address in tests.",
  );
}

export function createPolicyV2SourceClient(
  options: PolicyV2SourceClientOptions,
): policyV2.decision.SourceClient {
  const base = assertSourceUrl(options.url).toString().replace(/\/+$/, "");
  if (options.token.trim() === "") {
    throw new Error("The source adapter token is empty.");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const send = options.fetch ?? fetch;
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${options.token}`,
  };

  return async (query) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await send(`${base}/answers`, {
        method: "POST",
        headers,
        body: JSON.stringify(query),
        signal: controller.signal,
      });
      if (!response.ok) {
        // The status only. The body may echo the query, and is not needed to refuse.
        throw new Error(`The source adapter answered HTTP ${response.status}.`);
      }
      return (await response.json()) as unknown;
    } finally {
      clearTimeout(timer);
    }
  };
}
