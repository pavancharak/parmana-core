import { BusinessTransaction } from "@parmana/shared";

import { BusinessTransactionValidationError } from "../errors/BusinessTransactionValidationError.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The objects and fields every check below reads. A request body is
 * untyped JSON, so each is confirmed present, and of the right kind,
 * before it is read: a missing or malformed one is refused naming it,
 * never left to throw a TypeError that surfaces as a bare 500
 * (docs/VERIFICATION-GAPS.md G-87).
 */
function assertShape(transaction: unknown): void {
  if (!isObject(transaction)) {
    throw new BusinessTransactionValidationError(
      "The Business Transaction must be a JSON object.",
    );
  }

  for (const key of [
    "metadata",
    "authority",
    "authorization",
    "intent",
    "policy",
  ] as const) {
    if (!isObject(transaction[key])) {
      throw new BusinessTransactionValidationError(
        `${key} is required and must be an object.`,
      );
    }
  }

  const strings: Array<[string, unknown]> = [
    ["businessTransactionId", transaction.businessTransactionId],
    [
      "metadata.businessTransactionId",
      (transaction.metadata as Record<string, unknown>).businessTransactionId,
    ],
    [
      "authority.authorityId",
      (transaction.authority as Record<string, unknown>).authorityId,
    ],
    [
      "authorization.authorizationId",
      (transaction.authorization as Record<string, unknown>).authorizationId,
    ],
    [
      "authorization.authorityId",
      (transaction.authorization as Record<string, unknown>).authorityId,
    ],
    [
      "intent.authorizationId",
      (transaction.intent as Record<string, unknown>).authorizationId,
    ],
    ["intent.action", (transaction.intent as Record<string, unknown>).action],
    ["policy.name", (transaction.policy as Record<string, unknown>).name],
    ["policy.version", (transaction.policy as Record<string, unknown>).version],
  ];

  for (const [field, value] of strings) {
    if (typeof value !== "string") {
      throw new BusinessTransactionValidationError(
        `${field} is required and must be a string.`,
      );
    }
  }
}

export class BusinessTransactionValidator {
  public static validate(transaction: BusinessTransaction): void {
    assertShape(transaction);

    //
    // Trust-chain invariants
    //
    if (
      transaction.businessTransactionId !==
      transaction.metadata.businessTransactionId
    ) {
      throw new BusinessTransactionValidationError(
        "metadata.businessTransactionId must match businessTransactionId.",
      );
    }

    if (
      transaction.authorization.authorityId !==
      transaction.authority.authorityId
    ) {
      throw new BusinessTransactionValidationError(
        "authorization.authorityId must match authority.authorityId.",
      );
    }

    if (
      transaction.intent.authorizationId !==
      transaction.authorization.authorizationId
    ) {
      throw new BusinessTransactionValidationError(
        "intent.authorizationId must match authorization.authorizationId.",
      );
    }

    //
    // Required fields
    //
    if (!transaction.policy.name.trim()) {
      throw new BusinessTransactionValidationError("policy.name is required.");
    }

    if (!transaction.policy.version.trim()) {
      throw new BusinessTransactionValidationError(
        "policy.version is required.",
      );
    }

    if (!transaction.intent.action.trim()) {
      throw new BusinessTransactionValidationError(
        "intent.action is required.",
      );
    }
  }
}
