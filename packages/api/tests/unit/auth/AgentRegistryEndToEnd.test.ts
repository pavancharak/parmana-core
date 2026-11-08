import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { MemoryAgentRegistryRepository } from "@parmana/storage";

import {
  AgentTokenAuthenticator,
  issueAgentToken,
} from "../../../src/auth/AgentTokenAuthenticator.js";
import { hashApiKey } from "../../../src/auth/hashApiKey.js";

const AUDIENCE = "https://parmana.example/api";
const SECRET = "partner-agent-secret-0123456789";
const NOW = new Date("2026-11-08T10:00:00Z");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");

function newAgent(overrides: Partial<Parameters<MemoryAgentRegistryRepository["register"]>[0]> = {}) {
  return {
    agentId: "agt_refunds_1",
    clientId: "client-refunds-1",
    clientSecretHash: hashApiKey(SECRET),
    partnerId: "partner-acme",
    allowedCapabilities: ["refund:create"],
    registeredBy: "alice",
    approvedBy: "bob",
    registeredAt: NOW,
    ...overrides,
  };
}

function setup() {
  const registry = new MemoryAgentRegistryRepository();
  const options = { signingKey: privateKey, verifyingKey: publicKey, audience: AUDIENCE, registry, now: () => NOW };
  return { registry, options, authenticator: new AgentTokenAuthenticator(options) };
}

describe("agent registry, end to end", () => {
  it("refuses an agent approved by the person who registered it", async () => {
    const { registry } = setup();
    await expect(registry.register(newAgent({ approvedBy: "alice" }))).rejects.toThrow(/different person/);
  });

  it("refuses a second agent with the same client id", async () => {
    const { registry } = setup();
    await registry.register(newAgent());
    await expect(registry.register(newAgent({ agentId: "agt_other" }))).rejects.toThrow(/already registered/);
  });

  it("issues a token to a registered agent, and that token authenticates as the agent", async () => {
    const { options, authenticator, registry } = setup();
    await registry.register(newAgent());
    const issued = await issueAgentToken({ clientId: "client-refunds-1", clientSecret: SECRET }, options);
    expect(issued).toBeDefined();

    expect(await authenticator.authenticate(issued!.accessToken)).toMatchObject({
      callerId: "agt_refunds_1",
      allowedCapabilities: ["refund:create"],
    });
  });

  it("refuses the agent's existing token on the next request after revocation", async () => {
    const { options, authenticator, registry } = setup();
    await registry.register(newAgent());
    const issued = await issueAgentToken({ clientId: "client-refunds-1", clientSecret: SECRET }, options);
    expect(await authenticator.authenticate(issued!.accessToken)).toBeDefined();

    await registry.revoke({ agentId: "agt_refunds_1", revokedBy: "carol", reason: "partner left", revokedAt: NOW });

    expect(await authenticator.authenticate(issued!.accessToken)).toBeUndefined();
    expect(await issueAgentToken({ clientId: "client-refunds-1", clientSecret: SECRET }, options)).toBeUndefined();
  });

  it("revoking twice changes nothing and keeps the first reason", async () => {
    const { registry } = setup();
    await registry.register(newAgent());
    await registry.revoke({ agentId: "agt_refunds_1", revokedBy: "carol", reason: "first", revokedAt: NOW });
    await registry.revoke({ agentId: "agt_refunds_1", revokedBy: "dan", reason: "second", revokedAt: NOW });
    const agent = await registry.findByAgentId("agt_refunds_1");
    expect(agent).toMatchObject({ revoked: true, revokeReason: "first", revokedBy: "carol" });
  });
});
