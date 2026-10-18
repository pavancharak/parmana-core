/**
 * Base error for all cryptographic operations.
 *
 * All Crypto package exceptions should extend this class.
 */
export class CryptoError extends Error {
  /**
   * Creates a new CryptoError.
   *
   * @param message Error message.
   */
  constructor(message: string) {
    super(message);

    this.name = "CryptoError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
