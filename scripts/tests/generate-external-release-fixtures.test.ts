import { execFileSync } from "node:child_process";
import { createPublicKey, verify } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CanonicalSerializer, commitmentMessage } from "@parmana/crypto";

import { EXTERNAL_RELEASE_TTL_MS } from "../../packages/execution-gateway/src/connector-execution/GatewayExternalAdapter.js";

const SCRIPT = path.join(
  __dirname,
  "..",
  "generate-external-release-fixtures.ts",
);

function generate(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "external-release-fixtures-"));
  execFileSync(process.execPath, ["--import", "tsx", SCRIPT, dir], {
    stdio: "pipe",
  });
  return dir;
}

function load(dir: string, name: string) {
  return JSON.parse(readFileSync(path.join(dir, name), "utf8")) as {
    release: { issuedAt: string; expiresAt: string };
    signature: { algorithm: string; keyId: string; value: string };
    commitment: boolean;
  };
}

describe("generate-external-release-fixtures", () => {
  it("writes releases whose lifetime is within the adapter's TTL", () => {
    const dir = generate();
    for (const name of ["core-release-small.json", "core-release-large.json"]) {
      const fixture = load(dir, name);
      const lifetime =
        Date.parse(fixture.release.expiresAt) -
        Date.parse(fixture.release.issuedAt);
      expect(lifetime).toBeGreaterThan(0);
      expect(lifetime).toBeLessThanOrEqual(EXTERNAL_RELEASE_TTL_MS);
    }
  });

  it("signs the small release raw and the large one as a commitment", () => {
    const dir = generate();
    expect(load(dir, "core-release-small.json").commitment).toBe(false);
    expect(load(dir, "core-release-large.json").commitment).toBe(true);
  });

  it("produces signatures that verify under the public key it writes", () => {
    const dir = generate();
    const publicKey = createPublicKey(
      readFileSync(path.join(dir, "core-public-key.txt"), "utf8"),
    );

    for (const name of ["core-release-small.json", "core-release-large.json"]) {
      const fixture = load(dir, name);
      const bytes = Buffer.from(
        new CanonicalSerializer().serialize(fixture.release as never),
      );
      const message = fixture.commitment
        ? Buffer.from(commitmentMessage(bytes))
        : bytes;
      expect(
        verify(
          null,
          message,
          publicKey,
          Buffer.from(fixture.signature.value, "base64"),
        ),
      ).toBe(true);
      expect(fixture.signature.keyId).toBe("default");
    }
  });

  it("is deterministic, so regenerating does not change the committed fixtures", () => {
    const first = generate();
    const second = generate();
    for (const name of [
      "core-release-small.json",
      "core-release-large.json",
      "core-public-key.txt",
    ]) {
      expect(readFileSync(path.join(first, name), "utf8")).toBe(
        readFileSync(path.join(second, name), "utf8"),
      );
    }
  });
});
