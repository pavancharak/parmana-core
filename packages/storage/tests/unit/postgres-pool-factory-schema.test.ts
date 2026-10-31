import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A real class, not vi.fn with an arrow function: `new Pool(...)` needs a
 * constructor (see postgres-pool-factory.test.ts for the same pattern).
 */
function createPoolMock() {
  class PoolMock {
    options: unknown;
    connect = () => Promise.resolve({ release: () => {} });

    constructor(options: unknown) {
      this.options = options;
    }
  }

  return vi.fn(PoolMock);
}

describe("PostgresPoolFactory schema setting", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalSchema = process.env.PARMANA_DB_SCHEMA;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }

    if (originalSchema === undefined) {
      delete process.env.PARMANA_DB_SCHEMA;
    } else {
      process.env.PARMANA_DB_SCHEMA = originalSchema;
    }

    vi.doUnmock("pg");
    vi.resetModules();
  });

  async function loadFactoryWith(schema: string | undefined) {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

    if (schema === undefined) {
      delete process.env.PARMANA_DB_SCHEMA;
    } else {
      process.env.PARMANA_DB_SCHEMA = schema;
    }

    const PoolMock = createPoolMock();

    vi.doMock("pg", () => ({ Pool: PoolMock }));
    vi.resetModules();

    const { PostgresPoolFactory } =
      await import("../../src/postgres/PostgresPoolFactory.js");

    return { PoolMock, PostgresPoolFactory };
  }

  it("sets the search path on the connection when PARMANA_DB_SCHEMA names a schema", async () => {
    const { PoolMock, PostgresPoolFactory } =
      await loadFactoryWith("parmana_sandbox");

    PostgresPoolFactory.create();

    expect(PoolMock).toHaveBeenCalledWith(
      expect.objectContaining({ options: "-c search_path=parmana_sandbox" }),
    );
  });

  it("leaves the connection options unchanged when PARMANA_DB_SCHEMA is unset", async () => {
    const { PoolMock, PostgresPoolFactory } = await loadFactoryWith(undefined);

    PostgresPoolFactory.create();

    expect(PoolMock.mock.calls[0]?.[0]).not.toHaveProperty("options");
  });

  it("treats an empty PARMANA_DB_SCHEMA as unset, because deploy tools often leave it blank", async () => {
    const { PoolMock, PostgresPoolFactory } = await loadFactoryWith("");

    PostgresPoolFactory.create();

    expect(PoolMock.mock.calls[0]?.[0]).not.toHaveProperty("options");
  });

  it.each([
    ["a name with a space", "parmana sandbox"],
    ["a name with a semicolon", "parmana;DROP"],
    ["an uppercase name", "Parmana"],
    ["a name starting with a digit", "1sandbox"],
  ])(
    "refuses %s, so it never reaches the connection string",
    async (_label, schema) => {
      const { PostgresPoolFactory } = await loadFactoryWith(schema);

      expect(() => PostgresPoolFactory.create()).toThrow(
        "PARMANA_DB_SCHEMA must be a plain Postgres name, such as parmana_sandbox.",
      );
    },
  );
});
