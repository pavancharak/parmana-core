import { PolicyError } from "./PolicyError.js";

export class PolicyValidationError extends PolicyError {
  constructor(message: string) {
    super(message);

    this.name = "PolicyValidationError";
  }
}
