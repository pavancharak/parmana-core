import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AGENT_TOKEN_MAX_LIFETIME_S,
  AgentTokenAuthenticator,
  issueAgentToken,
  type AgentRecord,
  type AgentRegistry,
} from "../../../src/auth/AgentTokenAuthenticator.js";
import { hashApiKey } from "../../../src/auth/hashApiKey.js";

const AUDIENCE = "https://parmana.example/api";
const SECRET = "agent-secret-value-0123456789";
const NOW = new Date("2026-11-08T10:00:00Z");

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const other = generateKeyPairSync("ed25519");

function registry(records: AgentRecord[], failures = false): AgentRegistry {
  const find = (pick: (r: AgentRecord) => boolean) => async () => {
    if (failures) throw new Error("store unavailable");
    return records.find(pick);
  };
  return {
    findByAgentId: (agentId) => find((r) => r.agentId === agentId)(),
    findByClientId: (clientId) => find((r) => r.clientId === clientId)(),
  };
}

const AGENT: AgentRecord = {
  agentId: "agt_billing_partner_1",
  clientId: "client-billing-partner-1",
  clientSecretHash: hashApiKey(SECRET),
  allowedCapabilities: ["refund:create"],
  revoked: false,
};

function options(records: AgentRecord[] = [AGENT], extra: Partial<Parameters<typeof issueAgentToken>[1]> = {}) {
  return {
    signingKey: privateKey,
    verifyingKey: publicKey,
    audience: AUDIENCE,
    registry: registry(records),
    now: () => NOW,
    ...extra,
  };
}

async function tokenFor(opts = options()) {
  const issued = await issueAgentToken({ clientId: AGENT.clientId, clientSecret: SECRET }, opts);
  if (issued === undefined) throw new Error("expected a token");
  return issued.accessToken;
}

/** Re-signs a payload with a given key, so a test can make one specific field wrong. */
function forge(payload: Record<string, unknown>, key = privateKey): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(null, Buffer.from(body, "utf8"), key).toString("base64url");
  return `${body}.${signature}`;
}

const VALID_PAYLOAD = {
  iss: "parmana",
  sub: AGENT.agentId,
  aud: AUDIENCE,
  iat: Math.floor(NOW.getTime() / 1000),
  exp: Math.floor(NOW.getTime() / 1000) + 600,
  jti: "jti-1",
};

describe("AgentTokenAuthenticator", () => {
  it("accepts a token issued to a registered agent, as that agent", async () => {
    const opts = options();
    const identity = await new AgentTokenAuthenticator(opts).authenticate(await tokenFor(opts));

    expect(identity).toEqual({
      callerId: AGENT.agentId,
      allowedCapabilities: ["refund:create"],
    });
    expect(identity?.credentialHolderType).toBeUndefined();
  });

  it("refuses a request with no credential", async () => {
    expect(await new AgentTokenAuthenticator(options()).authenticate(undefined)).toBeUndefined();
  });

  it("refuses a token whose payload was changed after signing", async () => {
    const token = await tokenFor();
    const [body, sig] = token.split(".") as [string, string];
    const altered = Buffer.from(JSON.stringify({ ...VALID_PAYLOAD, sub: "agt_someone_else" }), "utf8").toString("base64url");
    expect(altered).not.toBe(body);
    expect(await new AgentTokenAuthenticator(options()).authenticate(`${altered}.${sig}`)).toBeUndefined();
  });

  it("refuses a token signed by a different key", async () => {
    const forged = forge(VALID_PAYLOAD, other.privateKey);
    expect(await new AgentTokenAuthenticator(options()).authenticate(forged)).toBeUndefined();
  });

  it("refuses a token issued for a different audience", async () => {
    const forged = forge({ ...VALID_PAYLOAD, aud: "https://another.example/api" });
    expect(await new AgentTokenAuthenticator(options()).authenticate(forged)).toBeUndefined();
  });

  it("refuses an expired token", async () => {
    const forged = forge({ ...VALID_PAYLOAD, iat: VALID_PAYLOAD.iat - 900, exp: VALID_PAYLOAD.iat - 300 });
    expect(await new AgentTokenAuthenticator(options()).authenticate(forged)).toBeUndefined();
  });

  it("refuses a token whose lifetime is longer than the limit", async () => {
    const forged = forge({ ...VALID_PAYLOAD, exp: VALID_PAYLOAD.iat + AGENT_TOKEN_MAX_LIFETIME_S + 60 });
    expect(await new AgentTokenAuthenticator(options()).authenticate(forged)).toBeUndefined();
  });

  it("refuses a token for an agent revoked after it was issued, even while the token is unexpired", async () => {
    const opts = options();
    const token = await tokenFor(opts);
    const revoked = { ...AGENT, revoked: true };
    const after = new AgentTokenAuthenticator({ ...opts, registry: registry([revoked]) });

    expect(await after.authenticate(token)).toBeUndefined();
  });

  it("refuses a token whose agent is not in the registry", async () => {
    const token = await tokenFor();
    expect(await new AgentTokenAuthenticator(options([])).authenticate(token)).toBeUndefined();
  });

  it("fails closed when the agent registry cannot be read", async () => {
    const token = await tokenFor();
    const opts = options([], { registry: registry([AGENT], true) });
    expect(await new AgentTokenAuthenticator(opts).authenticate(token)).toBeUndefined();
  });

  it("refuses a malformed token without throwing", async () => {
    const authenticator = new AgentTokenAuthenticator(options());
    for (const bad of ["", "abc", "a.b.c", "!!!.!!!", "eyJ.notasig"]) {
      expect(await authenticator.authenticate(bad)).toBeUndefined();
    }
  });
});

describe("issueAgentToken", () => {
  it("issues a Bearer token that expires within the default lifetime", async () => {
    const issued = await issueAgentToken({ clientId: AGENT.clientId, clientSecret: SECRET }, options());
    expect(issued).toMatchObject({ tokenType: "Bearer", expiresIn: 600 });
  });

  it("refuses a wrong secret, an unknown client and a revoked agent with the same undefined answer", async () => {
    const opts = options();
    expect(await issueAgentToken({ clientId: AGENT.clientId, clientSecret: "wrong" }, opts)).toBeUndefined();
    expect(await issueAgentToken({ clientId: "nobody", clientSecret: SECRET }, opts)).toBeUndefined();
    const revokedOpts = options([{ ...AGENT, revoked: true }]);
    expect(await issueAgentToken({ clientId: AGENT.clientId, clientSecret: SECRET }, revokedOpts)).toBeUndefined();
  });

  it("refuses a lifetime longer than the limit", async () => {
    const issued = await issueAgentToken(
      { clientId: AGENT.clientId, clientSecret: SECRET, lifetimeS: AGENT_TOKEN_MAX_LIFETIME_S + 1 },
      options(),
    );
    expect(issued).toBeUndefined();
  });

  it("issues nothing when no signing key is configured, so a verify-only deployment cannot mint tokens", async () => {
    const issued = await issueAgentToken({ clientId: AGENT.clientId, clientSecret: SECRET }, options([AGENT], { signingKey: undefined }));
    expect(issued).toBeUndefined();
  });

  it("fails closed when the registry cannot be read during issuance", async () => {
    const issued = await issueAgentToken(
      { clientId: AGENT.clientId, clientSecret: SECRET },
      options([], { registry: registry([AGENT], true) }),
    );
    expect(issued).toBeUndefined();
  });
});
