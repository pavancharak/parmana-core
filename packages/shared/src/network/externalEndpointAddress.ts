import { promises as dns } from "node:dns";
import net from "node:net";

/**
 * Address checks for an external connector endpoint (ADR-0013,
 * Security: SSRF).
 *
 * Parmana makes an HTTPS request to a URL an operator entered, so the
 * URL is checked when it is registered and the address it resolves to
 * is checked again at every release: a DNS change cannot point a
 * registered endpoint inside Parmana's network.
 */

export const MAX_ENDPOINT_URL_LENGTH = 2048;

/**
 * Addresses Parmana never sends a release to: private, loopback, link
 * local, shared (carrier grade NAT), multicast, reserved and
 * documentation ranges, in IPv4 and IPv6.
 */
const NON_PUBLIC = new net.BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  NON_PUBLIC.addSubnet(network, prefix, "ipv4");
}

// No rule for IPv4 mapped IPv6 (::ffff:0:0/96): BlockList already
// checks a mapped address against the IPv4 rules above, and a rule for
// the whole range would also match every plain IPv4 address.

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  NON_PUBLIC.addSubnet(network, prefix, "ipv6");
}

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

/**
 * Resolves a host name to every address it has. The default is the
 * system resolver; tests pass their own.
 */
export type EndpointAddressLookup = (
  hostname: string,
) => Promise<readonly ResolvedAddress[]>;

export const systemEndpointAddressLookup: EndpointAddressLookup = async (
  hostname,
) =>
  (await dns.lookup(hostname, { all: true, verbatim: true })).map(
    ({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }),
  );

export type EndpointUrlCheck =
  | { readonly ok: true; readonly url: URL }
  | { readonly ok: false; readonly reason: string };

/**
 * The checks that need no network: an absolute https URL with a host
 * name (not an IP literal, not localhost, at least one dot), no user
 * name or password, no fragment. On success, url.href is the form to
 * store: it is the audience of every release to this endpoint.
 */
export function checkEndpointUrl(value: unknown): EndpointUrlCheck {
  if (typeof value !== "string" || value.length > MAX_ENDPOINT_URL_LENGTH) {
    return {
      ok: false,
      reason: `endpointUrl must be a string of at most ${MAX_ENDPOINT_URL_LENGTH} characters.`,
    };
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "endpointUrl is not an absolute URL." };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "endpointUrl must use https." };
  }

  if (url.username !== "" || url.password !== "") {
    return {
      ok: false,
      reason: "endpointUrl must not carry a user name or password.",
    };
  }

  if (url.hash !== "") {
    return { ok: false, reason: "endpointUrl must not carry a fragment." };
  }

  const hostname = url.hostname.toLowerCase();

  if (hostname.startsWith("[") || net.isIP(hostname) !== 0) {
    return {
      ok: false,
      reason: "endpointUrl must name a host, not an IP address.",
    };
  }

  const bare = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;

  if (
    bare === "localhost" ||
    bare.endsWith(".localhost") ||
    !bare.includes(".")
  ) {
    return {
      ok: false,
      reason:
        "endpointUrl must name a public host with a domain, not localhost or a single label name.",
    };
  }

  return { ok: true, url };
}

export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);

  if (family === 0) {
    return false;
  }

  return !NON_PUBLIC.check(address, family === 6 ? "ipv6" : "ipv4");
}

export class ExternalEndpointAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalEndpointAddressError";
  }
}

/**
 * Resolves the endpoint's host and returns its addresses, or throws
 * ExternalEndpointAddressError when it does not resolve or when ANY
 * address it resolves to is not public. Refusing on any, not only the
 * first, is deliberate: the caller connects to one of the returned
 * addresses, never to the name again, so a second lookup cannot answer
 * differently.
 */
export async function resolvePublicEndpointAddresses(
  url: URL,
  lookup: EndpointAddressLookup = systemEndpointAddressLookup,
): Promise<readonly ResolvedAddress[]> {
  let addresses: readonly ResolvedAddress[];

  try {
    addresses = await lookup(url.hostname);
  } catch {
    throw new ExternalEndpointAddressError(
      `The endpoint host '${url.hostname}' does not resolve.`,
    );
  }

  if (addresses.length === 0) {
    throw new ExternalEndpointAddressError(
      `The endpoint host '${url.hostname}' does not resolve.`,
    );
  }

  const refused = addresses.filter(({ address }) => !isPublicAddress(address));

  if (refused.length > 0) {
    throw new ExternalEndpointAddressError(
      `The endpoint host '${url.hostname}' resolves to an address that is not public ` +
        `(${refused.map(({ address }) => address).join(", ")}).`,
    );
  }

  return addresses;
}
