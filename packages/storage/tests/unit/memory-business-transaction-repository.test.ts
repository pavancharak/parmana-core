import { describe, expect, it } from "vitest";

import { DuplicateBusinessTransactionError } from "@parmana/shared";

import { MemoryBusinessTransactionRepository } from "../../src/memory/MemoryBusinessTransactionRepository.js";

import { buildBusinessTransaction } from "../fixtures/multi-item-trust-record.js";

describe("MemoryBusinessTransactionRepository (G-1)", () => {
  it("creates a transaction that does not yet exist", async () => {
    const repository = new MemoryBusinessTransactionRepository();
    const transaction = buildBusinessTransaction("txn-1");

    await expect(repository.create(transaction)).resolves.toEqual(transaction);
  });

  it("rejects a sequential duplicate with DuplicateBusinessTransactionError, without overwriting the first write", async () => {
    const repository = new MemoryBusinessTransactionRepository();
    const first = buildBusinessTransaction("txn-1");
    const second = {
      ...buildBusinessTransaction("txn-1"),
      signals: { amount: 999 },
    };

    await repository.create(first);

    await expect(repository.create(second)).rejects.toBeInstanceOf(
      DuplicateBusinessTransactionError,
    );

    const stored = await repository.findById("txn-1");
    expect(stored).toEqual(first);
  });

  it("(concurrency — proves G-1 closed) two simultaneous create() calls with the same id and different content: exactly one succeeds, the other rejects with the typed duplicate error, and no silent overwrite occurs", async () => {
    const repository = new MemoryBusinessTransactionRepository();

    const first = buildBusinessTransaction("txn-race");
    const second = {
      ...buildBusinessTransaction("txn-race"),
      signals: { amount: 999 },
    };

    const results = await Promise.allSettled([
      repository.create(first),
      repository.create(second),
    ]);

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<typeof first> =>
        r.status === "fulfilled",
    );
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    expect(rejected[0].reason).toBeInstanceOf(
      DuplicateBusinessTransactionError,
    );

    // Whichever one won, the stored record must be exactly that one's
    // content, not a merge and not the loser's — the storage-layer
    // guard rejects the loser before any write happens, so there is
    // nothing to overwrite.
    const stored = await repository.findById("txn-race");
    expect(stored).toEqual(fulfilled[0].value);
  });
});
