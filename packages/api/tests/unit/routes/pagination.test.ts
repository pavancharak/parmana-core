import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  MAX_PAGE_SIZE,
  parsePagination,
} from "../../../src/routes/pagination.js";
import app from "../../test-app.js";

describe("parsePagination", () => {
  it("defaults to page 1 of 25", () => {
    expect(parsePagination({})).toEqual({ ok: true, page: 1, pageSize: 25 });
  });

  it("accepts whole numbers up to the maximum page size", () => {
    expect(
      parsePagination({ page: "3", pageSize: String(MAX_PAGE_SIZE) }),
    ).toEqual({
      ok: true,
      page: 3,
      pageSize: MAX_PAGE_SIZE,
    });
  });

  it.each([
    [{ page: "0" }],
    [{ page: "-1" }],
    [{ page: "abc" }],
    [{ page: "1.5" }],
    [{ pageSize: "0" }],
    [{ pageSize: String(MAX_PAGE_SIZE + 1) }],
    [{ pageSize: "1000000" }],
    [{ pageSize: ["10", "20"] }],
  ])("refuses %o", (query) => {
    expect(parsePagination(query).ok).toBe(false);
  });
});

describe("list routes refuse a page size over the maximum", () => {
  it.each(["/transactions", "/trust-records"])(
    "GET %s?pageSize=1000000 answers 400",
    async (path) => {
      const response = await request(app).get(`${path}?pageSize=1000000`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain(`1 to ${MAX_PAGE_SIZE}`);
    },
  );

  it.each(["/transactions", "/trust-records"])(
    "GET %s?page=-1 answers 400, not a storage error",
    async (path) => {
      const response = await request(app).get(`${path}?page=-1`);

      expect(response.status).toBe(400);
    },
  );
});
