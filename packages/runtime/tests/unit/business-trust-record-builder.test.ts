import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AuthorityType,
  BusinessTransactionStatus,
  DecisionOutcome,
  ExecutionMode,
  ExecutionStatus,
  SignatureAlgorithms,
  type BusinessTransaction,
  type Decision,
  type Execution,
  type SignedExecutionAuthorization,
} from "@parmana/shared";

import { BusinessTrustRecordBuilder } from "../../src/BusinessTrustRecordBuilder.js";
import type { RuntimeContext } from "../../src/context/RuntimeContext.js";

function buildTransaction(): BusinessTransaction {
  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const intentId = crypto.randomUUID();
  const businessTransactionId = crypto.randomUUID();

  return {
    businessTransactionId,
    metadata: { businessTransactionId },
    authority: {
      authorityId,
      authorityType: AuthorityType.USER,
      principalId: "business-trust-record-builder-test",
      displayName: "Test",
      issuedAt: new Date("2026-09-07T00:00:00Z"),
    },
    authorization: {
      authorizationId,
      authorityId,
      purpose: "test",
      issuedAt: new Date("2026-09-07T00:00:00Z"),
    },
    intent: {
      intentId,
      authorizationId,
      action: "hubspot:deal-update",
      target: "deals/1",
      parameters: {},
      createdAt: new Date("2026-09-07T00:00:00Z"),
    },
    policy: {
      name: "hubspot-deal-update",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    },
    signals: {},
    status: BusinessTransactionStatus.EXECUTED,
    createdAt: new Date("2026-09-07T00:00:00Z"),
  };
}

function buildDecision(transaction: BusinessTransaction): Decision {
  return {
    decisionId: crypto.randomUUID(),
    intentId: transaction.intent.intentId,
    policy: transaction.policy,
    signals: {},
    outcome: DecisionOutcome.APPROVED,
    reason: "approved for test",
    evaluatedAt: new Date("2026-09-07T00:00:01Z"),
  };
}

function buildExecution(
  transaction: BusinessTransaction,
  decision: Decision,
): Execution {
  return {
    executionId: crypto.randomUUID(),
    businessTransactionId: transaction.businessTransactionId,
    decision,
    status: ExecutionStatus.COMPLETED,
    mode: ExecutionMode.SYNC,
    startedAt: new Date("2026-09-07T00:00:02Z"),
    completedAt: new Date("2026-09-07T00:00:02Z"),
  };
}

function buildSignedExecutionAuthorization(): SignedExecutionAuthorization {
  return {
    payload: {
      version: 1,
      authorizationId: crypto.randomUUID(),
      nonce: crypto.randomUUID(),
      decisionId: crypto.randomUUID(),
      businessTransactionId: crypto.randomUUID(),
      policyName: "hubspot-deal-update",
      policyVersion: "1.0.0",
      authorizedAt: "2026-09-07T00:00:00.000Z",
      expiresAt: "2026-09-07T00:05:00.000Z",
      businessTransactionHash: "test-content-hash",
    },
    signature: "test-authorization-signature",
    keyId: "default",
    algorithm: SignatureAlgorithms.ED25519,
  };
}

describe("BusinessTrustRecordBuilder — authorization capture (NF-003)", () => {
  it("captures RuntimeContext.authorization onto the built ExecutionTrustRecord", async () => {
    const transaction = buildTransaction();
    const decision = buildDecision(transaction);
    const execution = buildExecution(transaction, decision);
    const authorization = buildSignedExecutionAuthorization();

    const context: RuntimeContext = {
      transaction,
      decision,
      authorization,
      execution,
    };

    const record = await new BusinessTrustRecordBuilder().build(context);

    expect(record.authorization).toEqual(authorization);
  });

  it("leaves authorization unset when RuntimeContext has none (e.g. a rejected decision that never reached execution)", async () => {
    const transaction = buildTransaction();
    const decision = buildDecision(transaction);
    const execution = buildExecution(transaction, decision);

    const context: RuntimeContext = {
      transaction,
      decision,
      execution,
    };

    const record = await new BusinessTrustRecordBuilder().build(context);

    expect(record.authorization).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(record, "authorization")).toBe(
      false,
    );
  });
});
