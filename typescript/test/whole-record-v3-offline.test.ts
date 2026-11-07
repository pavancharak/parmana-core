import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { verifyExecutionTrustRecordOffline } from "../src/crypto/offline-verifier.js";

/**
 * The fixture under test/fixtures/server-signed-v3/ was written by
 * parmana-core's scripts/generate-whole-record-v3-fixture.ts, which signs with
 * the server's own signing code, not by hand.
 */
const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "server-signed-v3",
);

function load(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(dir, name), "utf8")) as Record<
    string,
    unknown
  >;
}

function publicKeys(): Record<string, string> {
  const trust = load("trust.json") as {
    keys: { keyId: string; publicKeyPem: string }[];
  };
  return Object.fromEntries(trust.keys.map((k) => [k.keyId, k.publicKeyPem]));
}

describe("schema version 3 hybrid records, verified offline in the TypeScript SDK", () => {
  it("verifies a server-signed v3 hybrid record with full coverage", () => {
    const result = verifyExecutionTrustRecordOffline(
      load("record.json"),
      publicKeys(),
    );

    expect(result.valid).toBe(true);
    expect(result.coverage).toBe("full");
    expect(result.hybridSignaturesValid).toBe(true);
    expect(new Set(result.algorithmsChecked)).toEqual(
      new Set(["dilithium3", "ed25519"]),
    );
  });

  it("rejects the same record once a field is added after signing", () => {
    const record = { ...load("record.json"), addedAfterSigning: "x" };
    const result = verifyExecutionTrustRecordOffline(record, publicKeys());

    expect(result.valid).toBe(false);
    expect(result.hybridSignaturesValid).toBe(false);
    expect(result.coverage).toBe("legacy");
  });

  it("rejects the record when a covered value changes", () => {
    const record = load("record.json") as {
      transaction: { signals: { amount: number } };
    };
    const changed = {
      ...record,
      transaction: { ...record.transaction, signals: { amount: 999 } },
    };
    const result = verifyExecutionTrustRecordOffline(changed, publicKeys());

    expect(result.valid).toBe(false);
  });
});
