const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Reads an optional connector base-URL override from the environment and
 * refuses any value that would send a connector's credential in clear
 * text or to a host the operator did not name in full.
 *
 * Overrides exist as test seams for hermetic mock servers, which run on
 * loopback. A production override must use https://, and an http:// value
 * is accepted only for loopback. Embedded credentials are refused.
 */
export function readConnectorBaseUrl(name: string): string | undefined {
  const raw = process.env[name];

  if (raw === undefined) {
    return undefined;
  }

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} is not a valid absolute URL.`);
  }

  if (url.username !== "" || url.password !== "") {
    throw new Error(`${name} must not contain credentials in the URL.`);
  }

  const loopback = LOOPBACK_HOSTS.has(url.hostname);

  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error(
      `${name} must use https:// (http:// is allowed only for localhost).`,
    );
  }

  return raw.replace(/\/+$/, "");
}
