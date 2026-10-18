import { describe, expect, it } from "vitest";

import type { BusinessTransaction } from "@parmana/shared";

import { BusinessTransactionValidationError } from "../../src/errors/BusinessTransactionValidationError.js";
import { BusinessTransactionValidator } from "../../src/validators/BusinessTransactionValidator.js";

/**
 * G-87 (docs/VERIFICATION-GAPS.md): a request body is untyped JSON, so
 * every object and field the validator reads is checked first and a
 * missing or malformed one is refused naming it, never left to throw a
 * TypeError that the API answers as a bare 500.
 */

function valid(): Record<string, unknown> {
  return {
    businessTransactionId: "btx-1",
    metadata: { businessTransactionId: "btx-1" },
    authority: { authorityId: "a-1" },
    authorization: { authorizationId: "z-1", authorityId: "a-1" },
    intent: { authorizationId: "z-1", action: "pay" },
    policy: { name: "p", version: "1.0.0" },
  };
}

const validate = (value: unknown) => () =>
  BusinessTransactionValidator.validate(value as BusinessTransaction);

describe("BusinessTransactionValidator shape checks (G-87)", () => {
  it("accepts a complete transaction", () => {
    expect(validate(valid())).not.toThrow();
  });

  it.each([null, "x", 5, []])("refuses %j as a transaction", (value) => {
    expect(validate(value)).toThrow(
      new BusinessTransactionValidationError(
        "The Business Transaction must be a JSON object.",
      ),
    );
  });

  it.each(["metadata", "authority", "authorization", "intent", "policy"])(
    "refuses a missing, null or non-object %s, naming it",
    (key) => {
      for (const value of [undefined, null, "x", []]) {
        const body = valid();
        if (value === undefined) delete body[key];
        else body[key] = value;
        expect(validate(body)).toThrow(
          `${key} is required and must be an object.`,
        );
      }
    },
  );

  const DELETE = Symbol("delete");

  it.each([
    ["businessTransactionId", 1],
    ["metadata.businessTransactionId", DELETE],
    ["authority.authorityId", null],
    ["authorization.authorizationId", DELETE],
    ["authorization.authorityId", {}],
    ["intent.authorizationId", 2],
    ["intent.action", DELETE],
    ["policy.name", []],
    ["policy.version", DELETE],
  ])("refuses a missing or non-string %s, naming it", (field, value) => {
    const body = valid();
    const keys = field.split(".");
    const parent = keys
      .slice(0, -1)
      .reduce<Record<string, unknown>>(
        (node, key) => node[key] as Record<string, unknown>,
        body,
      );
    const last = keys[keys.length - 1]!;
    if (value === DELETE) delete parent[last];
    else parent[last] = value;

    expect(validate(body)).toThrow(
      new BusinessTransactionValidationError(
        `${field} is required and must be a string.`,
      ),
    );
  });

  it("still applies the trust-chain checks after the shape checks", () => {
    const body = valid();
    (body.intent as Record<string, unknown>).authorizationId = "other";
    expect(validate(body)).toThrow(
      "intent.authorizationId must match authorization.authorizationId.",
    );
  });
});
