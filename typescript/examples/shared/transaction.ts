import { BusinessTransaction } from "@parmana/sdk";

export function createTransaction(
  overrides: Partial<BusinessTransaction>,
): BusinessTransaction {
  const businessTransactionId = crypto.randomUUID();

  return {
    businessTransactionId,

    metadata: {
      businessTransactionId,
      submittedAt: new Date(),
    },

    authority: {
      authorityId: "authority-001",
      authorityType: "USER",
      principalId: "demo-user",
      issuedAt: new Date(),
    },

    authorization: {
      authorizationId: "authorization-001",
      authorityId: "authority-001",
      purpose: "Example",
      issuedAt: new Date(),
    },

    intent: {
      intentId: "intent-001",
      authorizationId: "authorization-001",
      action: "Example",
      target: "example",
      parameters: {},
      createdAt: new Date(),
    },

    policy: {
      name: "default",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    },

    signals: {},

    status: "RECEIVED",

    createdAt: new Date(),

    ...overrides,
  };
}
