import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown when a caller whose credential is not provisioned as a
 * verified human (see isHumanCaller.ts, ApiKeyEntry.credentialHolderType)
 * attempts one of the pending-policy-changes.ts endpoints.
 */
export class NonHumanCallerDeniedError extends ParmanaError {
  constructor() {
    super(
      "NON_HUMAN_CALLER_DENIED",
      "This action requires a caller credential provisioned as a verified human (credentialHolderType: USER).",
      403,
    );
  }
}
