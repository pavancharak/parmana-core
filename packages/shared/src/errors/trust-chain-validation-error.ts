import { ValidationError } from "./validation-error.js";

export class TrustChainValidationError extends ValidationError {
  constructor(code: string, message: string) {
    super(code, message);
  }
}
