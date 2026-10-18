import { PolicyChangeStepUpVerifier } from "../auth/PolicyChangeStepUpVerifier.js";
import { createPolicyChangeStepUpNonceStore } from "./createPolicyChangeStepUpNonceStore.js";

/**
 * Creates the PolicyChangeStepUpVerifier used by
 * pending-policy-changes.ts's approve/reject handlers (Policy
 * Governance, maker-checker, Layer 4). Thin composition of
 * createPolicyChangeStepUpNonceStore.ts with the verifier class --
 * mirrors createCallerAuthenticator.ts's own "bootstrap function
 * bundles construction, server.ts calls it once" pattern.
 */
export function createPolicyChangeStepUpVerifier(): PolicyChangeStepUpVerifier {
  return new PolicyChangeStepUpVerifier({
    nonceStore: createPolicyChangeStepUpNonceStore(),
  });
}
