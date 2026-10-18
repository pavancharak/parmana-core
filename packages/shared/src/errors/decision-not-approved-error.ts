import { TrustChainValidationError } from "./trust-chain-validation-error.js";

export class DecisionNotApprovedError extends TrustChainValidationError {
  constructor() {
    super(
      "DECISION_NOT_APPROVED",
      "Business Transaction was not approved for execution.",
    );
  }
}
