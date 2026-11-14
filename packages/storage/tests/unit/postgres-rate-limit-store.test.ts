import { describe, expect, it, vi } from "vitest";

import { PostgresRateLimitStore } from "../../src/postgres/PostgresRateLimitStore.js";

/**
 * Regression coverage for the prefix parameter (found 2026-09-15):
 * express-rate-limit v8 refuses to let one Store instance back more
 * than one limiter, so the execute and health/ready limiters each get
 * their own PostgresRateLimitStore instance sharing one Pool/table --
 * prefix is what keeps their keys from colliding.
 */
describe("PostgresRateLimitStore prefix", () => {
  function fakePool() {
    const query = vi.fn().mockResolvedValue({
      rows: [{ count: 1, reset_time: new Date() }],
    });
    return { query } as unknown as import("pg").Pool;
  }

  it("prepends the prefix to the key on increment()", async () => {
    const pool = fakePool();
    const store = new PostgresRateLimitStore(pool, "execute:");

    await store.increment("caller-a");

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO rate_limit_counters"),
      ["execute:caller-a", expect.any(Date), expect.any(Number)],
    );
  });

  it("prepends the prefix to the key on get()/decrement()/resetKey()", async () => {
    const pool = fakePool();
    const store = new PostgresRateLimitStore(pool, "health:");

    await store.get("127.0.0.1");
    await store.decrement("127.0.0.1");
    await store.resetKey("127.0.0.1");

    for (const call of (pool.query as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[1]).toEqual(["health:127.0.0.1"]);
    }
  });

  it("defaults to no prefix (empty string) when omitted, unchanged from before this parameter existed", async () => {
    const pool = fakePool();
    const store = new PostgresRateLimitStore(pool);

    await store.increment("caller-a");

    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [
      "caller-a",
      expect.any(Date),
      expect.any(Number),
    ]);
  });
});

/**
 * Regression coverage for the outage drill (Fault 1): when the database
 * connection is cut, express-rate-limit's post-response decrement() must
 * not reject, because nothing handles that rejection and it used to exit
 * the process. increment() must still reject so new requests fail closed.
 */
describe("PostgresRateLimitStore during a database outage", () => {
  function brokenPool() {
    const query = vi
      .fn()
      .mockRejectedValue(new Error("Connection terminated unexpectedly"));
    return { query } as unknown as import("pg").Pool;
  }

  it("resolves decrement() when the database fails, and logs the failure", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new PostgresRateLimitStore(brokenPool(), "execute:");

    await expect(store.decrement("caller-a")).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("rate_limit_decrement_failed"),
    );
    errorSpy.mockRestore();
  });

  it("still rejects increment() when the database fails, so requests fail closed", async () => {
    const store = new PostgresRateLimitStore(brokenPool(), "execute:");

    await expect(store.increment("caller-a")).rejects.toThrow(
      "Connection terminated unexpectedly",
    );
  });
});
