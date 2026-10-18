import { randomUUID } from "node:crypto";

import type {
  ExecutionRelease,
  GatewayExecutionRequest,
  GatewaySession,
} from "./types.js";

import { bindingHash } from "./binding.js";

interface SessionRecord extends GatewaySession {
  readonly connectorId: string;
  readonly contentBinding: string;
  readonly authorizationBinding: string;
  used: boolean;
}

export class InMemoryGatewaySessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(private readonly issuanceAuthentication: unknown) {}

  create(
    release: ExecutionRelease,
    connectorId: string,
    lifetimeMs: number,
    issuanceAuthentication: unknown,
    now = new Date(),
  ): GatewaySession {
    if (issuanceAuthentication !== this.issuanceAuthentication) {
      throw new Error(
        "Gateway session issuance rejected unauthenticated caller.",
      );
    }

    const authorizationExpiry = Date.parse(
      release.authorization.payload.expiresAt,
    );

    const expiresAt = new Date(
      Math.min(now.getTime() + lifetimeMs, authorizationExpiry),
    );

    const record: SessionRecord = {
      sessionId: randomUUID(),

      createdAt: now.toISOString(),

      expiresAt: expiresAt.toISOString(),

      authorizationId: release.authorization.payload.authorizationId,

      connectorId,

      contentBinding: bindingHash(release.executableContent),

      authorizationBinding: bindingHash(release.authorization),

      used: false,
    };

    this.sessions.set(record.sessionId, record);

    return this.publicSession(record);
  }

  consume(
    request: GatewayExecutionRequest,
    connectorId: string,
    now = new Date(),
  ): boolean {
    const record = this.sessions.get(request.gatewaySession.sessionId);

    const valid =
      record !== undefined &&
      !record.used &&
      Date.parse(record.expiresAt) > now.getTime() &&
      record.connectorId === connectorId &&
      record.authorizationId ===
        request.authorization.payload.authorizationId &&
      record.contentBinding === bindingHash(request.executableContent) &&
      record.authorizationBinding === bindingHash(request.authorization) &&
      this.sameSession(record, request.gatewaySession);

    if (!valid || record === undefined) {
      return false;
    }

    record.used = true;

    return true;
  }

  private sameSession(a: GatewaySession, b: GatewaySession): boolean {
    return (
      a.sessionId === b.sessionId &&
      a.createdAt === b.createdAt &&
      a.expiresAt === b.expiresAt &&
      a.authorizationId === b.authorizationId
    );
  }

  private publicSession(record: SessionRecord): GatewaySession {
    return Object.freeze({
      sessionId: record.sessionId,

      createdAt: record.createdAt,

      expiresAt: record.expiresAt,

      authorizationId: record.authorizationId,
    });
  }
}
