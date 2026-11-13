import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PostgresPoolFactory } from "../../src/postgres/PostgresPoolFactory.js";

/**
 * An idle client that loses its connection emits 'error' on the pool.
 * With no listener, Node throws that event as an unhandled error and the
 * API process exits. This test checks that the pool has a listener, so a
 * dropped connection is logged instead.
 */
describe("PostgresPoolFactory: a dropped idle connection", () => {
  let previousUrl: string | undefined;

  beforeEach(() => {
    previousUrl = process.env.DATABASE_URL;
    // A loopback port nothing listens on: the warm-up connect fails quietly.
    process.env.DATABASE_URL = "postgresql://parmana:x@127.0.0.1:1/parmana";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    if (previousUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousUrl;
    }
  });

  it("has an error listener, so an idle connection error does not throw", async () => {
    const pool = PostgresPoolFactory.create();

    expect(pool.listenerCount("error")).toBeGreaterThan(0);
    expect(() =>
      pool.emit("error", new Error("Connection terminated unexpectedly")),
    ).not.toThrow();

    await pool.end().catch(() => undefined);
  });

  it("logs the error without the connection string", async () => {
    const pool = PostgresPoolFactory.create();

    pool.emit("error", new Error("Connection terminated unexpectedly"));

    const logged = vi
      .mocked(console.error)
      .mock.calls.map((call) => String(call[0]))
      .join("\n");

    expect(logged).toContain("postgres_pool_idle_client_error");
    expect(logged).not.toContain("parmana:x");

    await pool.end().catch(() => undefined);
  });
});
