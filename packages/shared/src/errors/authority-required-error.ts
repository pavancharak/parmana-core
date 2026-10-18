import { TrustChainValidationError } from "./trust-chain-validation-error.js";

export class AuthorityRequiredError extends TrustChainValidationError {
  constructor() {
    super("AUTHORITY_REQUIRED", "Authority is required before execution.");
  }
}
