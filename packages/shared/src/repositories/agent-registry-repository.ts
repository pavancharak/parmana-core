/**
 * One outside agent registered with Parmana (RFC-0024, option 3).
 *
 * An agent authenticates with a client id and secret, and receives short-lived tokens.
 * Only the SHA-256 hash of the secret is stored. registeredBy and approvedBy must be two
 * different people: the same rule as connector registration, enforced again in the database.
 */
export interface AgentRecord {
  readonly agentId: string;
  readonly clientId: string;
  readonly clientSecretHash: string;
  /** The partner the agent acts for. Recorded on every inbound decision. */
  readonly partnerId: string;
  /** Capabilities the agent may propose. Unset means none. */
  readonly allowedCapabilities?: readonly string[];
  readonly allowedPrincipalIds?: readonly string[];
  readonly allowedTenantIds?: readonly string[];
  readonly registeredBy: string;
  readonly approvedBy: string;
  readonly registeredAt: Date;
  readonly revoked: boolean;
  readonly revokedAt?: Date;
  readonly revokedBy?: string;
  readonly revokeReason?: string;
}

export type NewAgentRecord = Omit<AgentRecord, "revoked" | "revokedAt" | "revokedBy" | "revokeReason">;

/**
 * Agent records. Read on every request by the token check, so a revocation takes effect
 * on the next request. Callers must treat a thrown error as a refusal.
 */
export interface AgentRegistryRepository {
  findByAgentId(agentId: string): Promise<AgentRecord | undefined>;
  findByClientId(clientId: string): Promise<AgentRecord | undefined>;

  /** Adds an agent. A repeated client id is refused by the store, not silently ignored. */
  register(agent: NewAgentRecord): Promise<void>;

  /** Revokes an agent. Revoking an agent already revoked changes nothing. */
  revoke(revocation: {
    readonly agentId: string;
    readonly revokedBy: string;
    readonly reason: string;
    readonly revokedAt: Date;
  }): Promise<void>;
}
