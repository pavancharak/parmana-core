import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { ExecutionIntent, ExecutionTrustRecord } from "@parmana/shared";

import {
  verifyExecutionIntentOffline,
  verifyExecutionTrustRecordOffline,
} from "../../src/OfflineVerifier.js";

/**
 * Fuzzing the offline verifier: an auditor may hand it anything. It
 * must answer valid: false with a reason, never throw and never say
 * valid for input that was not signed.
 */

const signatureLike = fc.record(
  {
    algorithm: fc.oneof(
      fc.constantFrom("ed25519", "dilithium3"),
      fc.jsonValue({ maxDepth: 0 }),
    ),
    keyId: fc.oneof(fc.constant("k"), fc.jsonValue({ maxDepth: 0 })),
    value: fc.oneof(
      fc.string({ unit: fc.constantFrom(..."ABCDabcd0123+/=") }),
      fc.jsonValue({ maxDepth: 0 }),
    ),
  },
  { requiredKeys: [] },
);

const recordLike = fc.oneof(
  fc.jsonValue({ maxDepth: 3 }),
  fc.record(
    {
      trustRecordHash: fc.oneof(
        fc.string({ unit: fc.constantFrom(..."0123456789abcdef") }),
        fc.jsonValue({ maxDepth: 0 }),
      ),
      intentHash: fc.oneof(
        fc.string({ unit: fc.constantFrom(..."0123456789abcdef") }),
        fc.jsonValue({ maxDepth: 0 }),
      ),
      signature: fc.oneof(signatureLike, fc.jsonValue({ maxDepth: 1 })),
      signatures: fc.oneof(
        fc.array(
          fc.record({
            algorithm: fc.constantFrom("ed25519", "dilithium3", "rsa"),
            keyId: fc.constant("k"),
            signature: fc.string({
              unit: fc.constantFrom(..."ABCDabcd0123+/="),
            }),
          }),
          { maxLength: 3 },
        ),
        fc.jsonValue({ maxDepth: 1 }),
      ),
      schemaVersion: fc.jsonValue({ maxDepth: 0 }),
      executions: fc.jsonValue({ maxDepth: 2 }),
    },
    { requiredKeys: [] },
  ),
);

const keys = fc.oneof(
  fc.constant({}),
  fc.dictionary(fc.constantFrom("k", "default"), fc.string()),
);

describe("offline verifier fuzzing", () => {
  it("never throws and never reports an unsigned record valid", async () => {
    await fc.assert(
      fc.asyncProperty(recordLike, keys, async (record, publicKeys) => {
        const result = await verifyExecutionTrustRecordOffline(
          record as unknown as ExecutionTrustRecord,
          publicKeys as Record<string, string>,
        );
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 500 },
    );
  });

  it("does the same for an Execution Intent", async () => {
    await fc.assert(
      fc.asyncProperty(recordLike, keys, async (intent, publicKeys) => {
        const result = await verifyExecutionIntentOffline(
          intent as unknown as ExecutionIntent,
          publicKeys as Record<string, string>,
        );
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 500 },
    );
  });
});
