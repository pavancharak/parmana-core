/**
 * End to end, in-process: a policy version 2 decision reads a sourced invoice amount over HTTP from the
 * fixture adapter, through the real source client, and the decision function verifies the answer.
 *
 * This runs in the test environment, not in staging. It uses a test-only policy that reads one sourced
 * value (invoice.amount). The vendor claims need the owner's confirmed policy text before they are tested
 * this way.
 */
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
} from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { policyV2 } from "@parmana/policy";

import { createFixtureSourceServer } from "../../../../test-support/policy-v2-fixture-source.js";
import { createPolicyV2SourceClient } from "../../src/policyV2/policyV2SourceClient.js";

const NOW = new Date("2026-11-18T10:00:00.000Z");
const CAPABILITY = "erp:invoice-pay";
const TOKEN = "test-token-not-real";

/** Test key pair for the fixture source. Never a production key. */
const pair = generateKeyPairSync("ed25519");
const privateKey = createPrivateKey(
  pair.privateKey.export({ type: "pkcs8", format: "pem" }),
);
const publicKeyPem = pair.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const publicKey = createPublicKey(publicKeyPem);

const owner: policyV2.register.Person = {
  id: "action-owner-1",
  roles: ["action-owner"],
};
const second: policyV2.register.Person = {
  id: "second-1",
  roles: ["second-approver"],
};
const sourceOwner: policyV2.register.Person = {
  id: "src-owner",
  roles: ["source-owner"],
};
const parmana: policyV2.register.Person = {
  id: "parmana-1",
  roles: ["parmana-owner"],
};

function buildRegister(): policyV2.register.PolicyRegister {
  const register = new policyV2.register.PolicyRegister(() => NOW);
  register.proposeSource(
    {
      name: "accounts",
      dataOwner: "owner",
      signer: { kind: "system" },
      keyId: "fixture-key-1",
      publicKeyPem,
      claims: { "invoice.amount": "USD" },
      canApprove: false,
    },
    sourceOwner,
  );
  register.approveSource("accounts", second);
  register.registerAction(
    {
      capability: CAPABILITY,
      owner: "action-owner-1",
      successor: "action-owner-2",
      reviewers: ["r1", "r2", "r3"],
      review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
    },
    parmana,
  );
  const base = {
    action: CAPABILITY,
    owner: "action-owner-1",
    reason: "A reason.",
    evidence: "Evidence.",
    nextReview: "2027-05-01",
    highValue: false,
  };
  register.proposeThreshold(
    { ...base, name: "automaticLimit", value: 5000, unit: "USD" },
    owner,
  );
  register.approveThreshold(CAPABILITY, "automaticLimit", second);
  return register;
}

/** Test-only policy: an invoice at or under the automatic limit is approved; anything else is rejected. */
const policy = {
  policyId: "invoice-pay-test",
  policyVersion: "2.0.0",
  schemaVersion: "2.0.0",
  capability: CAPABILITY,
  description: "Test-only policy that reads one sourced invoice amount.",
  owner: "action-owner-1",
  signals: {
    invoiceAmount: {
      type: "number",
      provenance: "sourced",
      source: "accounts",
      claim: "invoice.amount",
      subject: "target",
      maxAgeSeconds: 60,
      unit: "USD",
    },
  },
  thresholds: {
    automaticLimit: {
      value: 5000,
      unit: "USD",
      owner: "action-owner-1",
      approvedBy: "second-1",
      reason: "A reason.",
      nextReview: "2027-05-01",
    },
  },
  review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
  rules: [
    {
      id: "tier1-automatic-payment",
      tier: "tier1",
      when: {
        fact: "invoiceAmount",
        operator: "lte",
        value: { threshold: "automaticLimit" },
      },
      outcome: { action: "approve", reason: "Automatic payment." },
    },
    {
      id: "reject-default",
      tier: "reject",
      when: { always: true },
      outcome: {
        action: "reject",
        reason: "Human approval or review is needed.",
      },
    },
  ],
};

const invoices = {
  "INV-100": { amount: 1200, vendorId: "V-7", vendorStatus: "active" as const },
  "INV-900": { amount: 9000, vendorId: "V-7", vendorStatus: "active" as const },
};

let server: Server | undefined;

async function startFixture(): Promise<string> {
  server = createFixtureSourceServer({
    source: "accounts",
    keyId: "fixture-key-1",
    privateKey,
    token: TOKEN,
    invoices,
    now: () => NOW,
  });
  await new Promise<void>((resolve) =>
    server!.listen(0, "127.0.0.1", () => resolve()),
  );
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  if (server !== undefined) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

function decide(target: string, sources: policyV2.decision.SourceClient) {
  const deps: policyV2.decision.DecisionDeps = {
    policies: (capability) =>
      capability === CAPABILITY ? { policy: policy as never } : undefined,
    register: buildRegister() as never,
    sources,
    nonces: new policyV2.sourceAnswer.MemoryNonceStore(() => NOW),
    approvals: async () => false,
    now: () => NOW,
  };
  return policyV2.decision.decide(
    {
      capability: CAPABILITY,
      transactionId: `txn-${target}`,
      target,
      parameters: {},
      signals: {},
    },
    deps,
  );
}

describe("policy version 2 source, end to end (test environment)", () => {
  it("approves an invoice under the limit, using a verified sourced amount from the adapter over HTTP", async () => {
    const baseUrl = await startFixture();
    const client = createPolicyV2SourceClient({
      url: baseUrl,
      token: TOKEN,
      timeoutMs: 2000,
    });

    const decision = await decide("INV-100", client);

    expect(decision.outcome).toBe("APPROVE");
    expect(decision.values["invoiceAmount"]).toMatchObject({
      value: 1200,
      provenance: "sourced",
    });
  });

  it("rejects an invoice over the limit, from the same verified amount", async () => {
    const baseUrl = await startFixture();
    const client = createPolicyV2SourceClient({
      url: baseUrl,
      token: TOKEN,
      timeoutMs: 2000,
    });

    const decision = await decide("INV-900", client);

    expect(decision.outcome).toBe("REJECT");
  });

  it("refuses with SOURCE_UNAVAILABLE when the adapter is not running", async () => {
    const client = createPolicyV2SourceClient({
      url: "http://127.0.0.1:1",
      token: TOKEN,
      timeoutMs: 500,
    });

    const decision = await decide("INV-100", client);

    expect(decision.outcome).toBe("REJECT");
    expect(decision.refusal?.code).toBe("SOURCE_UNAVAILABLE");
  });

  it("refuses with SOURCE_UNAVAILABLE for an invoice the adapter does not know", async () => {
    const baseUrl = await startFixture();
    const client = createPolicyV2SourceClient({
      url: baseUrl,
      token: TOKEN,
      timeoutMs: 2000,
    });

    const decision = await decide("INV-404", client);

    expect(decision.outcome).toBe("REJECT");
    expect(decision.refusal?.code).toBe("SOURCE_UNAVAILABLE");
  });
});
