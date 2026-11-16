import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * scripts/list-approval-refusals.mjs is read-only. These tests run it against
 * an in-process server that serves Refusal Records, and check that it sorts
 * them and never sends a POST.
 */

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "..", "..", "scripts", "list-approval-refusals.mjs");
const KEY = "test-operator-key";

const records: Record<string, unknown> = {
  "tx-approval": {
    refusalRecordId: "r-1",
    createdAt: "2026-11-01T00:00:00Z",
    decision: {
      policy: { name: "customer-refund", version: "1.2.0" },
      matchedRuleId: "reject-manager-approval-required",
      reason: "needs a signed approval",
      signals: {
        refundEligible: true,
        fraudCheckPassed: true,
        managerApproved: false,
        refundAmount: 50000,
      },
    },
  },
  "tx-review": {
    refusalRecordId: "r-3",
    createdAt: "2026-11-01T00:00:00Z",
    decision: {
      policy: { name: "customer-refund", version: "1.2.0" },
      matchedRuleId: "reject-manager-approval-required",
      reason: "needs a signed approval",
      signals: {
        refundEligible: true,
        fraudCheckPassed: false,
        managerApproved: false,
        refundAmount: 50000,
      },
    },
  },
  "tx-final": {
    refusalRecordId: "r-2",
    createdAt: "2026-11-01T00:00:00Z",
    decision: {
      policy: { name: "customer-refund", version: "1.2.0" },
      matchedRuleId: "reject-above-maximum",
      reason: "over the maximum",
      signals: { refundEligible: true, fraudCheckPassed: true, managerApproved: true, refundAmount: 150000 },
    },
  },
};

let server: Server;
let baseUrl: string;
const methodsSeen: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    methodsSeen.push(req.method ?? "");
    if (req.headers.authorization !== `Bearer ${KEY}`) {
      res.writeHead(401).end();
      return;
    }
    const id = decodeURIComponent((req.url ?? "").replace("/refusal/", ""));
    if (req.method !== "GET" || !(id in records)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(records[id]));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server.close();
});

function run(
  args: string[],
  env: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [script, ...args],
      { env: { ...process.env, ...env } },
      (error, stdout, stderr) => {
        resolve({
          code: error ? ((error as { code?: number }).code ?? 1) : 0,
          stdout,
          stderr,
        });
      },
    );
  });
}

describe("list-approval-refusals", () => {
  it("sorts approval refusals apart from final refusals and missing records", async () => {
    const dir = await mkdtemp(join(tmpdir(), "refusals-"));
    const ids = join(dir, "ids.txt");
    const out = join(dir, "report.json");
    await writeFile(ids, "tx-approval\ntx-final\ntx-review\ntx-missing\n");

    const result = await run([ids, "--out", out], {
      PARMANA_BASE_URL: baseUrl,
      PARMANA_API_KEY: KEY,
    });

    expect(result.code).toBe(0);
    const report = JSON.parse(await readFile(out, "utf8"));
    expect(report.counts).toEqual({
      retry_after_approval: 1,
      final_refusal: 1,
      manual_review: 1,
      not_found: 1,
    });
    const byId = Object.fromEntries(
      report.rows.map((r: { businessTransactionId: string }) => [
        r.businessTransactionId,
        r,
      ]),
    );
    expect(byId["tx-approval"]).toMatchObject({
      category: "retry_after_approval",
      policy: "customer-refund@1.2.0",
      matchedRuleId: "reject-manager-approval-required",
    });
    expect(byId["tx-final"].category).toBe("final_refusal");
    expect(byId["tx-review"].category).toBe("manual_review");
    expect(byId["tx-missing"].category).toBe("not_found");
  });

  it("sends to manual review when the approval signal is true, not false", async () => {
    records["tx-approved-anyway"] = {
      refusalRecordId: "r-4",
      createdAt: "2026-11-01T00:00:00Z",
      decision: {
        policy: { name: "customer-refund", version: "1.2.0" },
        matchedRuleId: "reject-manager-approval-required",
        reason: "x",
        signals: { refundEligible: true, fraudCheckPassed: true, managerApproved: true },
      },
    };
    const dir = await mkdtemp(join(tmpdir(), "refusals-"));
    const ids = join(dir, "ids.txt");
    const out = join(dir, "report.json");
    await writeFile(ids, "tx-approved-anyway\n");

    await run([ids, "--out", out], { PARMANA_BASE_URL: baseUrl, PARMANA_API_KEY: KEY });

    const report = JSON.parse(await readFile(out, "utf8"));
    expect(report.rows[0].category).toBe("manual_review");
  });

  it("uses only GET requests", () => {
    expect(methodsSeen.length).toBeGreaterThan(0);
    expect(methodsSeen.every((m) => m === "GET")).toBe(true);
  });

  it("refuses to run without an API key, and does not print one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "refusals-"));
    const ids = join(dir, "ids.txt");
    await writeFile(ids, "tx-approval\n");

    const result = await run([ids], {
      PARMANA_BASE_URL: baseUrl,
      PARMANA_API_KEY: "",
    });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("PARMANA_API_KEY is not set");
  });

  it("reports a wrong key as lookup_failed, not as a refusal", async () => {
    const dir = await mkdtemp(join(tmpdir(), "refusals-"));
    const ids = join(dir, "ids.txt");
    const out = join(dir, "report.json");
    await writeFile(ids, "tx-approval\n");

    await run([ids, "--out", out], {
      PARMANA_BASE_URL: baseUrl,
      PARMANA_API_KEY: "wrong-key",
    });

    const report = JSON.parse(await readFile(out, "utf8"));
    expect(report.rows[0].category).toBe("lookup_failed");
    expect(report.rows[0].httpStatus).toBe(401);
    expect(await readFile(out, "utf8")).not.toContain("wrong-key");
  });
});
