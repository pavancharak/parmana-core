//
// TEST 1: independent verification.
// Claim: a third party can verify a proof without Parmana's services,
// database or private keys.
//
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StaticApprovalIssuerRegistry } from "@parmana/approval";
import request from "supertest";
import { readFileSync as readKey } from "node:fs";

import {
  approverKeys,
  APPROVER,
  buildHarness,
  closeHarness,
  refundTransaction,
  type Harness,
} from "./helpers.js";

vi.mock(
  "../../packages/api/src/bootstrap/createApprovalIssuerRegistry.js",
  () => ({
    createApprovalIssuerRegistry: () =>
      new StaticApprovalIssuerRegistry([
        { ...APPROVER, publicKey: approverKeys.publicKey, revoked: false },
      ]),
  }),
);

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const artifacts = join(root, "proof-audit/artifacts/test1");
const verifier = join(root, "proof-audit/verify/verify-offline.mjs");
const denyHook = pathToFileURL(join(root, "proof-audit/verify/deny-network.mjs")).href;

interface VerifyRun {
  status: number | null;
  stdout: string;
  stderr: string;
  blocked: string[];
  command: string;
  osIsolated: boolean;
}

/**
 * Whether this host lets an unprivileged process create an empty network namespace.
 * CI runners often refuse it. When not, the OS-level layer is recorded as unavailable
 * and the in-process hook is the isolation that applies.
 */
const netnsAvailable = spawnSync("unshare", ["-rn", "true"], { encoding: "utf8" }).status === 0;

/** Runs the verifier in a fresh process: empty env, network denied, OS netns when available. */
function runFreshVerifier(proofFile: string, keysFile: string, policyFile: string, osIsolated = netnsAvailable): VerifyRun {
  const args = [process.execPath, verifier, proofFile, keysFile, policyFile];
  const command = osIsolated
    ? `env -i PATH=$PATH NODE_OPTIONS=--import=${denyHook} unshare -rn node verify-offline.mjs <proof> <keys> <policy>`
    : `env -i PATH=$PATH NODE_OPTIONS=--import=${denyHook} node verify-offline.mjs <proof> <keys> <policy>`;
  const env = { PATH: process.env.PATH ?? "", NODE_OPTIONS: `--import=${denyHook}` };
  const result = osIsolated
    ? spawnSync("unshare", ["-rn", ...args], { env, encoding: "utf8" })
    : spawnSync(args[0]!, args.slice(1), { env, encoding: "utf8" });
  const blockedLine = (result.stderr ?? "").split("\n").find((l) => l.startsWith("PROOF_AUDIT_BLOCKED:"));
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    blocked: blockedLine ? JSON.parse(blockedLine.slice("PROOF_AUDIT_BLOCKED:".length)) : [],
    command,
    osIsolated,
  };
}

let harness: Harness;
let proof: any;
let keysFile: string;
let policyFile: string;
let proofFile: string;
const results: Record<string, unknown> = {};

beforeAll(async () => {
  rmSync(artifacts, { recursive: true, force: true });
  mkdirSync(artifacts, { recursive: true });
  harness = await buildHarness();
  harness.mode = "release";

  const tx = await refundTransaction({ orderId: "ORD-T1", amount: 10000 });
  const response = await request(harness.app).post("/execute").send(tx);
  expect(response.status).toBe(200);
  proof = response.body;

  // Export only: the proof, public verification material, and the policy version it cites.
  const keyIds = new Set<string>([proof.signature.keyId, proof.authorization.keyId]);
  const publicKeys: Record<string, string> = {};
  for (const keyId of keyIds) {
    publicKeys[keyId] = readKey(join(process.env.PARMANA_KEY_DIR!, `${keyId}.public.pem`), "utf8");
  }
  proofFile = join(artifacts, "proof.json");
  keysFile = join(artifacts, "public-keys.json");
  policyFile = join(artifacts, "policy-version.json");
  writeFileSync(proofFile, JSON.stringify(proof, null, 2));
  writeFileSync(keysFile, JSON.stringify(publicKeys, null, 2));
  writeFileSync(
    policyFile,
    JSON.stringify(
      {
        name: proof.transaction.policy.name,
        version: proof.transaction.policy.version,
        contentHash: proof.transaction.policy.contentHash,
      },
      null,
      2,
    ),
  );
  results.exportedFiles = ["proof.json", "public-keys.json", "policy-version.json"];
  results.osIsolation = netnsAvailable ? "empty network namespace + in-process hook" : "in-process hook only (unshare -rn not permitted)";
  results.keyIdsExported = [...keyIds];
  results.releasedToPaytm = harness.server.paytmInvocationCount;
}, 120000);

afterAll(async () => {
  if (harness) await closeHarness(harness);
  mkdirSync(join(root, "proof-audit/results"), { recursive: true });
  writeFileSync(join(root, "proof-audit/results/test1.json"), JSON.stringify(results, null, 2));
});

/** Writes a mutated copy of the proof and verifies it in a fresh process. */
function verifyMutated(name: string, mutate: (p: any) => void): VerifyRun {
  const copy = JSON.parse(JSON.stringify(proof));
  mutate(copy);
  const file = join(artifacts, `tampered-${name}.json`);
  writeFileSync(file, JSON.stringify(copy, null, 2));
  return runFreshVerifier(file, keysFile, policyFile);
}

describe("TEST 1: independent verification", () => {
  it("control: the proof is reachable from the test process before isolation", async () => {
    const res = await fetch(`${harness.server.baseUrl}/`).then(
      () => "reachable",
      (e: Error) => `unreachable: ${e.message}`,
    );
    results.controlReachability = res;
    expect(res).toBe("reachable");
  });

  it("unmodified proof verifies in a fresh process (empty env, no keys, network denied, empty netns)", () => {
    const run = runFreshVerifier(proofFile, keysFile, policyFile);
    results.positive = { command: run.command, status: run.status, stdout: run.stdout.trim(), stderr: run.stderr.trim(), blocked: run.blocked };
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout).valid).toBe(true);
    expect(JSON.parse(run.stdout).citedPolicy).toBe("customer-refund@1.2.0");
    expect(JSON.parse(run.stdout).envKeys).toBeLessThanOrEqual(2);
    // The verifier no longer loads a .env file from the working tree on import.
    expect(run.stderr).not.toMatch(/injected env/);
  });

  it("a verifier process cannot reach the original service (in-process hook and empty netns)", () => {
    const probe = join(artifacts, "reach-probe.mjs");
    writeFileSync(
      probe,
      `const r = await fetch(${JSON.stringify(harness.server.baseUrl + "/")}).then(()=>"reachable",e=>"blocked:"+e.message); console.log(r);`,
    );
    const env = { PATH: process.env.PATH ?? "", NODE_OPTIONS: `--import=${denyHook}` };
    const hookOnly = spawnSync(process.execPath, [probe], { env, encoding: "utf8" });
    const netns = netnsAvailable
      ? spawnSync("unshare", ["-rn", process.execPath, probe], { env: { PATH: process.env.PATH ?? "" }, encoding: "utf8" })
      : null;
    results.reachability = {
      hookOnly: hookOnly.stdout.trim(),
      netns: netns === null ? "UNABLE TO TEST: unshare -rn not permitted on this host" : (netns.stdout + netns.stderr).trim().slice(0, 300),
      netnsAvailable,
    };
    expect(hookOnly.stdout.trim().startsWith("blocked")).toBe(true);
    if (netns !== null) expect(netns.stdout.trim().startsWith("reachable")).toBe(false);
  });

  it("no private key material is loaded by the verifier process", () => {
    const run = runFreshVerifier(proofFile, keysFile, policyFile);
    expect(run.blocked.filter((b) => b.includes("private"))).toEqual([]);
    expect(run.stdout).not.toMatch(/PRIVATE KEY/);
  });

  describe("field tampering: each change must fail verification", () => {
    const cases: Array<[string, (p: any) => void]> = [
      ["decision", (p) => {
        expect(p.executions[0].decision.outcome).toBe("APPROVED");
        p.executions[0].decision.outcome = "DENIED";
      }],
      ["amount", (p) => {
        expect(p.transaction.intent.parameters.amount).toBe(10000);
        p.transaction.intent.parameters.amount = 15000;
      }],
      ["action-id (businessTransactionId)", (p) => {
        p.businessTransactionId = crypto.randomUUID();
      }],
      ["action-id (authorizationId in signed payload)", (p) => {
        p.authorization.payload.authorizationId = crypto.randomUUID();
      }],
      ["timestamp (authorizedAt)", (p) => {
        const t = Date.parse(p.authorization.payload.authorizedAt) + 1000;
        p.authorization.payload.authorizedAt = new Date(t).toISOString();
      }],
      ["policy-version (transaction.policy.version)", (p) => {
        expect(p.transaction.policy.version).toBe("1.2.0");
        p.transaction.policy.version = "1.2.1";
      }],
      ["policy-version (authorization policyVersion)", (p) => {
        p.authorization.payload.policyVersion = "1.2.1";
      }],
      ["signature (trust record)", (p) => {
        const v = p.signature.value as string;
        p.signature.value = (v[0] === "A" ? "B" : "A") + v.slice(1);
      }],
      ["signature (authorization)", (p) => {
        const v = p.authorization.signature as string;
        p.authorization.signature = (v[0] === "A" ? "B" : "A") + v.slice(1);
      }],
    ];

    for (const [name, mutate] of cases) {
      it(`rejects a changed ${name}`, () => {
        const run = verifyMutated(name.replace(/[^a-z0-9]+/gi, "-"), mutate);
        results[`tamper:${name}`] = { status: run.status, stdout: run.stdout.trim() };
        expect(run.status).toBe(1);
        expect(JSON.parse(run.stdout).valid).toBe(false);
      });
    }
  });
});
