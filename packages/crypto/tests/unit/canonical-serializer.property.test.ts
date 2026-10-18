import { generateKeyPairSync, sign, verify } from "node:crypto";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CanonicalSerializer } from "../../src/CanonicalSerializer.js";

// Property-based tests: fast-check generates thousands of random JSON
// values and checks properties every signed record depends on. Each hash
// and signature in Parmana is computed over CanonicalSerializer output, so
// a value that serializes two ways, or two values that serialize the same
// way, would break verification or let a change go undetected.

const serializer = new CanonicalSerializer();
const text = (value: unknown): string =>
  new TextDecoder().decode(serializer.serialize(value));

// Rebuilds every object with its keys in a random order, keeping the
// content the same. Uses defineProperty so a literal "__proto__" key stays
// an own property, as JSON.parse produces it.
function reorderKeys(
  value: unknown,
  order: (keys: string[]) => string[],
): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value))
    return value.map((item) => reorderKeys(item, order));
  const object = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of order(Object.keys(object))) {
    Object.defineProperty(result, key, {
      value: reorderKeys(object[key], order),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

const shuffled =
  (seed: number) =>
  (keys: string[]): string[] => {
    // Deterministic Fisher-Yates driven by the generated seed.
    const out = [...keys];
    let state = seed >>> 0 || 1;
    for (let i = out.length - 1; i > 0; i--) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const j = state % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

describe("CanonicalSerializer (property-based)", () => {
  it("is deterministic: the same value always gives the same bytes", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        expect(text(value)).toBe(text(value));
      }),
    );
  });

  it("does not depend on the order of object keys", () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.integer(), (value, seed) => {
        expect(text(reorderKeys(value, shuffled(seed)))).toBe(text(value));
      }),
    );
  });

  it("is a fixed point: re-serializing its own output changes nothing", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const once = text(value);
        expect(text(JSON.parse(once))).toBe(once);
      }),
    );
  });

  it("keeps the content: parsing the output gives back an equal value", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        // JSON has no -0; JSON.stringify writes it as 0, as the serializer does.
        expect(JSON.parse(text(value))).toEqual(
          JSON.parse(JSON.stringify(value)),
        );
      }),
    );
  });

  it("gives different bytes for different content", () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.jsonValue(), (a, b) => {
        const sameContent =
          JSON.stringify(JSON.parse(text(a))) ===
          JSON.stringify(JSON.parse(text(b)));
        expect(text(a) === text(b)).toBe(sameContent);
      }),
    );
  });

  it('keeps a literal "__proto__" key in the signed bytes', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (inner) => {
        const value = JSON.parse(
          `{"__proto__":${JSON.stringify(inner)}}`,
        ) as unknown;
        expect(text(value)).toBe(`{"__proto__":${text(inner)}}`);
      }),
    );
  });

  it("an Ed25519 signature over the bytes fails after any change to a value", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    fc.assert(
      fc.property(
        fc.dictionary(fc.string(), fc.jsonValue(), { minKeys: 1 }),
        fc.jsonValue(),
        (record, replacement) => {
          const key = Object.keys(record)[0];
          const original = serializer.serialize(record);
          const signature = sign(null, original, privateKey);
          expect(verify(null, original, publicKey, signature)).toBe(true);

          const changed = JSON.parse(JSON.stringify(record)) as Record<
            string,
            unknown
          >;
          Object.defineProperty(changed, key, {
            value: replacement,
            enumerable: true,
            writable: true,
            configurable: true,
          });
          const changedBytes = serializer.serialize(changed);
          const sameBytes = Buffer.from(changedBytes).equals(
            Buffer.from(original),
          );
          expect(verify(null, changedBytes, publicKey, signature)).toBe(
            sameBytes,
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
