import type {
  ExecutableContent,
  ExecutionResult,
  SignedExecutionAuthorization,
} from "@parmana/shared";

import type { GatewayVerificationResult } from "../GatewayVerificationResult.js";

export interface ConnectorIdentity {
  readonly connectorId: string;
  readonly serviceIdentity: string;
}

export interface ConnectorCapabilities {
  readonly actions: readonly string[];
  readonly targetPrefixes: readonly string[];
}

export interface GatewaySession {
  readonly sessionId: string;
  readonly connectorId: string;
  readonly executionId: string;
  readonly authorizationId: string;
  readonly contentHash: string;
  readonly expiresAt: string;
}

export interface GatewayExecutionRequest {
  readonly executionId: string;
  readonly connectorId: string;
  readonly transaction: Readonly<ExecutableContent>;
  readonly authorization: SignedExecutionAuthorization;
  readonly verification: GatewayVerificationResult;
}

export interface AuthenticatedConnectorRequest extends GatewayExecutionRequest {
  readonly session: GatewaySession;
}

export interface GatewaySessionAuthority {
  open(request: GatewayExecutionRequest): Promise<GatewaySession>;
  verifyAndConsume(
    session: GatewaySession,
    request: GatewayExecutionRequest,
    identity: ConnectorIdentity,
  ): Promise<boolean>;
}

export interface ConnectorPolicy {
  allows(
    request: GatewayExecutionRequest,
    identity: ConnectorIdentity,
    capabilities: ConnectorCapabilities,
  ): boolean;
}

export interface CredentialReference {
  readonly connectorId: string;
  readonly name: string;
}

/** An opaque lease. Its value is available only inside the connector process. */
export interface CredentialLease {
  readonly handle: unknown;
  release(): Promise<void>;
}

export interface CredentialVault {
  acquire(reference: CredentialReference): Promise<CredentialLease>;
}

export interface CredentialedTarget {
  execute(
    transaction: Readonly<ExecutableContent>,
    credentialHandle: unknown,
  ): Promise<ExecutionResult>;
}

export interface SecureConnector {
  readonly identity: ConnectorIdentity;
  readonly capabilities: ConnectorCapabilities;
  invoke(request: AuthenticatedConnectorRequest): Promise<ExecutionResult>;
}

export interface ExecutionChannel {
  release(
    request: GatewayExecutionRequest,
    gatewayIdentity: unknown,
  ): Promise<ExecutionResult>;
}

export interface GatewayIdentityProvider {
  present(): unknown;
}

export type ExecutionAuditEventType =
  | "session.opened"
  | "execution.rejected"
  | "credential.acquired"
  | "execution.completed";

export interface ExecutionAuditEvent {
  readonly type: ExecutionAuditEventType;
  readonly occurredAt: string;
  readonly executionId: string;
  readonly connectorId: string;
  readonly authorizationId: string;
  readonly sessionId?: string;
  readonly reason?: string;
  readonly success?: boolean;
}

export interface ExecutionAuditSink {
  record(event: ExecutionAuditEvent): Promise<void>;
}
