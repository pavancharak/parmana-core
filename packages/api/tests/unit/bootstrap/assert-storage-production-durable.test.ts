import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertStorageConfigured } from "../../../src/bootstrap/assertStorageConfigured.js";

// Startup must refuse non-durable storage in production. The check runs
// before the port is bound, so a misconfigured process never serves requests.
describe("assertStorageConfigured in production", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses to start when PARMANA_STORAGE is unset (memory, the default)", () => {
    const saved = process.env.PARMANA_STORAGE;
    delete process.env.PARMANA_STORAGE;
    try {
      expect(() => assertStorageConfigured()).toThrow(/memory/);
    } finally {
      if (saved !== undefined) process.env.PARMANA_STORAGE = saved;
    }
  });

  it("refuses an explicit PARMANA_STORAGE=memory", () => {
    vi.stubEnv("PARMANA_STORAGE", "memory");
    expect(() => assertStorageConfigured()).toThrow(/not durable/);
  });
});
