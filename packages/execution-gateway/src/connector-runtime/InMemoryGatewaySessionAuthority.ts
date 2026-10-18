import { randomUUID } from "node:crypto";

import type {
  ConnectorIdentity,
  GatewayExecutionRequest,
  GatewaySession,
  GatewaySessionAuthority,
} from "./types.js";

interface SessionRecord extends GatewaySession {
  consumed: boolean;
}

/** Reference authority for tests and single-process deployments. Production uses mTLS/workload identity. */
export class InMemoryGatewaySessionAuthority implements GatewaySessionAuthority {
  private readonly sessions = new Map<string, SessionRecord>();

  async open(request: GatewayExecutionRequest): Promise<GatewaySession> {
    const session: SessionRecord = {
      sessionId: randomUUID(),
      connectorId: request.connectorId,
      executionId: request.executionId,
      authorizationId: request.authorization.payload.authorizationId,
      contentHash: request.authorization.payload.businessTransactionHash,
      expiresAt: request.authorization.payload.expiresAt,
      consumed: false,
    };
    this.sessions.set(session.sessionId, session);
    return this.publicSession(session);
  }

  async verifyAndConsume(
    session: GatewaySession,
    request: GatewayExecutionRequest,
    identity: ConnectorIdentity,
  ): Promise<boolean> {
    const stored = this.sessions.get(session.sessionId);
    const valid =
      stored !== undefined &&
      !stored.consumed &&
      Date.parse(stored.expiresAt) > Date.now() &&
      stored.connectorId === identity.connectorId &&
      stored.connectorId === request.connectorId &&
      stored.executionId === request.executionId &&
      stored.authorizationId ===
        request.authorization.payload.authorizationId &&
      stored.contentHash ===
        request.authorization.payload.businessTransactionHash &&
      this.sameSession(stored, session);

    if (!valid || stored === undefined) return false;
    stored.consumed = true;
    return true;
  }

  private sameSession(a: GatewaySession, b: GatewaySession): boolean {
    return (
      a.sessionId === b.sessionId &&
      a.connectorId === b.connectorId &&
      a.executionId === b.executionId &&
      a.authorizationId === b.authorizationId &&
      a.contentHash === b.contentHash &&
      a.expiresAt === b.expiresAt
    );
  }

  private publicSession(session: SessionRecord): GatewaySession {
    return Object.freeze({
      sessionId: session.sessionId,
      connectorId: session.connectorId,
      executionId: session.executionId,
      authorizationId: session.authorizationId,
      contentHash: session.contentHash,
      expiresAt: session.expiresAt,
    });
  }
}
