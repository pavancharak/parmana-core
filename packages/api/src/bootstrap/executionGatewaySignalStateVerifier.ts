import type {
  PolicySignals,
  SignalStateVerificationRequest,
  SignalStateVerifier,
  SignalStateViolation,
} from "@parmana/policy";

/**
 * Late-bound SignalStateVerifier for the Execution Gateway (G-31).
 *
 * createExecutionGateway() and createApplication() (application.ts) have a
 * real circular dependency: the Gateway needs a SignalStateVerifier at
 * construction time to wire its execution-boundary signal-freshness check,
 * but the concrete verifier (createHubSpotSignalStateVerifier) needs the
 * already-constructed Gateway (as its ExecutionSystem) to make its own
 * independent verification calls. This singleton breaks the cycle: the
 * Gateway is constructed against this fixed instance, and
 * createApplication() calls .bind() on it once the real composite verifier
 * exists — same "mint later, wire now" indirection already used for
 * mintGatewayAuthentication in createExecutionGateway.ts.
 *
 * Before bind() is ever called, findViolations() throws. An execution
 * that reaches the signal check during bootstrap is refused, not released
 * unchecked. Every other Gateway check is unaffected.
 */
export class LateBoundSignalStateVerifier implements SignalStateVerifier {
  private inner: SignalStateVerifier | undefined;

  bind(verifier: SignalStateVerifier): void {
    this.inner = verifier;
  }

  async findViolations(
    request: SignalStateVerificationRequest,
    signals: PolicySignals,
  ): Promise<readonly SignalStateViolation[]> {
    if (this.inner === undefined) {
      //
      // Fail closed: until bind() runs, the real-world divergence check has
      // not been wired, so nothing can be released on it.
      //
      throw new Error(
        "Signal/State Verifier is not bound: refusing to check signals before bootstrap completes.",
      );
    }

    return this.inner.findViolations(request, signals);
  }
}

/**
 * The single instance shared between createExecutionGateway.ts (which
 * wires it in at construction) and application.ts's createApplication()
 * (which binds the real verifier once it exists).
 */
export const executionGatewaySignalStateVerifier =
  new LateBoundSignalStateVerifier();
