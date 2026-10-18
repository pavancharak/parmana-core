import { describe, expect, it } from "vitest";

import { canonicalSerialize } from "../src/index.js";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("canonicalSerialize: literal __proto__ keys", () => {
  it("keeps a __proto__ key, matching the server and the Python SDK", () => {
    const value = JSON.parse('{"amount":100,"__proto__":{"admin":true}}');

    expect(decode(canonicalSerialize(value))).toBe(
      '{"__proto__":{"admin":true},"amount":100}',
    );
  });

  it("makes content under __proto__ part of what is signed", () => {
    const original = JSON.parse('{"__proto__":{"limit":10}}');
    const tampered = JSON.parse('{"__proto__":{"limit":99999}}');

    expect(decode(canonicalSerialize(original))).not.toBe(
      decode(canonicalSerialize(tampered)),
    );
  });
});
