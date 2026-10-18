import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createReleaseHandler } from "../examples/07-external-connector-endpoint.js";

/**
 * examples/07-external-connector-endpoint.ts against releases signed by
 * the real server code (scripts/generate-external-release-fixture.ts):
 * the endpoint acts once, answers a repeat with its first answer, and
 * acts on nothing it cannot verify.
 */

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));

let outDir: string;
let release: { release: Record<string, unknown>; signature: object };
let publicKeyPem: string;
let audience: string;
let now: Date;

beforeAll(() => {
  outDir = mkdtempSync(join(tmpdir(), "parmana-endpoint-"));

  const run = spawnSync(
    "npx",
    ["tsx", "scripts/generate-external-release-fixture.ts", outDir],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );

  if (run.status !== 0) {
    throw new Error(`The fixture generator failed:\n${run.stderr}`);
  }

  const read = (name: string) => readFileSync(join(outDir, name), "utf8");

  release = JSON.parse(read("release.json"));
  publicKeyPem = read("public-key.pem");
  const fixture = JSON.parse(read("fixture.json"));
  audience = fixture.audience;
  now = new Date(fixture.now);
}, 120_000);

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

function endpoint() {
  const acted: string[] = [];
  const handle = createReleaseHandler({
    publicKeys: { "external-release-fixture": publicKeyPem },
    audience,
    now: () => now,
    act: async (verified) => {
      acted.push(verified.businessTransactionId);
      return { invoiceId: "INV-1", amount: verified.parameters.amount };
    },
  });

  return { handle, acted };
}

describe("example 07: external connector endpoint", () => {
  it("acts on a verified release and answers what Parmana accepts", async () => {
    const { handle, acted } = endpoint();

    const answer = await handle(release);

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      businessTransactionId: "fixture-bt-1",
      capability: "erp:create-invoice",
      success: true,
      result: { invoiceId: "INV-1", amount: 1200 },
    });
    expect(typeof answer.body.executedAt).toBe("string");
    expect(acted).toEqual(["fixture-bt-1"]);
  });

  it("answers a repeated release with its first answer and acts once", async () => {
    const { handle, acted } = endpoint();

    const first = await handle(release);
    const again = await handle(release);

    expect(again).toEqual(first);
    expect(acted).toEqual(["fixture-bt-1"]);
  });

  it("acts on nothing it cannot verify", async () => {
    const { handle, acted } = endpoint();

    const changed = {
      ...release,
      release: { ...release.release, parameters: { amount: 999999 } },
    };

    for (const body of [changed, { release: {} }, "not json", null]) {
      const answer = await handle(body);

      expect(answer.status).toBe(401);
      expect(Array.isArray(answer.body.errors)).toBe(true);
    }

    expect(acted).toEqual([]);
  });

  it("refuses a release made for another endpoint", async () => {
    const acted: string[] = [];
    const handle = createReleaseHandler({
      publicKeys: { "external-release-fixture": publicKeyPem },
      audience: "https://erp.example.com/another-endpoint",
      now: () => now,
      act: async (verified) => {
        acted.push(verified.businessTransactionId);
        return {};
      },
    });

    const answer = await handle(release);

    expect(answer.status).toBe(401);
    expect(String((answer.body.errors as string[])[0])).toMatch(
      /is not this endpoint/,
    );
    expect(acted).toEqual([]);
  });
});
