import type { Clock } from "./Clock.js";
import type { IdGenerator } from "./IdGenerator.js";
import type { CredentialVault, ExecutionCredential } from "./types.js";

/**
 * A single-use, time-bounded lease on an underlying ExecutionCredential.
 * Carries no secret material itself — the secret is only ever returned by
 * consume(), and only once.
 */
export interface SessionCredential {
  readonly sessionCredentialId: string;
  readonly connectorId: string;
  readonly authorizationId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface SessionCredentialVault {
  issue(
    connectorId: string,
    authorizationId: string,
  ): Promise<SessionCredential>;
  consume(sessionCredentialId: string): Promise<ExecutionCredential>;
  revoke(sessionCredentialId: string): Promise<void>;
}

interface SessionCredentialRecord {
  readonly sessionCredentialId: string;
  readonly connectorId: string;
  readonly authorizationId: string;
  readonly expiresAt: Date;
  used: boolean;
  revoked: boolean;
}

export interface InMemorySessionCredentialVaultOptions {
  readonly credentials: CredentialVault;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly lifetimeMs: number;
}

/**
 * Additive session layer over an existing CredentialVault. issue() only
 * confirms the underlying credential exists — it never resolves or stores
 * the secret. consume() is the only method that ever calls into the
 * wrapped CredentialVault for the actual value, resolving it fresh at the
 * moment of use. The underlying CredentialVault itself is never modified
 * and knows nothing about sessions.
 */
export class InMemorySessionCredentialVault implements SessionCredentialVault {
  private readonly sessions = new Map<string, SessionCredentialRecord>();

  constructor(private readonly options: InMemorySessionCredentialVaultOptions) {
    if (options.lifetimeMs <= 0) {
      throw new Error("Session credential lifetime must be positive.");
    }
  }

  async issue(
    connectorId: string,
    authorizationId: string,
  ): Promise<SessionCredential> {
    //
    // Fail fast if the connector has no underlying credential, but
    // discard the resolved value — issue() must not hold the secret.
    //
    await this.options.credentials.getCredential(connectorId);

    const issuedAt = this.options.clock.now();
    const expiresAt = new Date(issuedAt.getTime() + this.options.lifetimeMs);
    const sessionCredentialId = this.options.idGenerator.generate();

    this.sessions.set(sessionCredentialId, {
      sessionCredentialId,
      connectorId,
      authorizationId,
      expiresAt,
      used: false,
      revoked: false,
    });

    return Object.freeze({
      sessionCredentialId,
      connectorId,
      authorizationId,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  }

  async consume(sessionCredentialId: string): Promise<ExecutionCredential> {
    const record = this.sessions.get(sessionCredentialId);
    if (record === undefined) {
      throw new Error(`Unknown session credential: ${sessionCredentialId}.`);
    }
    if (record.revoked) {
      throw new Error(
        `Session credential has been revoked: ${sessionCredentialId}.`,
      );
    }
    if (record.used) {
      throw new Error(
        `Session credential has already been used: ${sessionCredentialId}.`,
      );
    }
    if (this.options.clock.now().getTime() >= record.expiresAt.getTime()) {
      throw new Error(
        `Session credential has expired: ${sessionCredentialId}.`,
      );
    }

    record.used = true;
    return this.options.credentials.getCredential(record.connectorId);
  }

  async revoke(sessionCredentialId: string): Promise<void> {
    const record = this.sessions.get(sessionCredentialId);
    if (record === undefined) {
      throw new Error(`Unknown session credential: ${sessionCredentialId}.`);
    }
    record.revoked = true;
  }
}
