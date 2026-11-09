import { describe, expect, it } from "vitest";

import {
  describeDatabaseTarget,
  resolveDatabaseTarget,
} from "../../test-support/database-target.js";

// Test 11 (docs/internal/designs/TEST-DATABASE-CONFIG.md): the run log names the project and never prints the password.
const SANDBOX = "sandboxref0000000000";
const SECRET = "s3cret-pass";
const url = `postgresql://postgres.${SANDBOX}:${SECRET}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`;

describe("describeDatabaseTarget", () => {
  it("names the project for a hosted target and never prints the connection string", () => {
    const target = resolveDatabaseTarget({
      TEST_DATABASE_URL: url,
      PARMANA_TEST_PROJECT_REFS: SANDBOX,
      ALLOW_LIVE_SUPABASE: "1",
    });

    const line = describeDatabaseTarget(target);

    expect(line).toBe(`[test-database] hosted project ${SANDBOX}`);
    expect(line).not.toContain(SECRET);
    expect(line).not.toContain("postgresql://");
  });

  it("says a local database is in use, without a URL", () => {
    const target = resolveDatabaseTarget({
      TEST_DATABASE_URL: "postgresql://u:p@127.0.0.1:55432/x",
    });

    expect(describeDatabaseTarget(target)).toBe(
      "[test-database] local database",
    );
  });

  it("says database suites will skip when nothing is configured", () => {
    expect(describeDatabaseTarget({ kind: "none" })).toBe(
      "[test-database] no database configured; database suites skip",
    );
  });
});
