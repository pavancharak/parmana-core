import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  toExecutableContent,
  type BusinessTransaction,
  type SignedExecutionAuthorization,
} from "@parmana/shared";

import { ExecutionRequestBuilder } from "../../src/ExecutionRequestBuilder.js";

const here = dirname(fileURLToPath(import.meta.url));
const builderSourcePath = join(here, "../../src/ExecutionRequestBuilder.ts");

/**
 * Phase 2F — regression coverage for TD-9's fix.
 *
 * ExecutionRequestBuilder.build() used to manually re-list
 * businessTransactionId/action/target/parameters instead of calling the
 * shared toExecutableContent() helper (@parmana/shared) — the same
 * helper RuntimeEngine.execute() already uses to build the
 * ExecutableContent an authorization is signed over. Two independent
 * derivations of the same four fields, with nothing enforcing they
 * couldn't diverge. This file proves the fix actually delegates,
 * rather than merely happening to produce the same values today.
 */

function fixtureTransaction(
  overrides: Partial<BusinessTransaction["intent"]> = {},
): BusinessTransaction {
  return {
    businessTransactionId: "txn-001",

    metadata: {
      businessTransactionId: "txn-001",
    },

    authority: {
      authorityId: "authority-001",
      authorityType: "USER",
      principalId: "test-principal",
      displayName: "Test Principal",
      issuedAt: new Date("2026-01-01T00:00:00Z"),
    },

    authorization: {
      authorizationId: "auth-001",
      authorityId: "authority-001",
      purpose: "Unit test",
      authorizedAt: new Date("2026-01-01T00:00:00Z"),
    },

    intent: {
      intentId: "intent-001",
      authorizationId: "auth-001",
      action: "payments:execute",
      target: "vendor://payments",
      parameters: Object.freeze({ amount: 1000, paymentId: "payment-001" }),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      ...overrides,
    },

    policy: {
      name: "test-policy",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    },

    signals: {},

    decision: { outcome: "APPROVED" },

    status: "APPROVED",

    createdAt: new Date("2026-01-01T00:00:00Z"),
  } as BusinessTransaction;
}

function fixtureAuthorization(
  businessTransactionId: string,
): SignedExecutionAuthorization {
  return {
    payload: {
      version: 1,
      authorizationId: "auth-001",
      nonce: "nonce-001",
      decisionId: "decision-001",
      businessTransactionId,
      policyName: "test-policy",
      policyVersion: "1.0.0",
      authorizedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:01:00.000Z",
      businessTransactionHash: "test-hash",
    },
    signature: "test-signature",
    keyId: "test-key",
  } as SignedExecutionAuthorization;
}

describe("ExecutionRequestBuilder", () => {
  it("delegates to the shared toExecutableContent() helper, not a re-listed field mapping", () => {
    // Source-level proof, not just behavioral: if a future edit reverts
    // to manually re-listing the four fields instead of calling the
    // helper, this assertion catches it even if the values happened to
    // still match by coincidence.
    const source = readFileSync(builderSourcePath, "utf8");
    expect(source).toContain("toExecutableContent(");
  });

  it("produces output byte-for-byte equivalent to calling toExecutableContent() directly", () => {
    const transaction = fixtureTransaction();
    const authorization = fixtureAuthorization(
      transaction.businessTransactionId,
    );

    const request = new ExecutionRequestBuilder().build(
      transaction,
      authorization,
    );

    const expectedContent = toExecutableContent({
      businessTransactionId: transaction.businessTransactionId,
      action: transaction.intent.action,
      target: transaction.intent.target,
      parameters: transaction.intent.parameters,
    });

    expect(request.businessTransactionId).toBe(
      expectedContent.businessTransactionId,
    );
    expect(request.action).toBe(expectedContent.action);
    expect(request.target).toBe(expectedContent.target);
    expect(request.parameters).toEqual(expectedContent.parameters);
    expect(request.authorization).toBe(authorization);
  });

  it("inherits the helper's immutability guarantee — proves real delegation, not a lucky value match", () => {
    const transaction = fixtureTransaction();
    const authorization = fixtureAuthorization(
      transaction.businessTransactionId,
    );

    const request = new ExecutionRequestBuilder().build(
      transaction,
      authorization,
    );

    // Manually re-listing the fields (the pre-Phase-2F code) passed
    // transaction.intent.parameters straight through by reference; only
    // genuine delegation to toExecutableContent() (which does
    // Object.freeze({ ...input.parameters })) produces a fresh, frozen
    // copy instead. The outer ExecutionRequest itself is a plain object
    // (spreading a frozen ExecutableContent plus `authorization` builds
    // a new, unfrozen object) — that was true before this fix too, so
    // it isn't asserted here as a delegation signal.
    expect(Object.isFrozen(request.parameters)).toBe(true);
    expect(request.parameters).not.toBe(transaction.intent.parameters);
  });

  it("inherits the helper's validation — throws on an empty target instead of silently accepting one", () => {
    const transaction = fixtureTransaction({ target: "" });
    const authorization = fixtureAuthorization(
      transaction.businessTransactionId,
    );

    expect(() =>
      new ExecutionRequestBuilder().build(transaction, authorization),
    ).toThrow("ExecutableContent.target must be a non-empty string.");
  });

  it("stays in lockstep with RuntimeEngine's own ExecutableContent derivation for the same transaction", () => {
    // The same four source values RuntimeEngine.execute() feeds to
    // toExecutableContent() when building the ExecutableContent an
    // authorization is signed over (RuntimeEngine.ts around the
    // executionGate.enforce() call) must produce identical
    // businessTransactionId/action/target/parameters here — this is the
    // property TD-9 existed to protect: what was authorized must be
    // exactly what gets executed.
    const transaction = fixtureTransaction();
    const authorization = fixtureAuthorization(
      transaction.businessTransactionId,
    );

    const signedContent = toExecutableContent({
      businessTransactionId: transaction.businessTransactionId,
      action: transaction.intent.action,
      target: transaction.intent.target,
      parameters: transaction.intent.parameters,
    });

    const request = new ExecutionRequestBuilder().build(
      transaction,
      authorization,
    );

    expect({
      businessTransactionId: request.businessTransactionId,
      action: request.action,
      target: request.target,
      parameters: request.parameters,
    }).toEqual({
      businessTransactionId: signedContent.businessTransactionId,
      action: signedContent.action,
      target: signedContent.target,
      parameters: signedContent.parameters,
    });
  });
});
