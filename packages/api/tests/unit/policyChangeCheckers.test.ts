import { describe, expect, it } from "vitest";

import {
  isCheckerInScope,
  parsePolicyChangeCheckers,
} from "../../src/governance/policyChangeCheckers.js";

describe("parsePolicyChangeCheckers (G-50)", () => {
  it("lists no one when the variable is unset or blank", () => {
    expect(parsePolicyChangeCheckers(undefined)).toEqual({});
    expect(parsePolicyChangeCheckers("   ")).toEqual({});
  });

  it("reads a JSON object of policy name to caller ids", () => {
    const scope = parsePolicyChangeCheckers(
      '{"vendor-payment":["alice"],"refund":["bob","carol"]}',
    );

    expect(scope).toEqual({
      "vendor-payment": ["alice"],
      refund: ["bob", "carol"],
    });
  });

  it("refuses text that is not JSON", () => {
    expect(() => parsePolicyChangeCheckers("alice")).toThrow("not valid JSON");
  });

  it("refuses a JSON value that is not an object", () => {
    expect(() => parsePolicyChangeCheckers('["alice"]')).toThrow(
      "must be a JSON object",
    );
  });

  it("refuses an entry that is not an array of non-empty caller ids", () => {
    expect(() =>
      parsePolicyChangeCheckers('{"vendor-payment":"alice"}'),
    ).toThrow("must be an array");
    expect(() => parsePolicyChangeCheckers('{"vendor-payment":[""]}')).toThrow(
      "must be an array",
    );
  });
});

describe("isCheckerInScope (G-50)", () => {
  const scope = { "vendor-payment": ["alice"] };

  it("allows a caller listed for that policy", () => {
    expect(isCheckerInScope(scope, "vendor-payment", "alice")).toBe(true);
  });

  it("refuses a caller not listed for that policy", () => {
    expect(isCheckerInScope(scope, "vendor-payment", "bob")).toBe(false);
  });

  it("refuses every caller for a policy with no entry (fail closed)", () => {
    expect(isCheckerInScope(scope, "refund", "alice")).toBe(false);
    expect(isCheckerInScope({}, "vendor-payment", "alice")).toBe(false);
  });
});
