import type { ExecutionResult } from "@parmana/shared";

import type { RequestBoundConnectorAuthenticator } from "./SignedTokenConnectorAuthenticator.js";

import type {
  ExecutionControl,
  ExecutionRelease,
  GatewayIdentity,
} from "./types.js";

export interface SessionCredentialExecutionControlOptions {
  readonly gatewayIdentity: GatewayIdentity;
  readonly authenticator: RequestBoundConnectorAuthenticator;
  readonly inner: ExecutionControl;
}

/**
 * Wraps an existing ExecutionControl (typically ExecutionControlService,
 * unmodified) with a request-bound Gateway attestation check that runs
 * before any GatewaySession is created. ExecutionControlService.execute()
 * is the sole caller of InMemoryGatewaySessionStore.create() in this
 * package (verified by inspection, not enforced by a lock), so gating
 * entry here — ahead of that call — is what makes "no session without a
 * matching attestation" hold, provided this wrapper is the path actually
 * wired into production rather than ExecutionControlService being
 * constructed and called directly.
 */
export class SessionCredentialExecutionControl implements ExecutionControl {
  constructor(
    private readonly options: SessionCredentialExecutionControlOptions,
  ) {}

  async execute(
    release: ExecutionRelease,
    gatewayAuthentication: unknown,
  ): Promise<ExecutionResult> {
    if (
      !this.options.authenticator.authenticateGatewayForRequest(
        this.options.gatewayIdentity,
        gatewayAuthentication,
        release.authorization.payload.authorizationId,
      )
    ) {
      throw new Error(
        "Execution Control rejected a Gateway attestation that does not match this request.",
      );
    }

    return this.options.inner.execute(release, gatewayAuthentication);
  }
}
