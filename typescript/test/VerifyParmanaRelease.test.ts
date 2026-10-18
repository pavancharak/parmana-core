import { spawnSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { canonicalSerialize } from "../src/crypto/canonical.js";
import { verifyParmanaRelease } from "../src/index.js";

/**
 * verifyParmanaRelease against releases signed by the real server code:
 * scripts/generate-external-release-fixture.ts runs GatewayExternalAdapter
 * with the production file signer, and once more signing over the
 * commitment as KmsSigner does for a release over 4096 bytes. This test
 * signs no release itself except to prove a wrong key is refused.
 */

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));

let outDir: string;
let release: Record<string, unknown>;
let largeRelease: Record<string, unknown>;
let publicKeyPem: string;
let audience: string;
let now: Date;

beforeAll(() => {
  outDir = mkdtempSync(join(tmpdir(), "parmana-release-"));

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
    throw new Error(
      `The fixture generator failed:\n${run.stdout}\n${run.stderr}`,
    );
  }

  const read = (name: string) => readFileSync(join(outDir, name), "utf8");

  release = JSON.parse(read("release.json"));
  largeRelease = JSON.parse(read("release-large.json"));
  publicKeyPem = read("public-key.pem");
  const fixture = JSON.parse(read("fixture.json"));
  audience = fixture.audience;
  now = new Date(fixture.now);
}, 120_000);

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

function keys() {
  return { "external-release-fixture": publicKeyPem };
}

function options(overrides: Record<string, unknown> = {}) {
  return {
    publicKeys: keys(),
    audience,
    now,
    isAlreadyExecuted: () => false,
    ...overrides,
  };
}

function withRelease(changes: Record<string, unknown>) {
  return {
    ...release,
    release: { ...(release.release as object), ...changes },
  };
}

describe("verifyParmanaRelease", () => {
  it("accepts a release the server signed, and returns it", async () => {
    const result = await verifyParmanaRelease(release, options());

    expect(result).toMatchObject({
      valid: true,
      alreadyExecuted: false,
      errors: [],
      release: {
        audience,
        businessTransactionId: "fixture-bt-1",
        capability: "erp:create-invoice",
        target: "customer-café-42",
        parameters: { amount: 1200, currency: "INR" },
        approvedBy: [
          {
            approverId: "manager-x",
            keyId: "manager-x-key-1",
            approvalId: "fixture-approval",
          },
        ],
      },
    });
  });

  it("accepts a release over 4096 bytes signed over the commitment, as KMS signs it", async () => {
    expect(canonicalSerialize(largeRelease.release).length).toBeGreaterThan(
      4096,
    );

    const result = await verifyParmanaRelease(largeRelease, options());

    expect(result.valid).toBe(true);
  });

  it("reports a businessTransactionId already executed, asking only after every other check", async () => {
    const asked: string[] = [];
    const isAlreadyExecuted = (id: string) => {
      asked.push(id);
      return Promise.resolve(true);
    };

    expect(
      await verifyParmanaRelease(release, options({ isAlreadyExecuted })),
    ).toMatchObject({ valid: true, alreadyExecuted: true });
    expect(asked).toEqual(["fixture-bt-1"]);

    await verifyParmanaRelease(
      release,
      options({ isAlreadyExecuted, audience: "https://other.example.com/r" }),
    );
    expect(asked).toEqual(["fixture-bt-1"]);
  });

  it("refuses a changed release: the signature no longer verifies", async () => {
    const result = await verifyParmanaRelease(
      withRelease({ parameters: { amount: 999999, currency: "INR" } }),
      options(),
    );

    expect(result).toEqual({
      valid: false,
      errors: ["the signature does not verify"],
    });
  });

  it("refuses a release signed with another key", async () => {
    const other = generateKeyPairSync("ed25519");
    const forged = {
      release: release.release,
      signature: {
        ...(release.signature as object),
        value: sign(
          null,
          canonicalSerialize(release.release),
          other.privateKey,
        ).toString("base64"),
      },
    };

    expect(await verifyParmanaRelease(forged, options())).toMatchObject({
      valid: false,
      errors: ["the signature does not verify"],
    });
  });

  it("refuses a release made for another endpoint", async () => {
    const result = await verifyParmanaRelease(
      release,
      options({ audience: "https://erp.example.com/other" }),
    );

    expect(result).toMatchObject({
      valid: false,
      errors: [
        'release.audience "https://erp.example.com/parmana/release" is not this endpoint (https://erp.example.com/other)',
      ],
    });
  });

  it("refuses an expired release, allowing 30 seconds of clock skew", async () => {
    const expiresAt = Date.parse(
      (release.release as { expiresAt: string }).expiresAt,
    );

    expect(
      (
        await verifyParmanaRelease(
          release,
          options({ now: new Date(expiresAt + 29_000) }),
        )
      ).valid,
    ).toBe(true);

    expect(
      await verifyParmanaRelease(
        release,
        options({ now: new Date(expiresAt + 31_000) }),
      ),
    ).toMatchObject({
      valid: false,
      errors: ["the release expired at 2026-10-01T10:01:00.000Z"],
    });

    expect(
      (
        await verifyParmanaRelease(
          release,
          options({ now: new Date(expiresAt + 31_000), clockSkewSeconds: 60 }),
        )
      ).valid,
    ).toBe(true);
  });

  it("refuses an unknown key id, an unsupported algorithm, and a malformed body without throwing", async () => {
    expect(
      await verifyParmanaRelease(release, options({ publicKeys: {} })),
    ).toMatchObject({
      valid: false,
      errors: ["no public key supplied for keyId external-release-fixture"],
    });

    expect(
      await verifyParmanaRelease(
        {
          ...release,
          signature: {
            ...(release.signature as object),
            algorithm: "ml-dsa-65",
          },
        },
        options(),
      ),
    ).toMatchObject({ valid: false });

    for (const body of [undefined, null, "x", [], { release: {} }]) {
      expect((await verifyParmanaRelease(body, options())).valid).toBe(false);
    }
  });

  it("lists every failed check, in order", async () => {
    const result = await verifyParmanaRelease(
      withRelease({ audience: "https://evil.example.com/r" }),
      options({ now: new Date("2030-01-01T00:00:00.000Z") }),
    );

    expect(result).toEqual({
      valid: false,
      errors: [
        "the signature does not verify",
        `release.audience "https://evil.example.com/r" is not this endpoint (${audience})`,
        "the release expired at 2026-10-01T10:01:00.000Z",
      ],
    });
  });

  it("refuses another release version and missing fields, naming each", async () => {
    const result = await verifyParmanaRelease(
      withRelease({ version: 2, target: undefined, approvedBy: {} }),
      options(),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "release.version is not 1",
        "release.target is not a string",
        "release.approvedBy is not an array",
      ]),
    );
  });

  it("refuses an expiry that is not a date", async () => {
    const result = await verifyParmanaRelease(
      withRelease({ expiresAt: "soon" }),
      options(),
    );

    expect(result.errors).toContain("release.expiresAt is not a date");
  });
});
