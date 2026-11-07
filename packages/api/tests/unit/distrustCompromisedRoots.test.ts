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
const listed = (pem: string) =>
  DISTRUSTED_ROOT_FINGERPRINTS.includes(fingerprint(pem));

describe("distrustCompromisedRoots", () => {
  it("every listed root a Node build bundles is an emSign root", () => {
    // Which listed roots a build bundles varies by release (Node 24.22.2
    // bundles none), so this checks what is bundled, not a fixed count.
    const matched = tls.getCACertificates("bundled").filter(listed);

    for (const pem of matched) {
      expect(subject(pem)).toContain("OU=emSign PKI");
    }
  });

  it("removes exactly the roots on a list, on any Node build", () => {
    // A real bundled root, so the removal runs on every build. The emSign
    // list is not used here: its contents depend on the build.
    const bundled = tls.getCACertificates("bundled");
    const target = fingerprint(bundled[0]);

    const kept = withoutDistrustedRoots(bundled, [target]);

    expect(bundled.length - kept.length).toBe(1);
    expect(kept.map(fingerprint)).not.toContain(target);
  });

  it("leaves no listed root in the process default, and is idempotent", () => {
    // Start from Node's bundled list, as a deployed server does; a host
    // whose default list comes from elsewhere would make this vary.
    tls.setDefaultCACertificates(tls.getCACertificates("bundled"));

    const expected = tls.getCACertificates("bundled").filter(listed).length;

    const first = distrustCompromisedRoots();
    const second = distrustCompromisedRoots();

    expect(first.removed).toBe(expected);
    expect(second.removed).toBe(0);
    for (const pem of tls.getCACertificates("default")) {
      expect(DISTRUSTED_ROOT_FINGERPRINTS).not.toContain(fingerprint(pem));
    }
  });
});
