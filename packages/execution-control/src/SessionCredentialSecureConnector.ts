import type { ExecutionResult } from "@parmana/shared";

import type { Clock } from "./Clock.js";
import type { SessionCredentialVault } from "./SessionCredentialVault.js";

import type {
  ConnectorExecutor,
  ConnectorIdentity,
  ConnectorPolicy,
  ExecutionAuditSink,
  GatewayExecutionRequest,
  SecureConnector,
} from "./types.js";

export interface SessionCredentialSecureConnectorOptions {
  readonly identity: ConnectorIdentity;
  readonly capabilities: readonly string[];
  readonly policy: ConnectorPolicy;

  /**
   * Proves this connector was configured with material signed by the
   * Gateway's key at registration time. This is NOT proof that any
   * individual call originated from the Gateway: a value frozen once, at
   * construction, is reused for every execution this long-lived connector
   * instance will ever handle, so it cannot be bound to one specific
   * request without becoming unusable for every other request. The
   * request-bound check lives one level up, in
   * SessionCredentialExecutionControl, before a GatewaySession is ever
   * created. Replay protection at THIS layer comes from ConnectorPolicy's
   * single-use GatewaySession check (request-bound, existing,
   * unmodified), not from this value.
   */
  readonly gatewayAuthentication: unknown;

  readonly sessionCredentials: SessionCredentialVault;
  readonly executor: ConnectorExecutor;

  /**
   * Every execute() call records exactly one audit event — "execution.
   * completed" on success, "execution.rejected" (with reason) on any
   * failure — naming the connector, the session credential (id only,
   * never its value), the Gateway, the authorization it executed
   * under, and the capability (ExecutableContent.action) it executed.
   */
  readonly audit: ExecutionAuditSink;
  readonly clock: Clock;
}

/**
 * SecureConnector that resolves credentials through a
 * SessionCredentialVault instead of a raw CredentialVault: obtains a
 * single-use, time-bounded session credential per execution and destroys
 * it (revoke()) on every exit path — success, executor failure, or policy
 * rejection after issuance — via try/finally.
 */
export class SessionCredentialSecureConnector implements SecureConnector {
  readonly connectorId: string;
  readonly capabilities: readonly string[];
  readonly identity: ConnectorIdentity;

  constructor(
    private readonly options: SessionCredentialSecureConnectorOptions,
  ) {
    this.connectorId = options.identity.connectorId;
    this.identity = Object.freeze({
      ...options.identity,
      authenticationMetadata: Object.freeze({
        ...options.identity.authenticationMetadata,
      }),
    });
    this.capabilities = Object.freeze([...options.capabilities]);
  }

  async execute(request: GatewayExecutionRequest): Promise<ExecutionResult> {
    const authorizationId = request.authorization.payload.authorizationId;
    let sessionCredentialId: string | undefined;

    try {
      await this.options.policy.assertAllowed(
        request,
        this,
        this.options.gatewayAuthentication,
      );

      const sessionCredential = await this.options.sessionCredentials.issue(
        this.connectorId,
        authorizationId,
      );
      sessionCredentialId = sessionCredential.sessionCredentialId;

      let result: ExecutionResult;
      try {
        const credential =
          await this.options.sessionCredentials.consume(sessionCredentialId);
        result = await this.options.executor.execute(
          request.executableContent,
          credential,
          {
            authorization: request.authorization,
            approvals: request.approvals ?? [],
          },
        );
      } finally {
        await this.options.sessionCredentials.revoke(sessionCredentialId);
      }

      await this.options.audit.record({
        type: "execution.completed",
        occurredAt: this.options.clock.now().toISOString(),
        connectorId: this.connectorId,
        authorizationId,
        sessionId: request.gatewaySession.sessionId,
        credentialId: sessionCredentialId,
        gatewayId: request.gatewayIdentity.gatewayId,
        action: request.executableContent.action,
      });

      return result;
    } catch (error) {
      await this.options.audit.record({
        type: "execution.rejected",
        occurredAt: this.options.clock.now().toISOString(),
        connectorId: this.connectorId,
        authorizationId,
        sessionId: request.gatewaySession.sessionId,
        ...(sessionCredentialId === undefined
          ? {}
          : { credentialId: sessionCredentialId }),
        gatewayId: request.gatewayIdentity.gatewayId,
        action: request.executableContent.action,
        reason: error instanceof Error ? error.message : "Unknown rejection",
      });
      throw error;
    }
  }
}
