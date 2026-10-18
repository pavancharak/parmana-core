import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveSupabaseGate } from "../helpers/supabase-availability.js";

/**
 * Mirrors packages/api/tests/unit/supabase-availability.test.ts — this
 * package keeps its own local copy of the helper (see that file's
 * comment for why), so it needs its own coverage of the G-3 guard.
 */
describe("resolveSupabaseGate", () => {
  const ORIGINAL_ENV = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    ALLOW_LIVE_SUPABASE: process.env.ALLOW_LIVE_SUPABASE,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("(case a) returns false and does not throw, logging the skip reason, when SUPABASE_* is configured without the opt-in", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    delete process.env.ALLOW_LIVE_SUPABASE;

    expect(resolveSupabaseGate("Some Suite")).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(
      "Some Suite: Supabase credentials configured but " +
        "ALLOW_LIVE_SUPABASE=1 not set — skipping live suite. Set " +
        "ALLOW_LIVE_SUPABASE=1 to run it.",
    );

    logSpy.mockRestore();
  });

  it("(case b) returns false and does not throw when no SUPABASE_* is configured", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.ALLOW_LIVE_SUPABASE;

    expect(resolveSupabaseGate("Some Suite")).toBe(false);
  });

  it("(case c) returns true and does not throw when SUPABASE_* is configured and ALLOW_LIVE_SUPABASE=1", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "test-anon-key";
    process.env.ALLOW_LIVE_SUPABASE = "1";

    expect(resolveSupabaseGate("Some Suite")).toBe(true);
  });

  it("(case d, G-14) throws naming broken env loading when ALLOW_LIVE_SUPABASE=1 is set but SUPABASE_* is not visible", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    process.env.ALLOW_LIVE_SUPABASE = "1";

    expect(() => resolveSupabaseGate("Some Suite")).toThrow(
      /env loading is broken/,
    );
  });
});
