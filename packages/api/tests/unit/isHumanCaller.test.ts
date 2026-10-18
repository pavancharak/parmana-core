import { describe, expect, it } from "vitest";

import { AuthorityType } from "@parmana/shared";

import { isHumanCaller } from "../../src/auth/isHumanCaller.js";

describe("isHumanCaller", () => {
  it("allows a credential provisioned with credentialHolderType USER", () => {
    expect(isHumanCaller(AuthorityType.USER)).toBe(true);
  });

  it("fails closed on an undefined credentialHolderType (not verified, never 'assume human')", () => {
    expect(isHumanCaller(undefined)).toBe(false);
  });

  it("denies ROLE, SERVICE, and ORGANIZATION credentials the same as an unset one", () => {
    expect(isHumanCaller(AuthorityType.ROLE)).toBe(false);
    expect(isHumanCaller(AuthorityType.SERVICE)).toBe(false);
    expect(isHumanCaller(AuthorityType.ORGANIZATION)).toBe(false);
  });
});
