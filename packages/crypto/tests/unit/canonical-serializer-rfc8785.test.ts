import { describe, expect, it } from "vitest";

import { CanonicalSerializer } from "../../src/CanonicalSerializer.js";

// Conformance vectors against RFC 8785 (JSON Canonicalization Scheme) for
// plain JSON values. The expected strings were produced by an independent
// RFC 8785 implementation (the Python `rfc8785` package), not by this
// serializer, so a regression here means the bytes diverged from the
// standard. Parmana's signed records are plain JSON after a round trip, so
// for these inputs a third-party RFC 8785 verifier computes the same bytes.
//
// Known differences that are NOT JSON and are deliberately out of scope:
// `undefined` values are dropped, and `Date` values become ISO strings.
// Both are pinned below so a change to either is noticed.

const serializer = new CanonicalSerializer();
const text = (value: unknown): string =>
  new TextDecoder().decode(serializer.serialize(value));

describe("CanonicalSerializer matches RFC 8785 for plain JSON", () => {
  it("sorts keys by UTF-16 code units, including non-ASCII keys", () => {
    expect(text({ b: 1, a: 2, ä: 3, "€": 4, "😀": 5, "～": 6 })).toBe(
      '{"a":2,"b":1,"ä":3,"€":4,"😀":5,"～":6}',
    );
  });

  it("serializes numbers with ECMAScript Number-to-string rules", () => {
    expect(
      text({
        n: [
          1e21, 1e-7, 0.1, -0, 5e-324, 1.7976931348623157e308, 0.000001, 100,
          1.5e300,
        ],
      }),
    ).toBe(
      '{"n":[1e+21,1e-7,0.1,0,5e-324,1.7976931348623157e+308,0.000001,100,1.5e+300]}',
    );
  });

  it("escapes control characters the same way", () => {
    expect(text({ s: '\u0000\u001f"\\/\b\f\n\r\t\u007f  ' })).toBe(
      '{"s":"\\u0000\\u001f\\"\\\\/\\b\\f\\n\\r\\t\u007f  "}',
    );
  });

  it("sorts nested objects and keeps array order", () => {
    expect(
      text({ nested: { z: [{ y: 1, x: 2 }], a: null, t: true, f: false } }),
    ).toBe('{"nested":{"a":null,"f":false,"t":true,"z":[{"x":2,"y":1}]}}');
  });
});

describe("documented non-JSON behaviour (pinned)", () => {
  it("drops undefined object values, as JSON.stringify does", () => {
    expect(text({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("serializes Date values as ISO strings", () => {
    expect(text({ at: new Date("2026-11-04T00:00:00.000Z") })).toBe(
      '{"at":"2026-11-04T00:00:00.000Z"}',
    );
  });
});
