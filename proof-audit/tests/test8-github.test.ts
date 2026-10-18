//
// TEST 8: the same gate conditions for GitHub PR merge.
// Fixture follows packages/api/tests/integration/github-pr-merge.integration.test.ts.
// External endpoint: MockGitHubServer, whose mergeCalls counts every merge request.
//
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { StaticApprovalIssuerRegistry } from "@parmana/approval";
import { ApprovalArtifactSigner } from "@parmana/crypto";
import { MockGitHubServer } from "@parmana/connector-github";
import { createApplication } from "../../packages/api/src/application.js";
import { createApp } from "../../packages/api/src/app.js";
import { createExecutionSystem } from "../../packages/api/src/bootstrap/createExecutionSystem.js";

const approver = vi.hoisted(() => ({ approverId: "manager-github", keyId: "manager-github-key-1" }));
const approverKeys = generateKeyPairSync("ed25519");
vi.mock("../../packages/api/src/bootstrap/createApprovalIssuerRegistry.js", () => ({
  createApprovalIssuerRegistry: () =>
    new StaticApprovalIssuerRegistry([{ ...approver, publicKey: approverKeys.publicKey, revoked: false }]),
}));

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cases: Record<string, unknown>[] = [];
let server: MockGitHubServer;
let gateway: any;
let app: ReturnType<typeof createApp>;
let mode: "capture" | "release" = "capture";
const captured: any[] = [];
const INSTALLATION_TOKEN = "test-mock-installation-token-a1b2c3d4e5f6";

async function transaction(mergeMethod: string) {
  const id = crypto.randomUUID(); const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID(); const intentId = crypto.randomUUID();
  const approval = await new ApprovalArtifactSigner().sign({
    approverId: approver.approverId, keyId: approver.keyId, capability: "github:pr-merge",
    resourceId: "acme/widgets#42", scope: { field: "resourceId", comparator: "eq", value: "acme/widgets#42" }, ttlSeconds: 900,
  }, approverKeys.privateKey);
  return {
    businessTransactionId: id,
    metadata: { businessTransactionId: id, correlationId: crypto.randomUUID(), createdBy: "proof-audit", createdAt: new Date() },
    authority: { authorityId, authorityType: "USER", principalId: "integration-test", displayName: "Proof Audit", issuedAt: new Date() },
    authorization: { authorizationId, authorityId, purpose: "Proof audit", authorizedAt: new Date() },
    intent: { intentId, authorizationId, action: "github:pr-merge", target: "acme/widgets#42",
      parameters: Object.freeze({ mergeMethod }), createdAt: new Date() },
    policy: { name: "github-pr-approval", version: "1.1.0", schemaVersion: "1.0.0" },
    signals: {
      mergeApproved: true, repositoryAuthorized: true, requiredReviewsCompleted: true,
      statusChecksPassed: true, branchProtected: true, riskScore: 5,
      approvalArtifact: JSON.parse(JSON.stringify(approval)),
    },
    decision: { outcome: "APPROVED" }, status: "APPROVED", createdAt: new Date(),
  } as any;
}

async function mint(mergeMethod = "squash") {
  const before = captured.length;
  const prior = mode;
  mode = "capture";
  await request(app).post("/execute").send(await transaction(mergeMethod));
  mode = prior;
  return captured[before]!;
}

async function attempt(label: string, proof: any, expectCalls: number) {
  const before = server.mergeCalls;
  let threw = false; let message = "";
  try { await gateway.execute(proof); } catch (e) { threw = true; message = (e as Error).message; }
  const delta = server.mergeCalls - before;
  const ok = expectCalls === 0 ? threw && delta === 0 : !threw && delta === expectCalls;
  cases.push({ connector: "github:pr-merge", case: label, rejected: threw, message: message.slice(0, 160), callsDelta: delta, expected: expectCalls === 0 ? "rejected, 0 calls" : "released, 1 call", verdict: ok ? "PASS" : "FAIL" });
  return ok;
}

beforeAll(async () => {
  server = new MockGitHubServer({ installationToken: INSTALLATION_TOKEN });
  await server.listen();
  process.env.GITHUB_BASE_URL = server.baseUrl;
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

function setPr() {
  server.setPullRequest("acme", "widgets", { number: 42, mergeable: true, mergedAt: null, headSha: "abc123", baseRef: "main" });
}

afterAll(async () => {
  await server.close();
  mkdirSync(join(root, "proof-audit/results"), { recursive: true });
  writeFileSync(join(root, "proof-audit/results/test8.json"), JSON.stringify(cases, null, 2));
});

describe("TEST 8: GitHub PR merge gate conditions", () => {
  it("control: a valid proof merges once", async () => {
    mode = "release"; setPr();
    const proof = await mint();
    expect(await attempt("control: valid proof", proof, 1)).toBe(true);
  });

  it("no proof", async () => {
    setPr();
    const proof = await mint();
    expect(await attempt("no proof", { ...proof, authorization: undefined }, 0)).toBe(true);
  });

  it("forged signature", async () => {
    setPr();
    const proof = await mint();
    const sig = proof.authorization.signature as string;
    expect(await attempt("forged signature", { ...proof, authorization: { ...proof.authorization, signature: (sig[0] === "A" ? "B" : "A") + sig.slice(1) } }, 0)).toBe(true);
  });

  it("changed parameter after approval (squash approved, rebase executed)", async () => {
    setPr();
    const proof = await mint("squash");
    expect(await attempt("changed merge method after approval", { ...proof, parameters: { mergeMethod: "rebase" } }, 0)).toBe(true);
  });

  it("revoked authorization", async () => {
    setPr();
    const proof = await mint();
    const file = join(process.env.PARMANA_KEY_DIR!, "revoked-authorizations.json");
    writeFileSync(file, JSON.stringify([proof.authorization.payload.authorizationId]));
    const ok = await attempt("single authorization revoked", proof, 0);
    rmSync(file, { force: true });
    expect(ok).toBe(true);
  });

  it("expired proof", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T13:00:00Z"));
    setPr();
    const proof = await mint();
    vi.setSystemTime(new Date(Date.parse(proof.authorization.payload.expiresAt) + 60_000));
    const ok = await attempt("expired proof", proof, 0);
    vi.useRealTimers();
    expect(ok).toBe(true);
  });

  it("replay: the same proof a second time", async () => {
    setPr();
    const proof = await mint();
    const first = await attempt("replay step 1: first use", proof, 1);
    const second = await attempt("replay step 2: same proof again", proof, 0);
    expect(first && second).toBe(true);
  });
});
