import { PolicyError } from "./PolicyError.js";

export class SignalValidationError extends PolicyError {
  constructor(message: string) {
    super(message);

    this.name = "SignalValidationError";
  }
}
