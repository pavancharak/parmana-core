import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import { DuplicateBusinessTransactionError } from "@parmana/shared";

import type { StorageProvider } from "../../src/StorageProvider.js";

import {
  buildBusinessTransaction,
  buildSignedMultiExecutionOverrideRecord,
} from "../fixtures/multi-item-trust-record.js";

/**
 * Storage provider contract (ADR-0021, migration step 1).
 *
 * One suite, run against every StorageProvider that claims to implement the
 * core's storage interface. A provider passes only if it satisfies these
 * cases; the suite does not know which backend it is talking to.
 *
 * Every case uses fresh identifiers, so the suite can run against a database
 * that already holds data and does not need truncation between cases.
 *
 * Only behaviour that both the memory and the PostgreSQL providers must share
 * is asserted here. Where the providers differ today, the case is not added
 * until the difference is resolved (see the notes in the migration plan).
 */
export function runStorageProviderContract(
  providerName: string,
  createProvider: () => StorageProvider,
): void {
  describe(`StorageProvider contract: ${providerName}`, () => {
    describe("business transactions", () => {
      it("returns the stored transaction from findById after create", async () => {
        const provider = createProvider();
        const id = `contract-txn-${crypto.randomUUID()}`;
        const transaction = buildBusinessTransaction(id);

        await provider.businessTransactions.create(transaction);

        const found = await provider.businessTransactions.findById(id);

        expect(found).not.toBeNull();
        expect(found?.businessTransactionId).toBe(id);
      });

      it("reports existence accurately", async () => {
        const provider = createProvider();
        const id = `contract-exists-${crypto.randomUUID()}`;

        expect(await provider.businessTransactions.exists(id)).toBe(false);

        await provider.businessTransactions.create(
          buildBusinessTransaction(id),
        );

        expect(await provider.businessTransactions.exists(id)).toBe(true);
      });

      it("returns null from findById for an unknown identifier", async () => {
        const provider = createProvider();

        const found = await provider.businessTransactions.findById(
          `contract-unknown-${crypto.randomUUID()}`,
        );

        expect(found).toBeNull();
      });

      it("rejects a duplicate create with DuplicateBusinessTransactionError and the shared message", async () => {
        const provider = createProvider();
        const id = `contract-dup-${crypto.randomUUID()}`;
        const transaction = buildBusinessTransaction(id);

        await provider.businessTransactions.create(transaction);

        let caught: unknown;
        try {
          await provider.businessTransactions.create(transaction);
        } catch (error) {
          caught = error;
        }

        expect(caught).toBeInstanceOf(DuplicateBusinessTransactionError);
        expect((caught as Error).message).toBe(
          `Business Transaction '${id}' already exists.`,
        );
      });

      it("lets exactly one of two simultaneous creates for the same id succeed", async () => {
        const provider = createProvider();
        const id = `contract-race-${crypto.randomUUID()}`;

        const results = await Promise.allSettled([
          provider.businessTransactions.create(buildBusinessTransaction(id)),
          provider.businessTransactions.create(buildBusinessTransaction(id)),
        ]);

        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );

        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0].reason).toBeInstanceOf(
          DuplicateBusinessTransactionError,
        );
      });

      it("returns at most pageSize items from list, with no repeats within a page", async () => {
        const provider = createProvider();

        for (let i = 0; i < 3; i += 1) {
          await provider.businessTransactions.create(
            buildBusinessTransaction(`contract-list-${crypto.randomUUID()}`),
          );
        }

        const page = await provider.businessTransactions.list(1, 2);

        expect(page.length).toBeLessThanOrEqual(2);

        const ids = page.map((t) => t.businessTransactionId);

        expect(new Set(ids).size).toBe(ids.length);
      });
    });

    describe("execution trust records", () => {
      it("reads back the executions appended after the header is created", async () => {
        const provider = createProvider();
        const id = `contract-trust-${crypto.randomUUID()}`;
        const transaction = buildBusinessTransaction(id);

        await provider.businessTransactions.create(transaction);

        const signed =
          await buildSignedMultiExecutionOverrideRecord(transaction);

        // Production order (packages/runtime): the header is written first,
        // then each Execution is appended. The header is written without
        // children so both adapters start from the same state.
        await provider.trustRecords.create({ ...signed, executions: [] });

        for (const execution of signed.executions) {
          await provider.trustRecords.appendExecution(id, execution);
        }

        const found = await provider.trustRecords.findByTransactionId(id);

        expect(found).not.toBeNull();
        expect(found?.businessTransactionId).toBe(id);
        expect(found?.executions.map((e) => e.executionId)).toEqual(
          signed.executions.map((e) => e.executionId),
        );
      });

      it("returns null from findByTransactionId for a transaction with no record", async () => {
        const provider = createProvider();

        const found = await provider.trustRecords.findByTransactionId(
          `contract-no-record-${crypto.randomUUID()}`,
        );

        expect(found).toBeNull();
      });
    });
  });
}
