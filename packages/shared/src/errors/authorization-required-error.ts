import { TrustChainValidationError } from "./trust-chain-validation-error.js";

export class AuthorizationRequiredError extends TrustChainValidationError {
  constructor() {
    super(
      "AUTHORIZATION_REQUIRED",
      "Authorization is required before execution.",
    );
  }
}
