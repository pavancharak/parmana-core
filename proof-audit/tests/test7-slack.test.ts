//
// TEST 7: the same gate conditions for a second connector, Slack post-message.
// The fixture follows packages/api/tests/integration/slack-post-message.integration.test.ts.
// External endpoint: MockSlackServer, which records every call. Expected: zero calls
// for every failing case; one call for the control.
//
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { MockSlackServer, SLACK_TEST_MODE_PLACEHOLDER_TOKEN } from "@parmana/connector-slack";
import { createApplication } from "../../packages/api/src/application.js";
import { createApp } from "../../packages/api/src/app.js";
import { createExecutionSystem } from "../../packages/api/src/bootstrap/createExecutionSystem.js";
import { withTestApproval } from "../../test-support/approvals.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cases: Record<string, unknown>[] = [];
let server: MockSlackServer;
let gateway: any;
let app: ReturnType<typeof createApp>;
let mode: "capture" | "release" = "capture";
const captured: any[] = [];

async function transaction(channel: string) {
  const id = crypto.randomUUID(); const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID(); const intentId = crypto.randomUUID();
  // A signed human approval for this channel, as the integration test attaches (withTestApproval).
  return withTestApproval({
    businessTransactionId: id,
    metadata: { businessTransactionId: id, correlationId: crypto.randomUUID(), createdBy: "proof-audit", createdAt: new Date() },
    authority: { authorityId, authorityType: "USER", principalId: "integration-test", displayName: "Proof Audit", issuedAt: new Date() },
    authorization: { authorizationId, authorityId, purpose: "Proof audit", authorizedAt: new Date() },
    intent: { intentId, authorizationId, action: "slack:post-message", target: channel,
      parameters: Object.freeze({ channel, text: "Deployment succeeded." }), createdAt: new Date() },
    policy: { name: "slack-post-message", version: "1.1.0", schemaVersion: "1.0.0" },
    signals: { contentApproved: true, channelAuthorized: true, channelId: channel },
    decision: { outcome: "APPROVED" }, status: "APPROVED", createdAt: new Date(),
  } as any);
}

async function mint(channel: string) {
  const before = captured.length;
  const prior = mode;
  mode = "capture";
  await request(app).post("/execute").send(await transaction(channel));
  mode = prior;
  return captured[before]!;
}

async function attempt(label: string, proof: any, expectCalls: number, extra: Record<string, unknown> = {}) {
  const before = server.calls.length;
  let threw = false; let message = "";
  try { await gateway.execute(proof); } catch (e) { threw = true; message = (e as Error).message; }
  const delta = server.calls.length - before;
  const ok = expectCalls === 0 ? threw && delta === 0 : !threw && delta === expectCalls;
  cases.push({ connector: "slack:post-message", case: label, rejected: threw, message: message.slice(0, 160), callsDelta: delta, expected: expectCalls === 0 ? "rejected, 0 calls" : "released, 1 call", verdict: ok ? "PASS" : "FAIL", ...extra });
  return ok;
}

beforeAll(async () => {
  server = new MockSlackServer({ botToken: SLACK_TEST_MODE_PLACEHOLDER_TOKEN });
  await server.listen();
  process.env.SLACK_BASE_URL = server.baseUrl;
  process.env.TEST_SLACK_BOT_TOKEN = SLACK_TEST_MODE_PLACEHOLDER_TOKEN;
  process.env.SLACK_ALLOWED_CHANNEL_IDS = "C_ALLOWED";
  gateway = await createExecutionSystem();
  const wrapped = {
    execute: async (r: any) => {
      captured.push(r);
      if (mode === "capture") throw new Error("proof-audit capture mode: not released");
      return gateway.execute(r);
    },
  } as any;
  app = createApp(createApplication(wrapped), { callerAuth: "disabled" });
}, 120000);

afterAll(async () => {
  await server.close();
  mkdirSync(join(root, "proof-audit/results"), { recursive: true });
  writeFileSync(join(root, "proof-audit/results/test7.json"), JSON.stringify(cases, null, 2));
});

describe("TEST 7: Slack post-message gate conditions", () => {
  it("control: a valid proof posts once", async () => {
    mode = "release";
    const proof = await mint("C_ALLOWED");
    const ok = await attempt("control: valid proof", proof, 1);
    expect(ok).toBe(true);
  });

  it("no proof", async () => {
    const proof = await mint("C_ALLOWED");
    expect(await attempt("no proof", { ...proof, authorization: undefined }, 0)).toBe(true);
  });

  it("forged signature", async () => {
    const proof = await mint("C_ALLOWED");
    const sig = proof.authorization.signature as string;
    const forged = { ...proof, authorization: { ...proof.authorization, signature: (sig[0] === "A" ? "B" : "A") + sig.slice(1) } };
    expect(await attempt("forged signature", forged, 0)).toBe(true);
  });

  it("changed channel parameter (approved C_ALLOWED, executed C_OTHER)", async () => {
    const proof = await mint("C_ALLOWED");
    const tampered = { ...proof, target: "C_OTHER", parameters: { ...proof.parameters, channel: "C_OTHER" } };
    expect(await attempt("changed channel after approval", tampered, 0)).toBe(true);
  });

  it("revoked authorization", async () => {
    const proof = await mint("C_ALLOWED");
    const file = join(process.env.PARMANA_KEY_DIR!, "revoked-authorizations.json");
    writeFileSync(file, JSON.stringify([proof.authorization.payload.authorizationId]));
    const ok = await attempt("single authorization revoked", proof, 0);
    rmSync(file, { force: true });
    expect(ok).toBe(true);
  });

  it("expired proof", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    const proof = await mint("C_ALLOWED");
    vi.setSystemTime(new Date(Date.parse(proof.authorization.payload.expiresAt) + 60_000));
    const ok = await attempt("expired proof", proof, 0);
    vi.useRealTimers();
    expect(ok).toBe(true);
  });

  it("replay: the same proof a second time", async () => {
    const proof = await mint("C_ALLOWED");
    const first = await attempt("replay step 1: first use", proof, 1);
    const second = await attempt("replay step 2: same proof again", proof, 0);
    expect(first && second).toBe(true);
  });
});
