import { readFileSync } from "node:fs";
import path from "node:path";
import { verify as edVerify } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  CryptoBootstrap,
  CanonicalSerializer,
  commitmentMessage,
  requiresCommitment,
} from "@parmana/crypto";
import { describe, expect, it } from "vitest";

import {
  buildConformanceVectors,
  serializeVectors,
  VECTORS_FILE,
  type ConformanceVectors,
} from "./build-vectors.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const committed = readFileSync(path.join(root, VECTORS_FILE), "utf8");

describe("conformance vectors (RFC-0033, Phase 1)", () => {
  it("the committed file is byte-identical to a fresh build from parmana-core's signing code", async () => {
    const fresh = serializeVectors(
      await buildConformanceVectors(CryptoBootstrap.create()),
    );

    // If this fails, run: npx tsx scripts/generate-conformance-vectors.ts, and commit the result with the change.
    expect(fresh).toBe(committed);
  });

  it("every vector's canonical bytes match its input, and its signature verifies with the published test key", async () => {
    const vectors = JSON.parse(committed) as ConformanceVectors;
    const serializer = new CanonicalSerializer();
    const publicKey = (await import("node:crypto")).createPublicKey(
      vectors.signer.publicKeyPem,
    );

    for (const vector of vectors.vectors) {
      const canonical = Buffer.from(serializer.serialize(vector.input));
      expect(
        Buffer.from(vector.canonical, "base64").equals(canonical),
        vector.name,
      ).toBe(true);

      const message = vector.commitment
        ? commitmentMessage(canonical)
        : canonical;
      expect(
        edVerify(
          null,
          Buffer.from(message),
          publicKey,
          Buffer.from(vector.signature.value, "base64"),
        ),
        vector.name,
      ).toBe(true);
    }
  });

  it("the large release is over the KMS raw limit, so it is signed as a commitment", () => {
    const vectors = JSON.parse(committed) as ConformanceVectors;
    const large = vectors.vectors.find(
      (v) => v.name === "release-large-commitment",
    );
    expect(large).toBeDefined();
    expect(large!.commitment).toBe(true);
    expect(
      requiresCommitment(
        Buffer.from(new CanonicalSerializer().serialize(large!.input)),
      ),
    ).toBe(true);
  });

  it("the key is marked as a test key", () => {
    const vectors = JSON.parse(committed) as ConformanceVectors;
    expect(vectors.signer.testKey).toBe(true);
    expect(vectors.coreVersion).toBe("5.0.0");
  });
});
