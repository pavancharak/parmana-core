import { describe, expect, it } from "vitest";

import {
  exportTrustRecordsInWindow,
  type WindowExportTransaction,
} from "../../src/services/trust-record-window-export.js";

interface Tx extends WindowExportTransaction {
  readonly submittedBy: string;
}

/** Newest first, matching the Supabase LIST_SQL ordering. */
function makeTransactions(
  count: number,
  startMs: number,
  stepMs: number,
): Tx[] {
  const rows: Tx[] = [];

  for (let i = 0; i < count; i++) {
    rows.push({
      businessTransactionId: `tx-${i}`,
      createdAt: new Date(startMs - i * stepMs),
      submittedBy: i % 2 === 0 ? "caller-a" : "caller-b",
    });
  }

  return rows;
}

function sourceOver(all: readonly Tx[]) {
  return {
    listPage: async (page: number, pageSize: number) =>
      all.slice((page - 1) * pageSize, page * pageSize),
    resolve: async (tx: Tx) => ({ id: tx.businessTransactionId }),
  };
}

describe("exportTrustRecordsInWindow", () => {
  const HOUR = 3_600_000;
  const BASE = Date.parse("2026-11-01T00:00:00.000Z");

  it("returns every record in a window that spans several pages", async () => {
    // 250 transactions, one per hour, newest first. pageSize 100 means
    // the window below crosses pages 1, 2 and 3.
    const all = makeTransactions(250, BASE, HOUR);
    const since = new Date(BASE - 199 * HOUR);
    const until = new Date(BASE - 50 * HOUR);

    const result = await exportTrustRecordsInWindow(sourceOver(all), {
      since,
      until,
      pageSize: 100,
    });

    const expected = all
      .filter((tx) => {
        const t = new Date(tx.createdAt).getTime();
        return t >= since.getTime() && t <= until.getTime();
      })
      .map((tx) => tx.businessTransactionId);

    expect(result.truncated).toBe(false);
    expect(result.records.map((r) => r.id)).toEqual(expected);
    expect(result.records.length).toBe(150);
  });

  it("includes records exactly on both boundaries", async () => {
    const all = makeTransactions(5, BASE, HOUR);
    const result = await exportTrustRecordsInWindow(sourceOver(all), {
      since: all[3]!.createdAt as Date,
      until: all[1]!.createdAt as Date,
      pageSize: 100,
    });

    expect(result.records.map((r) => r.id)).toEqual(["tx-1", "tx-2", "tx-3"]);
  });

  it("applies the caller scope before resolving records", async () => {
    const all = makeTransactions(10, BASE, HOUR);
    const resolved: string[] = [];

    const result = await exportTrustRecordsInWindow(
      {
        listPage: sourceOver(all).listPage,
        include: (tx: Tx) => tx.submittedBy === "caller-a",
        resolve: async (tx: Tx) => {
          resolved.push(tx.businessTransactionId);
          return { id: tx.businessTransactionId };
        },
      },
      { pageSize: 100 },
    );

    // Even indexes belong to caller-a. Only those are resolved at all.
    const evenIds = all
      .filter((tx) => tx.submittedBy === "caller-a")
      .map((tx) => tx.businessTransactionId);
    expect(resolved).toEqual(evenIds);
    expect(result.records.map((r) => r.id)).toEqual(evenIds);
  });

  it("reports truncation instead of returning a partial export", async () => {
    // 500 transactions, scan limited to 2 pages of 100. The window
    // reaches back to the start, so records exist beyond the scan.
    const all = makeTransactions(500, BASE, HOUR);

    const result = await exportTrustRecordsInWindow(sourceOver(all), {
      since: new Date(0),
      pageSize: 100,
      maxPages: 2,
    });

    expect(result.truncated).toBe(true);
    expect(result.scannedPages).toBe(2);
  });

  it("reports truncation when the scan ends on a full page", async () => {
    const all = makeTransactions(200, BASE, HOUR);

    const result = await exportTrustRecordsInWindow(sourceOver(all), {
      pageSize: 100,
      maxPages: 2,
    });

    // Page 2 is full, so the scan cannot prove there is nothing on page 3.
    // It must report truncated, not silently claim completeness.
    expect(result.truncated).toBe(true);
    expect(result.records.length).toBe(200);
  });

  it("skips transactions whose record is not yet resolvable", async () => {
    const all = makeTransactions(4, BASE, HOUR);

    const result = await exportTrustRecordsInWindow(
      {
        listPage: sourceOver(all).listPage,
        resolve: async (tx: Tx) =>
          tx.businessTransactionId === "tx-2"
            ? null
            : { id: tx.businessTransactionId },
      },
      { pageSize: 100 },
    );

    expect(result.records.map((r) => r.id)).toEqual(["tx-0", "tx-1", "tx-3"]);
  });
});
