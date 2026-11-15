import { describe, expect, it } from "vitest";

import type { Policy, PolicyRepository } from "@parmana/policy";
import { PolicyNotFoundError } from "@parmana/policy";
import type {
  BusinessTransaction,
  BusinessTransactionRepository,
} from "@parmana/shared";

import { BusinessTransactionValidationError } from "../../src/errors/BusinessTransactionValidationError.js";
import { BusinessTransactionService } from "../../src/services/business-transaction-service.js";

/**
 * Declare-stage signal check: a signal present in the request must have the
 * type the policy declares in signalsSchema. Refused as a 400 at accept,
 * before the decision, with the same rule the policy engine applies at
 * evaluation.
 */
const transactions: BusinessTransactionRepository = {
  exists: async () => false,
  create: async (transaction: BusinessTransaction) => transaction,
  findById: async () => null,
  list: async () => [],
} as unknown as BusinessTransactionRepository;

function transaction(
  signals: Record<string, unknown> | undefined,
): BusinessTransaction {
  const id = "11111111-1111-4111-8111-111111111111";
  return {
    businessTransactionId: id,
    metadata: { businessTransactionId: id },
    authority: { authorityId: "authority-1" },
    authorization: {
      authorityId: "authority-1",
      authorizationId: "authorization-1",
    },
    intent: { authorizationId: "authorization-1", action: "payments:refund" },
    policy: { name: "refund", version: "1.0.0", schemaVersion: "1.0.0" },
    ...(signals !== undefined ? { signals } : {}),
  } as unknown as BusinessTransaction;
}

function policies(
  schema: Record<string, string> | undefined,
): PolicyRepository {
  return {
    load: async () =>
      ({
        policyId: "refund",
        policyVersion: "1.0.0",
        signalsSchema: schema,
      }) as unknown as Policy,
    save: async () => undefined,
  } as PolicyRepository;
}

describe("BusinessTransactionService: signals against the declared signal schema", () => {
  it("refuses a signal sent with the wrong type, naming the signal and both types", async () => {
    const service = new BusinessTransactionService(
      transactions,
      policies({ amount: "number" }),
    );

    await expect(
      service.accept(transaction({ amount: "150000" })),
    ).rejects.toThrow(
      new BusinessTransactionValidationError(
        "signals.amount must be a number; got string.",
      ),
    );
  });

  it("accepts a signal of the declared type", async () => {
    const service = new BusinessTransactionService(
      transactions,
      policies({ amount: "number" }),
    );

    await expect(
      service.accept(transaction({ amount: 150000 })),
    ).resolves.toBeDefined();
  });

  it("refuses a request that omits signals altogether, with 400, before the decision", async () => {
    const service = new BusinessTransactionService(
      transactions,
      policies({ amount: "number" }),
    );

    await expect(service.accept(transaction(undefined))).rejects.toThrow(
      new BusinessTransactionValidationError(
        "signals is required and must be an object.",
      ),
    );
  });

  it("accepts an empty signals object when the policy declares no signals", async () => {
    const service = new BusinessTransactionService(
      transactions,
      policies(undefined),
    );

    await expect(service.accept(transaction({}))).resolves.toBeDefined();
  });

  it("does not check a signal the schema does not declare", async () => {
    const service = new BusinessTransactionService(
      transactions,
      policies({ amount: "number" }),
    );

    await expect(
      service.accept(transaction({ note: 42 })),
    ).resolves.toBeDefined();
  });

  it("leaves a policy that cannot be found to the decision", async () => {
    const missing: PolicyRepository = {
      load: async (name: string, version: string) => {
        throw new PolicyNotFoundError(name, version);
      },
      save: async () => undefined,
    } as PolicyRepository;
    const service = new BusinessTransactionService(transactions, missing);

    await expect(
      service.accept(transaction({ amount: "150000" })),
    ).resolves.toBeDefined();
  });

  it("does not check the signals when no policy repository is given", async () => {
    const service = new BusinessTransactionService(transactions);

    await expect(
      service.accept(transaction({ amount: "150000" })),
    ).resolves.toBeDefined();
  });
});
