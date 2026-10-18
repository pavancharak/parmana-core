import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * G-15 (docs/VERIFICATION-GAPS.md): repositories.ts used to call
 * StorageFactory.createFromEnvironment() as a module-scope side effect,
 * so merely importing it — which every packages/api test file does
 * transitively via ../src/application.js — constructed whatever
 * PARMANA_STORAGE named, live Supabase client included. Construction
 * must now be deferred to first repository use.
 */
describe("repositories.ts", () => {
  afterEach(() => {
    vi.doUnmock("@parmana/storage");
    vi.resetModules();
  });

  it("(G-15) importing the module performs no storage construction", async () => {
    const createFromEnvironment = vi.fn();

    vi.doMock("@parmana/storage", async () => {
      const actual =
        await vi.importActual<typeof import("@parmana/storage")>(
          "@parmana/storage",
        );

      return {
        ...actual,
        StorageFactory: { createFromEnvironment },
      };
    });

    vi.resetModules();

    await import("../../src/repositories.js");

    expect(createFromEnvironment).not.toHaveBeenCalled();
  });

  it("(G-15) constructs storage lazily on first repository property access, and only once", async () => {
    const provider = {
      businessTransactions: { marker: "business-transactions" },
      trustRecords: { marker: "trust-records" },
    };
    const createFromEnvironment = vi.fn(() => provider);

    vi.doMock("@parmana/storage", async () => {
      const actual =
        await vi.importActual<typeof import("@parmana/storage")>(
          "@parmana/storage",
        );

      return {
        ...actual,
        StorageFactory: { createFromEnvironment },
      };
    });

    vi.resetModules();

    const { businessTransactionRepository, executionTrustRecordRepository } =
      await import("../../src/repositories.js");

    expect(createFromEnvironment).not.toHaveBeenCalled();

    expect(
      (businessTransactionRepository as unknown as { marker: string }).marker,
    ).toBe("business-transactions");
    expect(createFromEnvironment).toHaveBeenCalledTimes(1);

    expect(
      (executionTrustRecordRepository as unknown as { marker: string }).marker,
    ).toBe("trust-records");
    expect(createFromEnvironment).toHaveBeenCalledTimes(1);
  });
});
