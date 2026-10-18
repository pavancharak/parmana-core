/**
 * Refuses a runtime endpoint that would send the caller's API key in clear
 * text or to a host the operator did not name in full.
 *
 * https:// is required. http:// is accepted only for loopback, which is the
 * local development case. Embedded credentials are refused, since a value
 * such as https://user:pass@host would otherwise be trusted as written.
 * The Python SDK applies the same rule (python/parmana/transport).
 */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function assertSafeEndpoint(endpoint: string): void {
  let url: URL;

  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("Runtime endpoint must be an absolute URL.");
  }

  if (url.username !== "" || url.password !== "") {
    throw new Error(
      "Runtime endpoint must not contain credentials in the URL.",
    );
  }

  const loopback = LOOPBACK_HOSTS.has(url.hostname);

  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error(
      "Runtime endpoint must use https:// (http:// is allowed only for localhost).",
    );
  }
}
