import type { ExecutionResult } from "@parmana/shared";
import { CryptoBootstrap, ExecutableContentHasher } from "@parmana/crypto";

import type {
  AuthenticatedConnectorRequest,
  ConnectorCapabilities,
  ConnectorIdentity,
  ConnectorPolicy,
  CredentialReference,
  CredentialVault,
  CredentialedTarget,
  ExecutionAuditSink,
  GatewaySessionAuthority,
  SecureConnector,
} from "./types.js";

export interface DefaultSecureConnectorOptions {
  readonly identity: ConnectorIdentity;
  readonly capabilities: ConnectorCapabilities;
  readonly credential: CredentialReference;
  readonly sessions: GatewaySessionAuthority;
  readonly policy: ConnectorPolicy;
  readonly vault: CredentialVault;
  readonly target: CredentialedTarget;
  readonly audit: ExecutionAuditSink;
}

export class DefaultSecureConnector implements SecureConnector {
  readonly identity: ConnectorIdentity;
  readonly capabilities: ConnectorCapabilities;
  private readonly contentHasher = new ExecutableContentHasher(
    CryptoBootstrap.create(),
  );

  constructor(private readonly options: DefaultSecureConnectorOptions) {
    this.identity = Object.freeze({ ...options.identity });
    this.capabilities = Object.freeze({
      actions: Object.freeze([...options.capabilities.actions]),
      targetPrefixes: Object.freeze([...options.capabilities.targetPrefixes]),
    });
  }

  async invoke(
    request: AuthenticatedConnectorRequest,
  ): Promise<ExecutionResult> {
    const baseRequest = { ...request };
    const actualHash = await this.contentHasher.hash(request.transaction);
    const contentBound =
      actualHash === request.session.contentHash &&
      actualHash === request.authorization.payload.businessTransactionHash;
    const authenticated =
      contentBound &&
      (await this.options.sessions.verifyAndConsume(
        request.session,
        baseRequest,
        this.identity,
      ));
    const allowed =
      authenticated &&
      this.options.policy.allows(baseRequest, this.identity, this.capabilities);
    if (!allowed) {
      await this.audit(
        request,
        "execution.rejected",
        authenticated ? "capability_denied" : "gateway_authentication_failed",
      );
      throw new Error("Secure Connector rejected request.");
    }

    const lease = await this.options.vault.acquire(this.options.credential);
    await this.audit(request, "credential.acquired");
    try {
      const result = await this.options.target.execute(
        request.transaction,
        lease.handle,
      );
      await this.audit(
        request,
        "execution.completed",
        undefined,
        result.success,
      );
      return result;
    } finally {
      await lease.release();
    }
  }

  private audit(
    request: AuthenticatedConnectorRequest,
    type: "execution.rejected" | "credential.acquired" | "execution.completed",
    reason?: string,
    success?: boolean,
  ): Promise<void> {
    return this.options.audit.record({
      type,
      occurredAt: new Date().toISOString(),
      executionId: request.executionId,
      connectorId: request.connectorId,
      authorizationId: request.authorization.payload.authorizationId,
      sessionId: request.session.sessionId,
      ...(reason === undefined ? {} : { reason }),
      ...(success === undefined ? {} : { success }),
    });
  }
}
