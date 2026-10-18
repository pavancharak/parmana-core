//
// TEST 3: a proof authorizes only the exact parameters it was issued for.
// One valid proof per case; endpoint = MockPaytmConnectorServer (records every call).
//
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { StaticApprovalIssuerRegistry } from "@parmana/approval";
import {
  APPROVER,
  approverKeys,
  buildHarness,
  closeHarness,
  refundTransaction,
  type Harness,
} from "./helpers.js";

vi.mock("../../packages/api/src/bootstrap/createApprovalIssuerRegistry.js", () => ({
  createApprovalIssuerRegistry: () =>
    new StaticApprovalIssuerRegistry([
      { ...APPROVER, publicKey: approverKeys.publicKey, revoked: false },
    ]),
}));

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cases: Record<string, unknown>[] = [];
let harness: Harness;

async function mintProof(orderId: string, amount: number) {
  const before = harness.captured.length;
  const prior = harness.mode;
  harness.mode = "capture";
  await request(harness.app).post("/execute").send(await refundTransaction({ orderId, amount }));
  harness.mode = prior;
  const captured = harness.captured[before];
  if (captured === undefined) throw new Error("no proof captured");
  return captured;
}

async function attempt(label: string, proof: any, expectCalls: number) {
  const before = harness.server.paytmInvocationCount;
  let threw = false; let message = "";
  try { await harness.gateway.execute(proof); } catch (e) { threw = true; message = (e as Error).message; }
  const delta = harness.server.paytmInvocationCount - before;
  const ok = delta === expectCalls && (expectCalls === 0 ? threw : !threw);
  cases.push({ case: label, rejected: threw, message: message.slice(0, 220), paytmCallsDelta: delta, expected: expectCalls === 0 ? "rejected, 0 calls" : "accepted, 1 call", verdict: ok ? "PASS" : "FAIL" });
  return { ok, threw, delta };
}

beforeAll(async () => {
  harness = await buildHarness();
  harness.mode = "release";
}, 120000);

afterAll(async () => {
  await closeHarness(harness);
  mkdirSync(join(root, "proof-audit/results"), { recursive: true });
  writeFileSync(join(root, "proof-audit/results/test3.json"), JSON.stringify(cases, null, 2));
});

describe("TEST 3: binding to the exact action", () => {
  it("control: the unmodified proof is accepted once", async () => {
    const proof = await mintProof("ORD-BIND-CTRL", 10000);
    const r = await attempt("control: unmodified proof", proof, 1);
    expect(r.ok).toBe(true);
  });

  it("different amount: issued for 10000, executed for 15000", async () => {
    const proof = await mintProof("ORD-BIND-AMT", 10000);
    const tampered = { ...proof, parameters: { ...proof.parameters, amount: 15000 } };
    const r = await attempt("different amount (10000 issued, 15000 executed)", tampered, 0);
    expect(r.ok).toBe(true);
  });

  it("different recipient / target identifier", async () => {
    const proof = await mintProof("ORD-BIND-TGT", 10000);
    const tampered = { ...proof, target: "paytm://orders/ORD-ATTACKER" };
    const r = await attempt("different target (recipient)", tampered, 0);
    expect(r.ok).toBe(true);
  });

  it("different recipient in parameters (orderId / transactionId)", async () => {
    const proof = await mintProof("ORD-BIND-PARAM", 10000);
    const tampered = { ...proof, parameters: { ...proof.parameters, orderId: "ORD-ATTACKER", transactionId: "TXN-ATTACKER" } };
    const r = await attempt("different recipient identifiers in parameters", tampered, 0);
    expect(r.ok).toBe(true);
  });

  it("different connector / system: same proof routed as a different capability", async () => {
    const proof = await mintProof("ORD-BIND-CONN", 10000);
    const tampered = { ...proof, action: "test:fixture-execute" };
    const r = await attempt("different connector (action paytm:refund -> test:fixture-execute)", tampered, 0);
    expect(r.ok).toBe(true);
  });

  it("different operation type: same capability, operation changed", async () => {
    const proof = await mintProof("ORD-BIND-OP", 10000);
    const tampered = { ...proof, action: "paytm:refund", parameters: { ...proof.parameters, operation: "void" } };
    const r = await attempt("different operation type (operation added / changed)", tampered, 0);
    expect(r.ok).toBe(true);
  });

  it("out-of-window: never-executed proof presented after expiresAt", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T11:00:00Z"));
    const proof = await mintProof("ORD-BIND-WIN", 10000);
    vi.setSystemTime(new Date(Date.parse(proof.authorization.payload.expiresAt) + 1000));
    const r = await attempt("out-of-window reuse (never executed, presented after expiresAt)", proof, 0);
    vi.useRealTimers();
    expect(r.ok).toBe(true);
  });

  it("replay: the same proof a second time at the gateway", async () => {
    const proof = await mintProof("ORD-BIND-REPLAY", 10000);
    const first = await attempt("replay step 1: first use of proof", proof, 1);
    const second = await attempt("replay step 2: same proof again", proof, 0);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });

  it("replay at the API: the same business transaction submitted twice", async () => {
    const tx = await refundTransaction({ orderId: "ORD-BIND-API", amount: 10000 });
    const before = harness.server.paytmInvocationCount;
    const first = await request(harness.app).post("/execute").send(tx);
    const second = await request(harness.app).post("/execute").send(tx);
    const delta = harness.server.paytmInvocationCount - before;
    const ok = first.status === 200 && second.status !== 200 && delta === 1;
    cases.push({ case: "replay at API: same transaction posted twice", firstStatus: first.status, secondStatus: second.status, paytmCallsDelta: delta, expected: "second rejected, 1 call total", verdict: ok ? "PASS" : "FAIL" });
    expect(ok).toBe(true);
  });
});
