import type {
  AgentRecord,
  AgentRegistryRepository,
  NewAgentRecord,
} from "@parmana/shared";

/**
 * In-memory agent registry with the same rules as the Postgres one: a client id is
 * unique, and a repeated revoke changes nothing. For tests and local runs only.
 */
export class MemoryAgentRegistryRepository implements AgentRegistryRepository {
  private readonly agents = new Map<string, AgentRecord>();

  async findByAgentId(agentId: string): Promise<AgentRecord | undefined> {
    return this.agents.get(agentId);
  }

  async findByClientId(clientId: string): Promise<AgentRecord | undefined> {
    for (const agent of this.agents.values()) {
      if (agent.clientId === clientId) return agent;
    }
    return undefined;
  }

  async register(agent: NewAgentRecord): Promise<void> {
    if (agent.registeredBy === agent.approvedBy) {
      throw new Error("an agent must be approved by a different person than the one who registered it");
    }
    if (this.agents.has(agent.agentId) || (await this.findByClientId(agent.clientId))) {
      throw new Error("agent or client id is already registered");
    }
    this.agents.set(agent.agentId, { ...agent, revoked: false });
  }

  async revoke(revocation: {
    readonly agentId: string;
    readonly revokedBy: string;
    readonly reason: string;
    readonly revokedAt: Date;
  }): Promise<void> {
    const agent = this.agents.get(revocation.agentId);
    if (agent === undefined || agent.revoked) return;
    this.agents.set(agent.agentId, {
      ...agent,
      revoked: true,
      revokedAt: revocation.revokedAt,
      revokedBy: revocation.revokedBy,
      revokeReason: revocation.reason,
    });
  }
}
