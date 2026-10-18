import { describe, expect, it } from "vitest";

import { isPrincipalAllowed } from "../../src/auth/isPrincipalAllowed.js";

describe("isPrincipalAllowed", () => {
  it("rejects an undefined principalId", () => {
    expect(isPrincipalAllowed(undefined, "caller-a", undefined)).toBe(false);
  });

  it("rejects an empty principalId", () => {
    expect(isPrincipalAllowed("", "caller-a", undefined)).toBe(false);
  });

  it("defaults to requiring principalId === callerId when allowedPrincipalIds is unset", () => {
    expect(isPrincipalAllowed("caller-a", "caller-a", undefined)).toBe(true);
    expect(isPrincipalAllowed("someone-else", "caller-a", undefined)).toBe(
      false,
    );
  });

  it("blocks the exact live exploit: an unrelated self-declared principalId with no grant", () => {
    expect(
      isPrincipalAllowed(
        "ceo@victim-corp.example",
        "sandbox-agent-2",
        undefined,
      ),
    ).toBe(false);
  });

  it("honors an explicit allowedPrincipalIds grant", () => {
    expect(
      isPrincipalAllowed("finance.manager", "caller-a", ["finance.manager"]),
    ).toBe(true);
  });

  it("rejects a principalId not present in an explicit allowedPrincipalIds grant, even if it equals callerId", () => {
    expect(
      isPrincipalAllowed("caller-a", "caller-a", ["finance.manager"]),
    ).toBe(false);
  });
});
