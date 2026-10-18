import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "../../src/errors/PostgresErrorCodes.js";

describe("isUniqueViolation", () => {
  it("returns true for a Postgres 23505 error object", () => {
    expect(isUniqueViolation({ code: "23505", message: "duplicate key" })).toBe(
      true,
    );
  });

  it("returns false for a different Postgres error code", () => {
    expect(
      isUniqueViolation({ code: "08006", message: "connection failure" }),
    ).toBe(false);
  });

  it("returns false for an error with no code field", () => {
    expect(isUniqueViolation({ message: "no code here" })).toBe(false);
  });

  it("returns false for null, undefined, and non-object values", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
    expect(isUniqueViolation(23505)).toBe(false);
  });
});
