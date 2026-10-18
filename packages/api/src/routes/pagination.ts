/**
 * The largest pageSize GET /transactions and GET /trust-records accept.
 * GET /trust-records looks up one record per transaction on the page,
 * so an unbounded pageSize was an unbounded number of storage reads.
 */
export const MAX_PAGE_SIZE = 100;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;

export type Pagination =
  | { readonly ok: true; readonly page: number; readonly pageSize: number }
  | { readonly ok: false; readonly error: string };

/**
 * Reads `page` and `pageSize` from a query string. Absent means the
 * default; anything else must be a whole number, page at least 1 and
 * pageSize from 1 to MAX_PAGE_SIZE. Refused rather than clamped, so a
 * caller asking for 500 learns it got at most 100.
 */
export function parsePagination(query: {
  readonly page?: unknown;
  readonly pageSize?: unknown;
}): Pagination {
  const page = readWholeNumber(query.page, DEFAULT_PAGE);
  const pageSize = readWholeNumber(query.pageSize, DEFAULT_PAGE_SIZE);

  if (page === undefined || page < 1) {
    return { ok: false, error: "page must be a whole number, 1 or more." };
  }

  if (pageSize === undefined || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    return {
      ok: false,
      error: `pageSize must be a whole number from 1 to ${MAX_PAGE_SIZE}.`,
    };
  }

  return { ok: true, page, pageSize };
}

function readWholeNumber(value: unknown, fallback: number): number | undefined {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "string" || !/^\d{1,9}$/.test(value)) {
    return undefined;
  }

  return Number(value);
}
