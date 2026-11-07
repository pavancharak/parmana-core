import { X509Certificate } from "node:crypto";
import tls from "node:tls";

/**
 * Removes eMudhra's emSign root certificates from the CA list every TLS
 * client in this process uses by default (`fetch`, `https`, the Postgres
 * driver, the AWS SDK), before any outbound connection is made.
 *
 * Why: in October 2026 eight eMudhra intermediate CA keys were found to be
 * weak, so anyone who recovered them could issue certificates that chain to
 * these roots. Node's TLS stack checks no revocation, so it trusts whatever
 * roots its bundled store holds. The server removes the listed roots from
 * that store itself, so a lagging Node release cannot leave them trusted.
 *
 * Scope: this removes only the roots in the bundled store. The official
 * Node 22.23.4, 24.22.1 and 26.12.1 binaries each bundle only
 * `emSign Root CA - G1` of the four listed roots, so on those builds the
 * other three are already absent and this removes just G1.
 *
 * Cost: a server whose certificate chains to an emSign root can no longer be
 * reached. None of the systems this server calls uses one.
 *
 * Matched by SHA-256 fingerprint, so nothing else can be removed by mistake.
 */
export const DISTRUSTED_ROOT_FINGERPRINTS: readonly string[] = [
  // emSign Root CA - G1
  "2D:3A:E8:32:79:75:47:C2:D4:43:06:14:1F:5E:A9:3D:4F:F7:0F:48:94:B5:65:F7:52:8D:64:74:24:C6:07:67",
  // emSign ECC Root CA - G3
  "86:A1:EC:BA:08:9C:4A:8D:3B:BE:27:34:C6:12:BA:34:1D:81:3E:04:3C:F9:E8:A8:62:CD:5C:57:A3:6B:BE:6B",
  // emSign Root CA - C1
  "12:56:09:AA:30:1D:A0:A2:49:B9:7A:82:39:CB:6A:34:21:6F:44:DC:AC:9F:39:54:B1:42:92:F2:E8:C8:60:8F",
  // emSign ECC Root CA - C3
  "BC:4D:80:9B:15:18:9D:78:DB:3E:1D:8C:F4:F9:72:6A:79:5D:A1:64:3C:A5:F1:35:8E:1D:DB:0E:DC:0D:7E:B3",
];

/** Returns `certificates` without the distrusted roots. */
export function withoutDistrustedRoots(
  certificates: readonly string[],
): string[] {
  const distrusted = new Set(DISTRUSTED_ROOT_FINGERPRINTS);

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
 * Refuses to start when none of the listed roots is in the bundled store.
 * Without a match the removal does nothing, so the server would run
 * believing it is protected when it is not. The official Node 24.22.1 and
 * 24.22.2 builds bundle `emSign Root CA - G1`, which is listed, so they pass.
 *
 * Trade-off: a future Node release that drops every listed root would also
 * refuse to start. That is deliberate: the operator should decide whether
 * the list still applies, not have the server run unchecked.
 */
export function assertListedRootIsBundled(
  bundled: readonly string[] = tls.getCACertificates("bundled"),
): void {
  const listed = new Set(DISTRUSTED_ROOT_FINGERPRINTS);
  const matched = bundled.filter((pem) => {
    try {
      return listed.has(new X509Certificate(pem).fingerprint256);
    } catch {
      return false;
    }
  });

  if (matched.length === 0) {
    throw new Error(
      `Node ${process.version} bundles none of the distrusted roots, so the distrust cannot take effect; refusing to start. Use an official Node release.`,
    );
  }
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
