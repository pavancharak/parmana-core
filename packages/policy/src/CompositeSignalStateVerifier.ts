import type {
  SignalStateVerificationRequest,
  SignalStateVerifier,
  SignalStateViolation,
} from "./types/SignalStateVerifier.js";
import type { PolicySignals } from "./types/PolicySignals.js";

/**
 * Combines multiple capability-scoped SignalStateVerifiers into one.
 *
 * Each SignalStateVerifier implementation is expected to recognize only
 * the action(s) it knows how to independently verify and return an
 * empty array for anything else -- HubSpotSignalStateVerifier follows
 * this discipline. This composite
 * queries each in the order supplied and returns the first non-empty
 * result, so RuntimeEngine (which accepts exactly one
 * SignalStateVerifier) can be wired with as many capability-specific
 * verifiers as the production route needs.
 */
export class CompositeSignalStateVerifier implements SignalStateVerifier {
  constructor(private readonly verifiers: readonly SignalStateVerifier[]) {}

  async findViolations(
    request: SignalStateVerificationRequest,
    signals: PolicySignals,
  ): Promise<readonly SignalStateViolation[]> {
    for (const verifier of this.verifiers) {
      const violations = await verifier.findViolations(request, signals);
      if (violations.length > 0) {
        return violations;
      }
    }

    return [];
  }
}
