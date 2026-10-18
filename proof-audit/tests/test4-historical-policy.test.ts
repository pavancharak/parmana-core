//
// TEST 4: an old proof verifies against the policy version it cites, and a stored
// version cannot be overwritten in place without detection.
//
// The repo's policies/ directory is never modified. Policy edits happen on a temp
// copy of customer-refund, read by a standalone gateway. Proofs are minted by the
// real runtime (which hashes the repo's policies/customer-refund@1.2.0), and the
// temp copy starts byte-identical to it.
//
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { StaticApprovalIssuerRegistry } from "@parmana/approval";
import {
  CryptoBootstrap,
  SignerBootstrap,
  SignerKeyProviderAdapter,
  FileKeyExpiryStore,
  TrustRecordHasher,
  verifyExecutionTrustRecordOffline,
} from "@parmana/crypto";
import { ExecutionGateway } from "@parmana/execution-gateway";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import { FilePolicyRepository } from "@parmana/policy";

import {
  APPROVER,
  approverKeys,
  buildHarness,
  closeHarness,
  publicKeyPem,
  refundTransaction,
  type Harness,
} from "./helpers.js";
import { createGatewayPublicKey } from "../../packages/api/src/bootstrap/createGatewayPublicKey.js";

vi.mock("../../packages/api/src/bootstrap/createApprovalIssuerRegistry.js", () => ({
  createApprovalIssuerRegistry: () =>
    new StaticApprovalIssuerRegistry([
      { ...APPROVER, publicKey: approverKeys.publicKey, revoked: false },
    ]),
}));

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cases: Record<string, unknown>[] = [];
const hasher = new TrustRecordHasher(CryptoBootstrap.create());
let harness: Harness;
let tmp: string;
let repo: FilePolicyRepository;
let gateway: ExecutionGateway;
const calls: unknown[] = [];

async function mint(orderId: string) {
  const before = harness.captured.length;
  const prior = harness.mode;
  harness.mode = "capture";
  await request(harness.app).post("/execute").send(await refundTransaction({ orderId, amount: 10000 }));
  harness.mode = prior;
  return harness.captured[before]!;
}

beforeAll(async () => {
  harness = await buildHarness();
  tmp = mkdtempSync(join(tmpdir(), "proof-audit-policy-"));
  cpSync(join(root, "policies/customer-refund"), join(tmp, "customer-refund"), { recursive: true });
  repo = new FilePolicyRepository(tmp);
  const signer = await SignerBootstrap.create();
  gateway = new ExecutionGateway({
    publicKey: await createGatewayPublicKey(signer),
    keyProvider: new SignerKeyProviderAdapter(signer),
    keyExpiryStore: new FileKeyExpiryStore(),
    nonceStore: new MemoryNonceStore(),
    policyRepository: repo,
    // Governance approval is not under test here (Test 2 covers it); stub it out.
    policyApprovalVerifier: { verify: async () => undefined } as any,
    connector: {
      capabilities: { declared: ["paytm:refund"] },
      execute: async (r: unknown) => { calls.push(r); return {}; },
    } as any,
  });
}, 120000);

afterAll(async () => {
  await closeHarness(harness);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(root, "proof-audit/results"), { recursive: true });
  writeFileSync(join(root, "proof-audit/results/test4.json"), JSON.stringify(cases, null, 2));
});

describe("TEST 4: verification against historical policy", () => {
  it("issues a proof under customer-refund@1.2.0 and records what it cites", async () => {
    const p1 = await mint("ORD-HIST-1");
    const cites = { name: p1.authorization.payload.policyName, version: p1.authorization.payload.policyVersion, hash: p1.authorization.payload.policyContentHash };
    cases.push({ step: "issue", cites, verdict: cites.version === "1.2.0" ? "PASS" : "FAIL" });
    expect(cites.version).toBe("1.2.0");
    (globalThis as any).__p1 = p1;
  });

  it("policy changes by ADDING version 1.3.0: the old proof still verifies against 1.2.0 and still cites 1.2.0", async () => {
    const a = JSON.parse(readFileSync(join(tmp, "customer-refund/1.2.0/policy.json"), "utf8"));
    await repo.save("customer-refund", "1.3.0", { ...a, policyVersion: "1.3.0", description: "B: added version" } as any);
    const p1 = (globalThis as any).__p1;
    const before = calls.length;
    let threw = false; let message = "";
    try { await gateway.execute(p1); } catch (e) { threw = true; message = (e as Error).message; }
    const released = calls.length - before;
    cases.push({ step: "old proof vs 1.2.0 after 1.3.0 added", released, rejected: threw, message: message.slice(0, 160), citesAfter: p1.authorization.payload.policyVersion, verdict: released === 1 && p1.authorization.payload.policyVersion === "1.2.0" ? "PASS" : "FAIL" });
    expect(released).toBe(1);
  });

  it("offline: a trust record citing 1.2.0 still verifies after 1.3.0 is added", async () => {
    harness.mode = "release";
    const tx = await refundTransaction({ orderId: "ORD-HIST-TR", amount: 10000 });
    const response = await request(harness.app).post("/execute").send(tx);
    const keys = { default: publicKeyPem() };
    const result = await verifyExecutionTrustRecordOffline(response.body, keys);
    cases.push({ step: "offline trust record after 1.3.0 added", citedVersion: response.body.transaction.policy.version, valid: result.valid, verdict: result.valid && response.body.transaction.policy.version === "1.2.0" ? "PASS" : "FAIL" });
    expect(result.valid).toBe(true);
    (globalThis as any).__tr = response.body;
  });

  it("overwrite test: a different-content rewrite of stored 1.2.0 is refused", async () => {
    const a = JSON.parse(readFileSync(join(tmp, "customer-refund/1.2.0/policy.json"), "utf8"));
    const p2 = await mint("ORD-HIST-2");
    let refused = false; let err = "";
    try { await repo.save("customer-refund", "1.2.0", { ...a, description: "edited in place" } as any); } catch (e) { refused = true; err = (e as Error).message; }
    const onDisk = JSON.parse(readFileSync(join(tmp, "customer-refund/1.2.0/policy.json"), "utf8"));
    const unchanged = onDisk.description !== "edited in place";
    cases.push({ step: "overwrite 1.2.0 in place with different content", refused, storedUnchanged: unchanged, error: err.slice(0, 140), verdict: refused && unchanged ? "PASS" : "FAIL" });
    (globalThis as any).__p2 = p2;
    expect(refused).toBe(true);
  });

  it("rollback: re-saving identical 1.2.0 content is allowed", async () => {
    const a = JSON.parse(readFileSync(join(tmp, "customer-refund/1.2.0/policy.json"), "utf8"));
    let ok = true; let err = "";
    try { await repo.save("customer-refund", "1.2.0", a as any); } catch (e) { ok = false; err = (e as Error).message; }
    cases.push({ step: "re-save identical 1.2.0 (approved rollback)", allowed: ok, error: err.slice(0, 120), verdict: ok ? "PASS" : "FAIL" });
    expect(ok).toBe(true);
  });

  it("the proof issued before the refused rewrite still releases (stored version unchanged)", async () => {
    const p2 = (globalThis as any).__p2;
    const before = calls.length;
    let threw = false; let message = "";
    try { await gateway.execute(p2); } catch (e) { threw = true; message = (e as Error).message; }
    const released = calls.length - before;
    cases.push({ step: "pre-rewrite proof after refused rewrite", rejected: threw, released, message: message.slice(0, 160), verdict: released === 1 ? "PASS" : "FAIL" });
    expect(released).toBe(1);
  });

  it("offline trust record stays valid and its cited contentHash still matches the stored version", async () => {
    const tr = (globalThis as any).__tr;
    const result = await verifyExecutionTrustRecordOffline(tr, { default: publicKeyPem() });
    const current = await repo.load("customer-refund", "1.2.0");
    const currentHash = await hasher.hash(current);
    const citedHash = tr.transaction.policy.contentHash;
    cases.push({ step: "third-party check after refused rewrite", offlineValid: result.valid, citedHashMatchesStore: currentHash === citedHash, verdict: result.valid && currentHash === citedHash ? "PASS" : "FAIL" });
    expect(currentHash).toBe(citedHash);
  });

  it("startup governance integrity: a matching approval record passes; a file edited outside governance is reported", async () => {
    const { verifyPolicyGovernanceIntegrityAtStartup } = await import("../../packages/api/src/governance/verifyPolicyGovernanceIntegrityAtStartup.js");
    const { PolicyChangeCrypto } = await import("@parmana/crypto");
    const { MemoryPolicyChangeApprovalRecordRepository } = await import("@parmana/storage");
    const { writeFileSync: write } = await import("node:fs");
    const crypto = new PolicyChangeCrypto();
    const records = new MemoryPolicyChangeApprovalRecordRepository();
    const live = await repo.load("customer-refund", "1.2.0");
    const draft: any = {
      policyChangeApprovalRecordId: crypto.randomUUID ? "pcar-audit" : "pcar-audit",
      pendingPolicyChangeId: "ppc-audit",
      policyName: "customer-refund",
      policyVersion: "1.2.0",
      proposedBy: "human-maker",
      approvedBy: "human-checker",
      proposedAt: new Date("2026-08-01T00:00:00.000Z"),
      approvedAt: new Date("2026-08-01T00:05:00.000Z"),
      contentHashAfter: await crypto.hashPolicyContent(live),
    };
    await records.create({ ...draft, signature: await crypto.sign(draft) });
    const deps = { policyRepository: repo, policyChangeCrypto: crypto, policyChangeApprovalRecordRepository: records };
    const matching = await verifyPolicyGovernanceIntegrityAtStartup(deps as any);
    const file = join(tmp, "customer-refund/1.2.0/policy.json");
    const original = readFileSync(file, "utf8");
    write(file, JSON.stringify({ ...JSON.parse(original), description: "edited outside governance" }, null, 2));
    const tampered = await verifyPolicyGovernanceIntegrityAtStartup(deps as any);
    write(file, original);
    cases.push({ step: "startup governance integrity", matchingMismatches: matching.mismatches.length, tamperedMismatches: tampered.mismatches.length, verdict: matching.mismatches.length === 0 && tampered.mismatches.length > 0 ? "PASS" : "FAIL" });
    expect(matching.mismatches).toEqual([]);
    expect(tampered.mismatches.length).toBeGreaterThan(0);
  });
});
