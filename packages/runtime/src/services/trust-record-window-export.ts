/**
 * Bounded, complete export of Execution Trust Records for a time window.
 *
 * The window filter must run before paging. Filtering one page of
 * results after the fact (what GET /trust-records did) silently drops
 * every matching record that falls on a later page, which is the wrong
 * behaviour for an incident export (G-139).
 *
 * This scans transactions page by page, keeps those whose createdAt is
 * inside the window, and resolves only those to their signed records.
 * If the scan reaches maxPages while the last page is still full, more
 * transactions may exist than were examined. The result is then marked
 * `truncated` so the caller can refuse it rather than return a partial
 * export as if it were complete.
 */

export interface WindowExportTransaction {
  readonly businessTransactionId: string;
  readonly createdAt: Date | string;
}

export interface WindowExportOptions {
  readonly since?: Date | undefined;
  readonly until?: Date | undefined;
  readonly pageSize?: number | undefined;
  readonly maxPages?: number | undefined;
}

export interface WindowExportSource<T extends WindowExportTransaction, R> {
  listPage(page: number, pageSize: number): Promise<readonly T[]>;
  /** Applied before any record is resolved, e.g. caller scoping. */
  include?: ((transaction: T) => boolean) | undefined;
  resolve(transaction: T): Promise<R | null>;
}

export interface WindowExportResult<R> {
  readonly records: readonly R[];
  readonly truncated: boolean;
  readonly scannedPages: number;
}

export const DEFAULT_WINDOW_EXPORT_PAGE_SIZE = 100;
export const DEFAULT_WINDOW_EXPORT_MAX_PAGES = 50;

export async function exportTrustRecordsInWindow<
  T extends WindowExportTransaction,
  R,
>(
  source: WindowExportSource<T, R>,
  options: WindowExportOptions = {},
): Promise<WindowExportResult<R>> {
  const pageSize = options.pageSize ?? DEFAULT_WINDOW_EXPORT_PAGE_SIZE;
  const maxPages = options.maxPages ?? DEFAULT_WINDOW_EXPORT_MAX_PAGES;
  const sinceMs = options.since?.getTime();
  const untilMs = options.until?.getTime();

  const records: R[] = [];
  let scannedPages = 0;

  for (let page = 1; page <= maxPages; page++) {
    const transactions = await source.listPage(page, pageSize);
    scannedPages = page;

    const inWindow = transactions.filter((transaction) => {
      if (source.include !== undefined && !source.include(transaction)) {
        return false;
      }

      const createdAt = new Date(transaction.createdAt).getTime();

      if (sinceMs !== undefined && createdAt < sinceMs) return false;
      if (untilMs !== undefined && createdAt > untilMs) return false;

      return true;
    });

    for (const transaction of inWindow) {
      const record = await source.resolve(transaction);

      if (record !== null) {
        records.push(record);
      }
    }

    if (transactions.length < pageSize) {
      return { records, truncated: false, scannedPages };
    }
  }

  return { records, truncated: true, scannedPages };
}
