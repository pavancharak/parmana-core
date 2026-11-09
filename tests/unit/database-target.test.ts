import { describe, expect, it } from "vitest";

import {
  parseProjectRefs,
  projectRefOf,
  resolveDatabaseTarget,
} from "../../test-support/database-target.js";

// Made-up project IDs. Real project IDs are never written to the repository.
const SANDBOX = "sandboxref0000000000";
const OTHER = "otherref00000000000";
const PRODUCTION = "prodref000000000000";
const SECRET = "s3cret-pass";

const hosted = (ref: string) =>
  `postgresql://postgres.${ref}:${SECRET}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`;
const direct = (ref: string) =>
  `postgresql://postgres:${SECRET}@db.${ref}.supabase.co:5432/postgres`;

describe("parseProjectRefs", () => {
  it("splits, trims and drops blanks", () => {
    expect(parseProjectRefs(" a , ,b,")).toEqual(["a", "b"]);
    expect(parseProjectRefs(undefined)).toEqual([]);
    expect(parseProjectRefs("")).toEqual([]);
  });
});

describe("projectRefOf", () => {
  it("reads the ref from the direct host and from the pooler user", () => {
    expect(projectRefOf(direct(SANDBOX))).toBe(SANDBOX);
    expect(projectRefOf(hosted(SANDBOX))).toBe(SANDBOX);
  });

  it("returns undefined for a string that is not a URL, or names no project", () => {
    expect(projectRefOf("not a url")).toBeUndefined();
    expect(
      projectRefOf("postgresql://user:pw@example.com:5432/db"),
    ).toBeUndefined();
  });
});

describe("resolveDatabaseTarget", () => {
  // Test 1: no test database URL.
  it("returns none when no URL is set", () => {
    expect(resolveDatabaseTarget({})).toEqual({ kind: "none" });
    expect(resolveDatabaseTarget({ TEST_DATABASE_URL: "   " })).toEqual({
      kind: "none",
    });
  });

  // Test 2: local host, no opt-in needed.
  it("returns local for a loopback host without any opt-in", () => {
    const url = "postgresql://parmana:x@127.0.0.1:55432/parmana";
    expect(resolveDatabaseTarget({ TEST_DATABASE_URL: url })).toEqual({
      kind: "local",
      url,
    });
  });

  // Test 3: hosted, allowlisted, opted in.
  it("returns hosted with the project ID for an allowlisted project with the opt-in", () => {
    const env = {
      TEST_DATABASE_URL: hosted(SANDBOX),
      PARMANA_TEST_PROJECT_REFS: SANDBOX,
      ALLOW_LIVE_SUPABASE: "1",
    };
    expect(resolveDatabaseTarget(env)).toEqual({
      kind: "hosted",
      url: hosted(SANDBOX),
      projectRef: SANDBOX,
    });
  });

  // Test 4: hosted, not allowlisted.
  it("refuses a hosted project that is not on the allowlist", () => {
    const env = {
      TEST_DATABASE_URL: hosted(OTHER),
      PARMANA_TEST_PROJECT_REFS: SANDBOX,
      ALLOW_LIVE_SUPABASE: "1",
    };
    expect(() => resolveDatabaseTarget(env)).toThrow(
      /not on PARMANA_TEST_PROJECT_REFS/,
    );
  });

  // Test 5: allowlisted and also production.
  it("refuses a project that is both allowlisted and listed as production", () => {
    const env = {
      TEST_DATABASE_URL: hosted(PRODUCTION),
      PARMANA_TEST_PROJECT_REFS: `${SANDBOX},${PRODUCTION}`,
      PARMANA_PRODUCTION_PROJECT_REFS: PRODUCTION,
      ALLOW_LIVE_SUPABASE: "1",
    };
    expect(() => resolveDatabaseTarget(env)).toThrow(/production project/);
  });

  // Test 6: hosted, allowlisted, no opt-in.
  it("refuses a hosted project without ALLOW_LIVE_SUPABASE=1", () => {
    const env = {
      TEST_DATABASE_URL: hosted(SANDBOX),
      PARMANA_TEST_PROJECT_REFS: SANDBOX,
    };
    expect(() => resolveDatabaseTarget(env)).toThrow(/ALLOW_LIVE_SUPABASE=1/);
    expect(() =>
      resolveDatabaseTarget({ ...env, ALLOW_LIVE_SUPABASE: "true" }),
    ).toThrow(/ALLOW_LIVE_SUPABASE=1/);
  });

  // Test 7: empty allowlist fails closed.
  it("refuses every hosted target when the allowlist is empty", () => {
    const env = {
      TEST_DATABASE_URL: hosted(SANDBOX),
      ALLOW_LIVE_SUPABASE: "1",
    };
    expect(() => resolveDatabaseTarget(env)).toThrow(
      /PARMANA_TEST_PROJECT_REFS is empty/,
    );
  });

  // Test 8: malformed URL, and the message must not contain the password.
  it("refuses a malformed URL without echoing it", () => {
    const bad = `postgresql://postgres:${SECRET}@[broken`;
    let message = "";
    try {
      resolveDatabaseTarget({ TEST_DATABASE_URL: bad });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/not a valid URL/);
    expect(message).not.toContain(SECRET);
  });

  it("refuses a hosted URL that names no project, without echoing the password", () => {
    const env = {
      TEST_DATABASE_URL: `postgresql://postgres:${SECRET}@example.com:5432/db`,
      PARMANA_TEST_PROJECT_REFS: SANDBOX,
      ALLOW_LIVE_SUPABASE: "1",
    };
    let message = "";
    try {
      resolveDatabaseTarget(env);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/does not name a Supabase project/);
    expect(message).not.toContain(SECRET);
  });

  it("treats an empty TEST_DATABASE_URL as unset, so DATABASE_URL is used", () => {
    const env = {
      TEST_DATABASE_URL: "",
      DATABASE_URL: hosted(SANDBOX),
      PARMANA_TEST_PROJECT_REFS: SANDBOX,
      ALLOW_LIVE_SUPABASE: "1",
    };
    expect(resolveDatabaseTarget(env)).toMatchObject({
      kind: "hosted",
      projectRef: SANDBOX,
    });
  });

  it("uses DATABASE_URL only when TEST_DATABASE_URL is unset", () => {
    const env = {
      DATABASE_URL: hosted(SANDBOX),
      PARMANA_TEST_PROJECT_REFS: SANDBOX,
      ALLOW_LIVE_SUPABASE: "1",
    };
    expect(resolveDatabaseTarget(env)).toMatchObject({
      kind: "hosted",
      projectRef: SANDBOX,
    });
    expect(
      resolveDatabaseTarget({
        ...env,
        TEST_DATABASE_URL: "postgresql://u:p@127.0.0.1:1/x",
      }),
    ).toMatchObject({ kind: "local" });
  });
});
