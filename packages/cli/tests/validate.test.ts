import { describe, expect, it } from "vitest";

import { CliUsageError } from "../src/errors.js";
import {
  assertPolicyIdentity,
  buildApprovalBody,
  buildProposalBody,
  parseApprovalAction,
  parsePolicyFile,
} from "../src/validate.js";

const POLICY = JSON.stringify({
  policyId: "customer-refund",
  policyVersion: "1.3.0",
  rules: [],
});

describe("parsePolicyFile", () => {
  it("accepts a policy with both identity fields", () => {
    expect(parsePolicyFile(POLICY).policyId).toBe("customer-refund");
  });

  it.each([
    ["not JSON", "{", "not valid JSON"],
    ["an array", "[]", "must be a JSON object"],
    ["no policyId", JSON.stringify({ policyVersion: "1.3.0" }), "no policyId"],
    ["no policyVersion", JSON.stringify({ policyId: "x" }), "no policyVersion"],
  ])("refuses %s", (_name, text, message) => {
    expect(() => parsePolicyFile(text)).toThrow(CliUsageError);
    expect(() => parsePolicyFile(text)).toThrow(message);
  });
});

describe("assertPolicyIdentity", () => {
  const policy = parsePolicyFile(POLICY);

  it("passes when the name and version match the file", () => {
    expect(() =>
      assertPolicyIdentity(policy, "customer-refund", "1.3.0"),
    ).not.toThrow();
  });

  it("refuses a name that differs from the file", () => {
    expect(() =>
      assertPolicyIdentity(policy, "razorpay-refund", "1.3.0"),
    ).toThrow(/policyId/);
  });

  it("refuses a version that differs from the file", () => {
    expect(() =>
      assertPolicyIdentity(policy, "customer-refund", "1.2.0"),
    ).toThrow(/policyVersion/);
  });
});

describe("buildProposalBody", () => {
  it("wraps the whole policy and a trimmed reason", () => {
    const body = buildProposalBody(parsePolicyFile(POLICY), "  why  ");
    expect(body.reason).toBe("why");
    expect(body.proposedContent.policyId).toBe("customer-refund");
  });

  it("refuses an empty reason", () => {
    expect(() => buildProposalBody(parsePolicyFile(POLICY), "   ")).toThrow(
      /reason is required/,
    );
  });
});

describe("parseApprovalAction", () => {
  it("accepts approve and reject", () => {
    expect(parseApprovalAction("approve")).toBe("approve");
    expect(parseApprovalAction("reject")).toBe("reject");
  });

  it.each([undefined, "", "APPROVE", "delete"])("refuses %p", (value) => {
    expect(() => parseApprovalAction(value)).toThrow(
      /must be "approve" or "reject"/,
    );
  });
});

describe("buildApprovalBody", () => {
  const envelope = JSON.stringify({
    payload: {
      version: 1,
      nonce: "n",
      pendingPolicyChangeId: "p",
      action: "approve",
      authorizedAt: "a",
      expiresAt: "b",
    },
    signature: "sig",
    keyId: "mamta-checker",
    algorithm: "ed25519",
  });

  it("wraps a complete envelope in stepUpAuthorization", () => {
    const body = buildApprovalBody(envelope);
    expect(Object.keys(body)).toEqual(["stepUpAuthorization"]);
    expect(body.stepUpAuthorization["keyId"]).toBe("mamta-checker");
  });

  it("refuses a file that is not an envelope", () => {
    expect(() => buildApprovalBody('{"stepUpAuthorization": }')).toThrow(
      /not valid JSON/,
    );
    expect(() => buildApprovalBody(JSON.stringify({ foo: 1 }))).toThrow(
      /does not look like/,
    );
  });
});
