import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `new Pool(...)` requires the mock to be usable as a constructor --
 * `vi.fn().mockImplementation(arrowFn)` fails with "is not a
 * constructor" because arrow functions can never be `new`'d,
 * regardless of the vi.fn() wrapper. A real class works.
 */
function createPoolMock(connect: () => Promise<{ release: () => void }>) {
  class PoolMock {
    options: unknown;
    connect: () => Promise<{ release: () => void }>;

    constructor(options: unknown) {
      this.options = options;
      this.connect = connect;
    }
  }

  return vi.fn(PoolMock);
}

describe("PostgresPoolFactory", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }

    vi.doUnmock("pg");
    vi.resetModules();
  });

  it("throws when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();

    const { PostgresPoolFactory } =
      await import("../../src/postgres/PostgresPoolFactory.js");

    expect(() => PostgresPoolFactory.create()).toThrow(
      "DATABASE_URL environment variable is missing.",
    );
  });

  it("creates the pool with warm-connection options (min: 1, keepAlive: true)", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

    const PoolMock = createPoolMock(() =>
      Promise.resolve({ release: vi.fn() }),
    );

    vi.doMock("pg", () => ({ Pool: PoolMock }));
    vi.resetModules();

    const { PostgresPoolFactory } =
      await import("../../src/postgres/PostgresPoolFactory.js");

    PostgresPoolFactory.create();

    expect(PoolMock).toHaveBeenCalledWith({
      connectionString: "postgres://user:pass@localhost:5432/db",
      min: 1,
      keepAlive: true,
      connectionTimeoutMillis: 5000,
    });
  });

  it("returns the same pool instance on repeated calls", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

    vi.doMock("pg", () => ({
      Pool: createPoolMock(() => Promise.resolve({ release: vi.fn() })),
    }));
    vi.resetModules();

    const { PostgresPoolFactory } =
      await import("../../src/postgres/PostgresPoolFactory.js");

    expect(PostgresPoolFactory.create()).toBe(PostgresPoolFactory.create());
  });

  it("primes the pool with an immediate connect+release", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

    const release = vi.fn();
    const connect = vi.fn(() => Promise.resolve({ release }));

    vi.doMock("pg", () => ({ Pool: createPoolMock(connect) }));
    vi.resetModules();

    const { PostgresPoolFactory } =
      await import("../../src/postgres/PostgresPoolFactory.js");

    PostgresPoolFactory.create();

    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(1));
  });

  it("does not throw when the priming connection fails", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

    const connect = vi.fn(() =>
      Promise.reject(new Error("connection refused")),
    );

    vi.doMock("pg", () => ({ Pool: createPoolMock(connect) }));
    vi.resetModules();

    const { PostgresPoolFactory } =
      await import("../../src/postgres/PostgresPoolFactory.js");

    expect(() => PostgresPoolFactory.create()).not.toThrow();

    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
  });
});
