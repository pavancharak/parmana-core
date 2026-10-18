import { RuntimeError } from "./RuntimeError.js";

/**
 * Thrown when a Business Transaction
 * violates structural or trust-chain invariants.
 */
export class BusinessTransactionValidationError extends RuntimeError {
  constructor(message: string) {
    super(message);

    this.name = "BusinessTransactionValidationError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
