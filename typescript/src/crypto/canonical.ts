/**
 * Canonical JSON, byte for byte the same as the server's
 * packages/crypto/src/CanonicalSerializer.ts and the Python SDK's
 * parmana/crypto/canonical.py: object keys sorted, no whitespace, non ASCII
 * characters written as they are, UTF-8.
 *
 * Input is already decoded JSON (a record from the API or a file). Every
 * timestamp in it is already the string the signer produced, so no Date
 * handling is needed here.
 */

function normalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  const object = value as Record<string, unknown>;

  return Object.keys(object)
    .sort()
    .reduce<Record<string, unknown>>((normalized, key) => {
      // defineProperty, not normalized[key] = ...: plain assignment sends a
      // literal "__proto__" key to the prototype setter, dropping it from
      // the output (and from what is signed). The server's
      // CanonicalSerializer, the Python SDK and @parmana/sign all keep it.
      Object.defineProperty(normalized, key, {
        value: normalize(object[key]),
        enumerable: true,
        writable: true,
        configurable: true,
      });
      return normalized;
    }, {});
}

/**
 * Returns the canonical UTF-8 bytes of a decoded JSON value.
 */
export function canonicalSerialize(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(normalize(value)));
}
