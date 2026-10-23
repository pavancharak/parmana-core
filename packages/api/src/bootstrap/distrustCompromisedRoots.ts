import { X509Certificate } from "node:crypto";
import tls from "node:tls";

/**
 * Removes eMudhra's emSign root certificates from the CA list every TLS
 * client in this process uses by default (`fetch`, `https`, the Postgres
 * driver, the AWS SDK), before any outbound connection is made.
 *
 * Why: in October 2026 eight eMudhra intermediate CA keys were found to be
 * weak, so anyone who recovered them could issue certificates that chain to
 * these roots. Browsers blocked the intermediates; Node's TLS stack checks
 * no revocation, and only Node 22.23.4, 24.22.1 and 26.12.1 (21 October 2026)
 * reject them. The hosted runtime can lag behind those releases (Vercel
 * still ran 24.21.0 on 23 October), so the server removes the roots itself.
 *
 * Cost: a server whose certificate chains to an emSign root can no longer be
 * reached. None of the systems this server calls uses one.
 *
 * Matched by SHA-256 fingerprint, so nothing else can be removed by mistake.
 */
export const DISTRUSTED_ROOT_FINGERPRINTS: readonly string[] = [
  // emSign Root CA - G1
  "40:F6:AF:03:46:A9:9A:A1:CD:1D:55:5A:4E:9C:CE:62:C7:F9:63:46:03:EE:40:66:15:83:3D:C8:C8:D0:03:67",
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
