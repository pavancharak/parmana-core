import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadTestEnvironment } from "../../test-support/load-test-environment.js";

// Test 9 (docs/internal/designs/TEST-DATABASE-CONFIG.md): a DATABASE_URL in .env does not reach a test run.
const KEYS = [
  "DATABASE_URL",
  "TEST_DATABASE_URL",
  "SENTINEL_TEST_KEY",
] as const;
const SENTINEL = "postgresql://sentinel-from-env-file";

describe("loadTestEnvironment", () => {
  let dir: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "load-test-env-"));
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not read .env, so a production value in it never reaches a test", () => {
    writeFileSync(
      join(dir, ".env"),
      `DATABASE_URL=${SENTINEL}\nSENTINEL_TEST_KEY=from-env\n`,
    );

    loadTestEnvironment(dir);

    expect(process.env.DATABASE_URL).toBeUndefined();
    expect(process.env.SENTINEL_TEST_KEY).toBeUndefined();
  });

  it("reads .env.test", () => {
    writeFileSync(join(dir, ".env.test"), "SENTINEL_TEST_KEY=from-test-file\n");

    loadTestEnvironment(dir);

    expect(process.env.SENTINEL_TEST_KEY).toBe("from-test-file");
  });

  it("does not let .env.test override a value already set in the shell", () => {
    process.env.SENTINEL_TEST_KEY = "from-shell";
    writeFileSync(join(dir, ".env.test"), "SENTINEL_TEST_KEY=from-test-file\n");

    loadTestEnvironment(dir);

    expect(process.env.SENTINEL_TEST_KEY).toBe("from-shell");
  });
});
