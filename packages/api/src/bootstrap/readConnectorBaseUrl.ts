const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Reads an optional connector base-URL override from the environment and
 * refuses any value that would send a connector's credential in clear
 * text or to a host the operator did not name in full.
 *
 * Overrides exist as test seams for hermetic mock servers, which run on
 * loopback. A production override must use https://. An http:// value is
 * accepted only for loopback and only when NODE_ENV is "test". Embedded
 * credentials are refused.
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

  const loopbackTestSeam =
    process.env.NODE_ENV === "test" && LOOPBACK_HOSTS.has(url.hostname);

  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && loopbackTestSeam)
  ) {
    throw new Error(
      `${name} must use https:// (http:// is allowed only for localhost in tests).`,
    );
  }

  return raw.replace(/\/+$/, "");
}
