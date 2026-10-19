import { describe, expect, it } from "vitest";

import type { ExecutionTrustRecord } from "@parmana/shared";

import { CanonicalSerializer } from "../../src/CanonicalSerializer.js";
import {
  canonicalExecutionTrustRecord,
  WHOLE_RECORD_EXCLUDED_FIELDS,
  wholeRecordCanonicalView,
} from "../../src/ExecutionTrustRecordCanonicalView.js";

const serializer = new CanonicalSerializer();

function bytesOf(value: unknown): string {
  return Buffer.from(serializer.serialize(value)).toString("utf8");
}

function sampleRecord(overrides: Record<string, unknown> = {}) {
  return {
    trustRecordId: "trust-1",
    businessTransactionId: "txn-1",
    transaction: { amount: 100 },
    authorization: { decision: "APPROVED" },
    overrides: [],
    executions: [],
    createdAt: "2026-10-19T00:00:00.000Z",
    trustRecordHash: "a".repeat(64),
    signature: { algorithm: "ed25519", keyId: "k", value: "x", signedAt: "t" },
    ...overrides,
  } as unknown as ExecutionTrustRecord;
}

describe("wholeRecordCanonicalView (schema version 3)", () => {
  it("covers a top-level field that the legacy view does not cover", () => {
    const withDecision = sampleRecord({ decision: "APPROVED" });
    const changed = sampleRecord({ decision: "REJECTED" });

    expect(bytesOf(wholeRecordCanonicalView(withDecision, 3))).not.toBe(
      bytesOf(wholeRecordCanonicalView(changed, 3)),
    );
    expect(bytesOf(canonicalExecutionTrustRecord(withDecision))).toBe(
      bytesOf(canonicalExecutionTrustRecord(changed)),
    );
  });

  it("does not cover the excluded fields", () => {
    const base = sampleRecord();
    const edited = sampleRecord({
      signature: {
        algorithm: "ed25519",
        keyId: "k",
        value: "y",
        signedAt: "u",
      },
      signatures: [{ algorithm: "dilithium3", keyId: "k2", signature: "z" }],
      verifications: [{ valid: true }],
      receipts: [{ id: "r1" }],
    });

    expect(bytesOf(wholeRecordCanonicalView(base, 3))).toBe(
      bytesOf(wholeRecordCanonicalView(edited, 3)),
    );
  });

  it("covers trustRecordHash", () => {
    expect(bytesOf(wholeRecordCanonicalView(sampleRecord(), 3))).not.toBe(
      bytesOf(
        wholeRecordCanonicalView(
          sampleRecord({ trustRecordHash: "b".repeat(64) }),
          3,
        ),
      ),
    );
  });

  it("binds the schema version", () => {
    expect(bytesOf(wholeRecordCanonicalView(sampleRecord(), 3))).not.toBe(
      bytesOf(wholeRecordCanonicalView(sampleRecord(), 2)),
    );
  });

  it("ignores a schemaVersion stored on the record, using the one passed in", () => {
    expect(
      bytesOf(wholeRecordCanonicalView(sampleRecord({ schemaVersion: 9 }), 3)),
    ).toBe(bytesOf(wholeRecordCanonicalView(sampleRecord(), 3)));
  });

  it("treats an absent field and a null field differently", () => {
    const absent = sampleRecord({ note: undefined });
    const nulled = sampleRecord({ note: null });

    expect(bytesOf(wholeRecordCanonicalView(absent, 3))).not.toBe(
      bytesOf(wholeRecordCanonicalView(nulled, 3)),
    );
  });

  it("keeps a field named __proto__ as ordinary covered data", () => {
    const record = JSON.parse(
      '{"trustRecordId":"t","__proto__":{"polluted":true},"createdAt":"c","trustRecordHash":"h"}',
    ) as ExecutionTrustRecord;
    const view = wholeRecordCanonicalView(record, 3);

    expect(Object.getPrototypeOf(view)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(view, "__proto__")).toBe(true);
  });

  it("lists exactly the excluded fields the ADR records", () => {
    expect([...WHOLE_RECORD_EXCLUDED_FIELDS].sort()).toEqual([
      "receipts",
      "schemaVersion",
      "signature",
      "signatures",
      "verifications",
    ]);
  });
});
