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
  it("refuses an empty store, because TLS itself is then broken", () => {
    expect(() => assertListedRootIsBundled([])).toThrow(/refusing to start/);
  });

  it("accepts a store with none of the listed roots, and reports zero", () => {
    const unrelated = tls
      .getCACertificates("bundled")
      .filter((pem) => !listed(pem));

    expect(assertListedRootIsBundled(unrelated)).toEqual({ matched: 0 });
  });

  it("reports how many listed roots the store holds", () => {
    const bundled = tls.getCACertificates("bundled");
    const withListed = bundled.filter(listed);

    expect(assertListedRootIsBundled(bundled)).toEqual({
      matched: withListed.length,
    });
  });
});
