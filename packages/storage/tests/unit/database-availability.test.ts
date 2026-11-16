import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

// Test 10 (docs/internal/designs/TEST-DATABASE-CONFIG.md): with the opt-in set and no test URL, the suite fails
// rather than skipping. Without the opt-in, a configured URL skips. Both set, the suite runs.
const KEYS = [
  "TEST_DATABASE_URL",
  "ALLOW_LIVE_SUPABASE",
  "PARMANA_REQUIRE_DATABASE",
] as const;

describe("resolveDatabaseGate", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
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
  });

  it("fails when the opt-in is set but no test URL is visible, rather than skipping", () => {
    process.env.ALLOW_LIVE_SUPABASE = "1";

    expect(() => resolveDatabaseGate("suite")).toThrow(
      /refusing to silently skip/,
    );
  });

  it("skips when a test URL is configured but the opt-in is not set", () => {
    process.env.TEST_DATABASE_URL = "postgresql://u:p@127.0.0.1:1/x";

    expect(resolveDatabaseGate("suite")).toBe(false);
  });

  it("skips when nothing is configured", () => {
    expect(resolveDatabaseGate("suite")).toBe(false);
  });

  it("runs when both the URL and the opt-in are set", () => {
    process.env.TEST_DATABASE_URL = "postgresql://u:p@127.0.0.1:1/x";
    process.env.ALLOW_LIVE_SUPABASE = "1";

    expect(resolveDatabaseGate("suite")).toBe(true);
  });
});

describe("resolveDatabaseGate with PARMANA_REQUIRE_DATABASE=1 (CI)", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    process.env.PARMANA_REQUIRE_DATABASE = "1";
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("fails, rather than skipping, when no database is configured", () => {
    expect(() => resolveDatabaseGate("suite")).toThrow(
      /must run, but TEST_DATABASE_URL is not set/,
    );
  });

  it("fails, rather than skipping, when a URL is set but the opt-in is not", () => {
    process.env.TEST_DATABASE_URL = "postgresql://u:p@127.0.0.1:1/x";

    expect(() => resolveDatabaseGate("suite")).toThrow(
      /must run, but ALLOW_LIVE_SUPABASE=1 is not set/,
    );
  });

  it("runs when both the URL and the opt-in are set", () => {
    process.env.TEST_DATABASE_URL = "postgresql://u:p@127.0.0.1:1/x";
    process.env.ALLOW_LIVE_SUPABASE = "1";

    expect(resolveDatabaseGate("suite")).toBe(true);
  });

  it("still skips on a machine where the flag is not set", () => {
    delete process.env.PARMANA_REQUIRE_DATABASE;

    expect(resolveDatabaseGate("suite")).toBe(false);
  });
});
