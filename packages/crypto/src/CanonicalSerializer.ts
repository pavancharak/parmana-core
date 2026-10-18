/**
 * Canonical Serializer.
 *
 * Produces a deterministic byte representation of an
 * immutable object.
 *
 * Every cryptographic operation in Parmana MUST operate
 * on canonical serialized bytes produced by this class.
 *
 * This guarantees that hashing, signing, verification,
 * replay, and receipts all operate over identical data.
 */
export class CanonicalSerializer {
  /**
   * Serializes an object into canonical UTF-8 bytes.
   *
   * Objects are recursively normalized by sorting keys
   * lexicographically.
   */
  serialize(value: unknown): Uint8Array {
    const canonical = JSON.stringify(this.normalize(value));

    return new TextEncoder().encode(canonical);
  }

  /**
   * Recursively normalizes values.
   */
  private normalize(value: unknown): unknown {
    //
    // null
    //
    if (value === null) {
      return null;
    }

    //
    // primitives
    //
    if (typeof value !== "object") {
      return value;
    }

    //
    // arrays preserve order
    //
    if (Array.isArray(value)) {
      return value.map((item) => this.normalize(item));
    }

    //
    // Date
    //
    if (value instanceof Date) {
      return value.toISOString();
    }

    //
    // objects
    //
    const object = value as Record<string, unknown>;

    return Object.keys(object)
      .sort()
      .reduce<Record<string, unknown>>((normalized, key) => {
        //
        // Object.defineProperty, not normalized[key] = ...: a decoded
        // JSON object can carry a literal "__proto__" key, and plain
        // assignment sends that key to the prototype setter instead of
        // creating an own property, so it silently vanished from the
        // signed bytes. Its content was then not covered by the hash or
        // signature, and the output disagreed with the Python SDK and
        // @parmana/sign, which both keep it.
        //
        Object.defineProperty(normalized, key, {
          value: this.normalize(object[key]),
          enumerable: true,
          writable: true,
          configurable: true,
        });

        return normalized;
      }, {});
  }
}
