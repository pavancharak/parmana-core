import { TrustChainValidationError } from "./trust-chain-validation-error.js";

export class IntentRequiredError extends TrustChainValidationError {
  constructor() {
    super("INTENT_REQUIRED", "Intent is required before execution.");
  }
}
