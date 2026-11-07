import { X509Certificate } from "node:crypto";
import tls from "node:tls";

import { describe, expect, it } from "vitest";

import {
  DISTRUSTED_ROOT_FINGERPRINTS,
  assertListedRootIsBundled,
} from "../../src/bootstrap/distrustCompromisedRoots.js";

const listed = (pem: string) =>
  DISTRUSTED_ROOT_FINGERPRINTS.includes(
    new X509Certificate(pem).fingerprint256,
  );

describe("assertListedRootIsBundled", () => {
  it("refuses to start when the store holds none of the listed roots", () => {
    const unrelated = tls
      .getCACertificates("bundled")
      .filter((pem) => !listed(pem));

    expect(() => assertListedRootIsBundled(unrelated)).toThrow(
      /bundles none of the distrusted roots/,
    );
  });

  it("refuses an empty store", () => {
    expect(() => assertListedRootIsBundled([])).toThrow(/refusing to start/);
  });

  it("passes when the store holds a listed root", () => {
    const withListed = tls
      .getCACertificates("bundled")
      .filter((pem) => listed(pem));

    // Only the official builds bundle a listed root; skip where none is bundled.
    if (withListed.length === 0) return;

    expect(() => assertListedRootIsBundled(withListed)).not.toThrow();
  });
});
