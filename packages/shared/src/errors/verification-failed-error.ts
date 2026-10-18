import { ParmanaError } from "./parmana-error.js";

export class VerificationFailedError extends ParmanaError {
  constructor(message = "Verification failed.") {
    super("VERIFICATION_FAILED", message, 409);
  }
}
