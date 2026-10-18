import type { ExecutionResult } from "@parmana/shared";

import { deepFreeze } from "./deepFreeze.js";
import { InMemoryGatewaySessionStore } from "./GatewaySessionStore.js";

import type {
  ConnectorAuthenticator,
  ConnectorRegistry,
  ExecutionAuditSink,
  ExecutionControl,
  ExecutionRelease,
  GatewayExecutionRequest,
  GatewayIdentity,
} from "./types.js";

/**
 * Re-verifies a release before any connector runs. Throws on failure.
 * Must not consume nonces: the gateway already consumes the nonce on the
 * normal path, and a second consumption would refuse every release.
 */
export type ReleaseVerifier = (release: ExecutionRelease) => Promise<void>;

export interface ExecutionControlServiceOptions {
  /**
   * Independent check of the authorization signature, expiry, decision
   * outcome and content hash. Required. Without it, a caller holding the
   * gateway attestation could release with caller-set verification flags.
   */
  readonly verifyRelease: ReleaseVerifier;
  readonly gatewayIdentity: GatewayIdentity;
  readonly authenticator: ConnectorAuthenticator;
  readonly registry: ConnectorRegistry;
  readonly sessions: InMemoryGatewaySessionStore;
  readonly sessionIssuanceAuthentication: unknown;
  readonly audit: ExecutionAuditSink;
  readonly sessionLifetimeMs?: number;
}

export class ExecutionControlService implements ExecutionControl {
  private readonly sessionLifetimeMs: number;

  constructor(private readonly options: ExecutionControlServiceOptions) {
    this.sessionLifetimeMs = options.sessionLifetimeMs ?? 30_000;

    if (this.sessionLifetimeMs <= 0) {
      throw new Error("Session lifetime must be positive.");
    }
  }

  async execute(
    release: ExecutionRelease,
    gatewayAuthentication: unknown,
  ): Promise<ExecutionResult> {
    //
    // Independent verification. verifiedTransaction below is a caller
    // assertion; this check is what makes it true.
    //
    await this.options.verifyRelease(release);

    //
    // Authenticate Gateway
    //

    if (
      !this.options.authenticator.authenticateGateway(
        this.options.gatewayIdentity,
        gatewayAuthentication,
      )
    ) {
      throw new Error("Execution Control rejected unauthenticated Gateway.");
    }

    //
    // Resolve connector from capability.
    //

    const connector = await this.options.registry.resolveCapability(
      release.executableContent.action,
    );

    //
    // Create one-time Gateway session.
    //

    const session = this.options.sessions.create(
      release,
      connector.connectorId,
      this.sessionLifetimeMs,
      this.options.sessionIssuanceAuthentication,
    );

    await this.options.audit.record({
      type: "session.created",
      occurredAt: new Date().toISOString(),
      connectorId: connector.connectorId,
      authorizationId: release.authorization.payload.authorizationId,
      sessionId: session.sessionId,
      action: release.executableContent.action,
      businessTransactionId: release.executableContent.businessTransactionId,
    });

    //
    // Immutable execution request.
    //

    const request: GatewayExecutionRequest = deepFreeze({
      authorization: release.authorization,
      executableContent: release.executableContent,
      verifiedTransaction: release.verifiedTransaction,
      executionTimestamp: release.executionTimestamp,
      gatewayIdentity: this.options.gatewayIdentity,
      gatewaySession: session,
      ...(release.approvals !== undefined
        ? { approvals: release.approvals }
        : {}),
    });

    try {
      const result = await connector.execute(request);

      await this.options.audit.record({
        type: "execution.completed",
        occurredAt: new Date().toISOString(),
        connectorId: connector.connectorId,
        authorizationId: release.authorization.payload.authorizationId,
        sessionId: session.sessionId,
        action: release.executableContent.action,
        businessTransactionId: release.executableContent.businessTransactionId,
      });

      return result;
    } catch (error) {
      await this.options.audit.record({
        type: "execution.rejected",
        occurredAt: new Date().toISOString(),
        connectorId: connector.connectorId,
        authorizationId: release.authorization.payload.authorizationId,
        sessionId: session.sessionId,
        action: release.executableContent.action,
        businessTransactionId: release.executableContent.businessTransactionId,
        reason: error instanceof Error ? error.message : "Unknown rejection",
      });

      throw error;
    }
  }
}
