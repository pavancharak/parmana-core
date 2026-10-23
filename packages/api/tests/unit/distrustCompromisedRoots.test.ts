import { X509Certificate } from "node:crypto";
import tls from "node:tls";

import { describe, expect, it } from "vitest";

import {
  DISTRUSTED_ROOT_FINGERPRINTS,
  distrustCompromisedRoots,
  withoutDistrustedRoots,
} from "../../src/bootstrap/distrustCompromisedRoots.js";

const fingerprint = (pem: string) => new X509Certificate(pem).fingerprint256;
const subject = (pem: string) => new X509Certificate(pem).subject;

describe("distrustCompromisedRoots", () => {
  it("names only emSign roots, and each one Node bundles is found", () => {
    const bundled = tls.getCACertificates("bundled");
    const matched = bundled.filter((pem) =>
      DISTRUSTED_ROOT_FINGERPRINTS.includes(fingerprint(pem)),
    );

    // Node 24.22.1 and later bundle three of the four (Mozilla removed G3).
    expect(matched.length).toBeGreaterThanOrEqual(3);
    for (const pem of matched) {
      expect(subject(pem)).toContain("OU=emSign PKI");
    }
  });

  it("removes exactly the distrusted roots and keeps every other one", () => {
    const bundled = tls.getCACertificates("bundled");
    const kept = withoutDistrustedRoots(bundled);
    const removed = bundled.filter((pem) => !kept.includes(pem));

    expect(removed.length).toBeGreaterThanOrEqual(3);
    for (const pem of removed) {
      expect(DISTRUSTED_ROOT_FINGERPRINTS).toContain(fingerprint(pem));
    }
    for (const pem of kept) {
      expect(DISTRUSTED_ROOT_FINGERPRINTS).not.toContain(fingerprint(pem));
    }
  });

  it("leaves no distrusted root in the process default, and is idempotent", () => {
    // Start from Node's bundled list, as a deployed server does; a host
    // whose default list comes from elsewhere would make this vary.
    tls.setDefaultCACertificates(tls.getCACertificates("bundled"));

    const first = distrustCompromisedRoots();
    const second = distrustCompromisedRoots();

    expect(first.removed).toBeGreaterThanOrEqual(3);
    expect(second.removed).toBe(0);
    for (const pem of tls.getCACertificates("default")) {
      expect(DISTRUSTED_ROOT_FINGERPRINTS).not.toContain(fingerprint(pem));
    }
  });
});
