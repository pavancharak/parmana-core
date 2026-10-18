import { describe, expect, it } from "vitest";

import { CanonicalSerializer } from "../../src/CanonicalSerializer.js";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("CanonicalSerializer: literal __proto__ keys", () => {
  const serializer = new CanonicalSerializer();

  it("keeps a top-level __proto__ key as ordinary content", () => {
    const value = JSON.parse('{"amount":100,"__proto__":{"admin":true}}');

    // Byte for byte what the Python SDK (json.dumps, sort_keys) and
    // @parmana/sign produce for the same input.
    expect(decode(serializer.serialize(value))).toBe(
      '{"__proto__":{"admin":true},"amount":100}',
    );
  });

  it("keeps a nested __proto__ key", () => {
    const value = JSON.parse('{"payload":{"__proto__":"x","b":1}}');

    expect(decode(serializer.serialize(value))).toBe(
      '{"payload":{"__proto__":"x","b":1}}',
    );
  });

  it("makes content under __proto__ part of what is signed", () => {
    const original = JSON.parse('{"__proto__":{"limit":10}}');
    const tampered = JSON.parse('{"__proto__":{"limit":99999}}');

    expect(decode(serializer.serialize(original))).not.toBe(
      decode(serializer.serialize(tampered)),
    );
  });

  it("does not change the prototype of the normalized output", () => {
    const value = JSON.parse('{"__proto__":{"polluted":true}}');

    const output = JSON.parse(decode(serializer.serialize(value)));

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(output)).toEqual(["__proto__"]);
  });
});
