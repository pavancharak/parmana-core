/**
 * Represents a cryptographic key pair used for signing and verification.
 *
 * This is a simple immutable container for public and private key material.
 */
export class KeyPair {
  /**
   * Public key (used for verification).
   */
  public readonly publicKey: Uint8Array;

  /**
   * Private key (used for signing).
   */
  public readonly privateKey: Uint8Array;

  constructor(publicKey: Uint8Array, privateKey: Uint8Array) {
    if (!publicKey || publicKey.length === 0) {
      throw new Error("Public key cannot be empty.");
    }

    if (!privateKey || privateKey.length === 0) {
      throw new Error("Private key cannot be empty.");
    }

    this.publicKey = new Uint8Array(publicKey);
    this.privateKey = new Uint8Array(privateKey);

    Object.freeze(this);
  }

  /**
   * Returns a JSON-safe representation.
   * WARNING: does not expose private key in raw form.
   */
  public toJSON() {
    return {
      publicKey: Buffer.from(this.publicKey).toString("base64"),
      privateKey: "***REDACTED***",
    };
  }
}
