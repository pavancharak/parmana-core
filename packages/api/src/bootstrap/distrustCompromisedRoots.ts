import { X509Certificate } from "node:crypto";
import tls from "node:tls";

/**
 * Removes the compromised eMudhra root from the CA list every TLS client in
 * this process uses by default (`fetch`, `https`, the Postgres driver, the AWS
 * SDK), before any outbound connection is made.
 *
 * Why: in October 2026 eMudhra found that the keys of eight intermediate CAs
 * under its ECC root (emSign ECC Root CA - G3) were weak. The intermediates
 * were revoked, and the root programs distrusted that root. eMudhra's
 * statement (5 November 2026) says the G1 root remains active, and that the
 * C1 and C3 removals from Mozilla are planned and unrelated to the incident.
 * So only the G3 root is listed here. Node's TLS stack checks no revocation,
 * so it trusts whatever roots its bundled store holds. The server removes the
 * listed root from that store itself, so a lagging Node release cannot leave
 * it trusted.
 *
 * Scope: this removes only the listed root, and only if the bundled store
 * holds it. Official Node builds checked so far do not bundle G3, so on those
 * builds this removes nothing and the startup check reports zero.
 *
 * Matched by SHA-256 fingerprint, so nothing else can be removed by mistake.
 */
export const DISTRUSTED_ROOT_FINGERPRINTS: readonly string[] = [
  // emSign ECC Root CA - G3: the root behind the eight revoked intermediates.
  // Matches the value in Mozilla's NSS bug 1515457; not yet checked against eMudhra's repository.
  "86:A1:EC:BA:08:9C:4A:8D:3B:BE:27:34:C6:12:BA:34:1D:81:3E:04:3C:F9:E8:A8:62:CD:5C:57:A3:6B:BE:6B",
];

/**
 * Returns `certificates` without the roots whose fingerprints are listed.
 * `fingerprints` defaults to the emSign list; tests pass another list to
 * exercise the removal on any Node build.
 */
export function withoutDistrustedRoots(
  certificates: readonly string[],
  fingerprints: readonly string[] = DISTRUSTED_ROOT_FINGERPRINTS,
): string[] {
  const distrusted = new Set(fingerprints);

  return certificates.filter((pem) => {
    try {
      return !distrusted.has(new X509Certificate(pem).fingerprint256);
    } catch {
      // Not ours to judge: keep what Node already accepted.
      return true;
    }
  });
}

/**
 * Checks the bundled store before the server starts, and reports how many
 * listed roots it holds.
 *
 * - An empty store means TLS itself is broken, so this throws.
 * - Zero listed roots is not an error. Some Node releases no longer bundle
 *   any of them (Node 24.22.2 bundles none). Then no distrusted root is
 *   trusted, so the distrust already holds. The count is logged so the
 *   state is visible in the startup line.
 */
export function assertListedRootIsBundled(
  bundled: readonly string[] = tls.getCACertificates("bundled"),
): { readonly matched: number } {
  if (bundled.length === 0) {
    throw new Error(
      `Node ${process.version} bundles no CA certificates; refusing to start.`,
    );
  }

  const listed = new Set(DISTRUSTED_ROOT_FINGERPRINTS);
  const matched = bundled.filter((pem) => {
    try {
      return listed.has(new X509Certificate(pem).fingerprint256);
    } catch {
      return false;
    }
  });

  return { matched: matched.length };
}

/**
 * Applies the removal to this process and reports what it did. Throws if
 * the Node version cannot set the default CA list (older than 22.19 / 24.5),
 * so a server never starts believing it is protected when it is not.
 */
export function distrustCompromisedRoots(): {
  readonly removed: number;
  readonly remaining: number;
} {
  if (
    typeof tls.getCACertificates !== "function" ||
    typeof tls.setDefaultCACertificates !== "function"
  ) {
    throw new Error(
      `Node ${process.version} cannot set the default CA certificates; use Node 24.5 or later.`,
    );
  }

  const current = tls.getCACertificates("default");
  const kept = withoutDistrustedRoots(current);

  if (kept.length !== current.length) {
    tls.setDefaultCACertificates(kept);
  }

  return { removed: current.length - kept.length, remaining: kept.length };
}
