import { describe, expect, it } from "vitest";

import {
  AuthorityType,
  assertSafeApproverIds,
  generateCallerKey,
} from "../../src/index.js";

describe("generateCallerKey: caller id", () => {
  it("trims the caller id before storing it", () => {
    const key = generateCallerKey({ callerId: "  partner-a  " });

    expect(key.entry.callerId).toBe("partner-a");
  });

  it("refuses a blank caller id with the exact message", () => {
    expect(() => generateCallerKey({ callerId: "   " })).toThrow(
      "--caller-id must be a non-empty string.",
    );
  });
});

describe("generateCallerKey: principal ids", () => {
  it("trims each principal id and drops the blank ones", () => {
    const key = generateCallerKey({
      callerId: "partner-a",
      allowedPrincipalIds: ["  maker-1 ", "", "   ", "checker-2"],
    });

    expect(key.entry.allowedPrincipalIds).toEqual(["maker-1", "checker-2"]);
  });

  it("omits allowedPrincipalIds when every entry is blank", () => {
    const key = generateCallerKey({
      callerId: "partner-a",
      allowedPrincipalIds: ["", "   "],
    });

    expect(key.entry).not.toHaveProperty("allowedPrincipalIds");
  });

  it("omits allowedPrincipalIds when none is given", () => {
    const key = generateCallerKey({ callerId: "partner-a" });

    expect(key.entry).not.toHaveProperty("allowedPrincipalIds");
  });
});

describe("generateCallerKey: capabilities", () => {
  it("trims each capability and drops the blank ones", () => {
    const key = generateCallerKey({
      callerId: "partner-a",
      allowedCapabilities: [" refund.create ", "", "policy.read"],
    });

    expect(key.entry.allowedCapabilities).toEqual([
      "refund.create",
      "policy.read",
    ]);
  });

  it("omits allowedCapabilities when the list is empty", () => {
    const key = generateCallerKey({
      callerId: "partner-a",
      allowedCapabilities: [],
    });

    expect(key.entry).not.toHaveProperty("allowedCapabilities");
  });
});

describe("generateCallerKey: credential holder type", () => {
  it("stores the credential holder type when one is given", () => {
    const key = generateCallerKey({
      callerId: "checker-1",
      credentialHolderType: AuthorityType.USER,
    });

    expect(key.entry.credentialHolderType).toBe(AuthorityType.USER);
  });

  it("omits the credential holder type when none is given", () => {
    const key = generateCallerKey({ callerId: "partner-a" });

    expect(key.entry).not.toHaveProperty("credentialHolderType");
  });
});

describe("generateCallerKey: step-up key", () => {
  it("refuses a step-up key for a non-USER holder, with the exact message", () => {
    expect(() =>
      generateCallerKey({
        callerId: "service-1",
        credentialHolderType: AuthorityType.SERVICE,
        generateStepUpKey: true,
      }),
    ).toThrow(
      "--generate-step-up-key requires --credential-holder-type USER: " +
        "step-up authorization only has meaning for a human-credentialed checker.",
    );
  });

  it("refuses a step-up key when no holder type is given", () => {
    expect(() =>
      generateCallerKey({ callerId: "checker-1", generateStepUpKey: true }),
    ).toThrow("requires --credential-holder-type USER");
  });

  it("creates a step-up key for a USER holder and returns its private key", () => {
    const key = generateCallerKey({
      callerId: "checker-1",
      credentialHolderType: AuthorityType.USER,
      generateStepUpKey: true,
    });

    expect(key.entry.stepUpPublicKey).toContain("BEGIN PUBLIC KEY");
    expect(key.stepUpPrivateKey).toContain("BEGIN PRIVATE KEY");
  });

  it("returns no step-up private key when none was asked for", () => {
    const key = generateCallerKey({ callerId: "partner-a" });

    expect(key).not.toHaveProperty("stepUpPrivateKey");
    expect(key.entry).not.toHaveProperty("stepUpPublicKey");
  });
});

describe("assertSafeApproverIds", () => {
  it("accepts letters, digits, dots, underscores and hyphens", () => {
    expect(() =>
      assertSafeApproverIds("approver.one_2-x", "key-1.v2"),
    ).not.toThrow();
  });

  it("names the rejected option and value in the message", () => {
    expect(() => assertSafeApproverIds("bad/name", "key-1")).toThrow(
      '--approver-id must use only letters, digits, ".", "_" and "-": bad/name',
    );
    expect(() => assertSafeApproverIds("approver", "k y")).toThrow(
      '--key-id must use only letters, digits, ".", "_" and "-": k y',
    );
  });
});
