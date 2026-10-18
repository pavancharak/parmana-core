import { RuntimeError } from "./RuntimeError.js";

export class VerificationFailedError extends RuntimeError {
  constructor(message: string) {
    super(message, 404, "VERIFICATION_FAILED");
  }
}
