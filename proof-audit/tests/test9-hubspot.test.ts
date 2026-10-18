//
// TEST 9: the same gate conditions for HubSpot deal-update.
// Fixture follows packages/api/tests/integration/hubspot-deal-update.integration.test.ts.
// External endpoint: MockHubSpotServer. A release is observed as the deal's dealstage
// changing to the proposed stage (the mock does not count calls).
// The signal check's own read (hubspot:deal-fetch) is allowed through; only the
// deal-update is captured, so the audit sees the write authorization.
//
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { MockHubSpotServer, HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN } from "@parmana/connector-hubspot";
import { createApplication } from "../../packages/api/src/application.js";
import { createApp } from "../../packages/api/src/app.js";
import { createExecutionSystem } from "../../packages/api/src/bootstrap/createExecutionSystem.js";
import { withTestApproval } from "../../test-support/approvals.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cases: Record<string, unknown>[] = [];
let server: MockHubSpotServer;
let gateway: any;
let app: ReturnType<typeof createApp>;
let mode: "capture" | "release" = "capture";
const captured: any[] = [];
const DEAL = "9001";

async function transaction(dealstage: string) {
  const id = crypto.randomUUID(); const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID(); const intentId = crypto.randomUUID();
  return withTestApproval({
    businessTransactionId: id,
    metadata: { businessTransactionId: id, correlationId: crypto.randomUUID(), createdBy: "proof-audit", createdAt: new Date() },
    authority: { authorityId, authorityType: "USER", principalId: "integration-test", displayName: "Proof Audit", issuedAt: new Date() },
    authorization: { authorizationId, authorityId, purpose: "Proof audit", authorizedAt: new Date() },
    intent: { intentId, authorizationId, action: "hubspot:deal-update", target: `hubspot://deals/${DEAL}`,
      parameters: Object.freeze({ dealId: DEAL, dealstage }), createdAt: new Date() },
    policy: { name: "hubspot-deal-update", version: "1.1.0", schemaVersion: "1.0.0" },
    signals: {
      currentDealStage: "appointmentscheduled", proposedDealStage: "qualifiedtobuy",
      dealStageChangeRequested: true, dealStageTransitionAllowed: true,
      amountChangeRequested: false, amountDeltaAbs: 0, amountChangeExceedsThreshold: false,
    },
    decision: { outcome: "APPROVED" }, status: "APPROVED", createdAt: new Date(),
  } as any);
}

function resetDeal() {
  server.setDeal({ id: DEAL, properties: { dealstage: "appointmentscheduled", amount: "5000", pipeline: "default" } } as any);
}

async function mint(dealstage = "qualifiedtobuy") {
  const before = captured.length;
  const prior = mode;
  mode = "capture";
  await request(app).post("/execute").send(await transaction(dealstage));
  mode = prior;
  return captured.slice(before).find((r) => r.action === "hubspot:deal-update")!;
}

async function attempt(label: string, proof: any, expectRelease: boolean) {
  resetDeal();
  let threw = false; let message = "";
  try { await gateway.execute(proof); } catch (e) { threw = true; message = (e as Error).message; }
  const stage = server.getDeal(DEAL)?.properties.dealstage;
  const released = stage === "qualifiedtobuy";
  const ok = expectRelease ? !threw && released : threw && !released;
  cases.push({ connector: "hubspot:deal-update", case: label, rejected: threw, message: message.slice(0, 160), dealStageAfter: stage, expected: expectRelease ? "released, stage changed" : "rejected, stage unchanged", verdict: ok ? "PASS" : "FAIL" });
  return ok;
}

beforeAll(async () => {
  server = new MockHubSpotServer({ token: HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN });
  await server.listen();
  process.env.HUBSPOT_BASE_URL = server.baseUrl;
  process.env.TEST_HUBSPOT_PRIVATE_APP_TOKEN = HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN;
  gateway = await createExecutionSystem();
  const wrapped = {
    execute: async (r: any) => {
      if (r.action === "hubspot:deal-update") {
        captured.push(r);
        if (mode === "capture") throw new Error("proof-audit capture mode: not released");
      }
      return gateway.execute(r);
    },
  } as any;
  app = createApp(createApplication(wrapped), { callerAuth: "disabled" });
}, 120000);

afterAll(async () => {
  await server.close();
  mkdirSync(join(root, "proof-audit/results"), { recursive: true });
  writeFileSync(join(root, "proof-audit/results/test9.json"), JSON.stringify(cases, null, 2));
});

describe("TEST 9: HubSpot deal-update gate conditions", () => {
  it("control: a valid proof changes the stage once", async () => {
    mode = "release"; resetDeal();
    const proof = await mint();
    expect(await attempt("control: valid proof", proof, true)).toBe(true);
  });

  it("no proof", async () => {
    const proof = await mint();
    expect(await attempt("no proof", { ...proof, authorization: undefined }, false)).toBe(true);
  });

  it("forged signature", async () => {
    const proof = await mint();
    const sig = proof.authorization.signature as string;
    expect(await attempt("forged signature", { ...proof, authorization: { ...proof.authorization, signature: (sig[0] === "A" ? "B" : "A") + sig.slice(1) } }, false)).toBe(true);
  });

  it("changed stage after approval (qualifiedtobuy approved, closedwon executed)", async () => {
    const proof = await mint("qualifiedtobuy");
    expect(await attempt("changed dealstage after approval", { ...proof, parameters: { dealId: DEAL, dealstage: "closedwon" } }, false)).toBe(true);
  });

  it("revoked authorization", async () => {
    const proof = await mint();
    const file = join(process.env.PARMANA_KEY_DIR!, "revoked-authorizations.json");
    writeFileSync(file, JSON.stringify([proof.authorization.payload.authorizationId]));
    const ok = await attempt("single authorization revoked", proof, false);
    rmSync(file, { force: true });
    expect(ok).toBe(true);
  });

  it("expired proof", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T14:00:00Z"));
    const proof = await mint();
    vi.setSystemTime(new Date(Date.parse(proof.authorization.payload.expiresAt) + 60_000));
    const ok = await attempt("expired proof", proof, false);
    vi.useRealTimers();
    expect(ok).toBe(true);
  });

  it("replay: the same proof a second time", async () => {
    const proof = await mint();
    const first = await attempt("replay step 1: first use", proof, true);
    const second = await attempt("replay step 2: same proof again", proof, false);
    expect(first && second).toBe(true);
  });
});
