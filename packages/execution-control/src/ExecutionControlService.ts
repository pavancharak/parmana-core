import {
  NonceAlreadyConsumedError,
  type ExecutionResult,
} from "@parmana/shared";

import { markReleaseRefusal } from "./ReleaseRefusal.js";

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
 * Must not consume nonces. The single consumption on the release path is in
 * the release verifier (createReleaseVerifier), which runs once per release
 * when execution control is wired. The gateway skips its own consumption in
 * that case, so a second consumption here would refuse every release.
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

  /**
   * Gateway authentication, then connector lookup. Both run before the release
   * verifier, so a refusal here does not consume the nonce
   * (docs/internal/designs/RELEASE-CHECK-ORDER.md). Marked nonceConsumed false: the
   * Gateway deletes its in-flight row, so a corrected retry can be released.
   */
  private async authenticateAndResolve(
    release: ExecutionRelease,
    gatewayAuthentication: unknown,
  ) {
    try {
      if (
        !this.options.authenticator.authenticateGateway(
          this.options.gatewayIdentity,
          gatewayAuthentication,
        )
      ) {
        throw new Error("Execution Control rejected unauthenticated Gateway.");
      }

      return await this.options.registry.resolveCapability(
        release.executableContent.action,
      );
    } catch (error) {
      markReleaseRefusal(error, false);

      throw error;
    }
  }

  /**
   * The one-time session, its audit record and the immutable request. Runs after
   * the release verifier has consumed the nonce, so a failure here is marked
   * nonceConsumed true and the Gateway records it as failed.
   */
  private async openSession(
    release: ExecutionRelease,
    connector: { readonly connectorId: string },
  ) {
    try {
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

      return { request, session };
    } catch (error) {
      markReleaseRefusal(error, true);

      throw error;
    }
  }

  async execute(
    release: ExecutionRelease,
    gatewayAuthentication: unknown,
  ): Promise<ExecutionResult> {
    //
    // Order (docs/internal/designs/RELEASE-CHECK-ORDER.md): gateway authentication,
    // connector lookup, the release verifier (which consumes the nonce last), then
    // the session and the connector call. Refusals before the verifier leave the
    // nonce unused, so a corrected retry can be released.
    //
    const connector = await this.authenticateAndResolve(
      release,
      gatewayAuthentication,
    );

    try {
      await this.options.verifyRelease(release);
    } catch (error) {
      markReleaseRefusal(error, error instanceof NonceAlreadyConsumedError);

      throw error;
    }

    const { request, session } = await this.openSession(release, connector);

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
