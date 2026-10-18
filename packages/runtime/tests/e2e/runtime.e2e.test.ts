import path from "node:path";
import { DecisionBuilder } from "../../src/DecisionBuilder.js";
import { ExecutionBuilder } from "../../src/ExecutionBuilder.js";
import { ExecutionGate } from "../../src/ExecutionGate.js";
import { describe, expect, it } from "vitest";

import { CryptoBootstrap, TrustRecordHasher } from "@parmana/crypto";

import {
  Authority,
  Authorization,
  BusinessTransaction,
  BusinessTransactionStatus,
  TransactionMetadata,
} from "@parmana/shared";

import {
  FilePolicyRepository,
  PolicyEngine,
  PolicyRouter,
  SignalIntentBinder,
} from "@parmana/policy";

import { RuntimeEngine } from "../../src/RuntimeEngine.js";
import { RuntimePipeline } from "../../src/RuntimePipeline.js";
import { BusinessTrustPipeline } from "../../src/BusinessTrustPipeline.js";
import { RuntimeAuthorizationSigner } from "../../src/RuntimeAuthorizationSigner.js";

import {
  testApprovalSignalVerifier,
  withTestApproval,
} from "../../../../test-support/approvals.js";

/**
 * RuntimeEngine End-to-End tests.
 */
describe("RuntimeEngine E2E", () => {
  const policyRepository = new FilePolicyRepository(
    path.resolve(import.meta.dirname, "../../../../policies"),
  );

  const router = new PolicyRouter(policyRepository);
  const pipeline = new RuntimePipeline([]);

  const policyEngine = new PolicyEngine();

  const signalIntentBinder = new SignalIntentBinder();

  const trustPipeline = new BusinessTrustPipeline();

  const authorizationSigner = new RuntimeAuthorizationSigner();

  it("executes full trust pipeline deterministically", async () => {
    const transaction: BusinessTransaction = {
      businessTransactionId: "tx-1",

      //
      // executionMode is not a TransactionMetadata field;
      // this fixture is deliberately loose and never read
      // by the code under test, hence the unknown cast.
      //
      metadata: {
        executionMode: "SYNC",
      } as unknown as TransactionMetadata,

      authority: {} as Authority,

      authorization: {} as Authorization,

      intent: {
        intentId: "intent-1",
        authorizationId: "authorization-1",
        action: "payments:execute",
        target: "vendor://payments",
        parameters: {
          amount: 100,
        },
        createdAt: new Date(),
      },

      policy: {
        name: "vendor-payment",
        version: "2.1.0",
        schemaVersion: "1.0.0",
      },

      signals: {
        vendorVerified: true,
        invoiceVerified: true,
        paymentApproved: true,
        sufficientFunds: true,
        paymentAmount: 100,
        riskScore: 10,
        // Must match intent.target exactly: vendor-payment/2.1.0 now
        // declares boundSignals requiring vendorId === intent.target.
        vendorId: "vendor://payments",
      },

      status: BusinessTransactionStatus.RECEIVED,

      createdAt: new Date(),
    };

    const runtime = new RuntimeEngine(
      pipeline,
      router,
      policyEngine,
      signalIntentBinder,
      new DecisionBuilder(),
      new ExecutionGate(),
      new ExecutionBuilder(),
      trustPipeline,
      authorizationSigner,
      120,
      [],
      undefined,
      undefined,
      testApprovalSignalVerifier(),
    );

    const result = await runtime.execute(await withTestApproval(transaction));

    expect(result.transaction).toBeDefined();
    expect(result.context).toBeDefined();
    expect(result.trustRecord).toBeDefined();

    expect(result.trustRecord.businessTransactionId).toBe(
      transaction.businessTransactionId,
    );
  });

  it("stamps transaction.policy.contentHash on the Execution Trust Record with a hash of the real loaded policy content (G-24, policy-governance milestone)", async () => {
    const runtime = new RuntimeEngine(
      pipeline,
      router,
      policyEngine,
      signalIntentBinder,
      new DecisionBuilder(),
      new ExecutionGate(),
      new ExecutionBuilder(),
      trustPipeline,
      authorizationSigner,
      120,
      [],
      undefined,
      undefined,
      testApprovalSignalVerifier(),
    );

    const transaction: BusinessTransaction = {
      businessTransactionId: "tx-content-hash",

      metadata: {
        executionMode: "SYNC",
      } as unknown as TransactionMetadata,

      authority: {} as Authority,

      authorization: {} as Authorization,

      intent: {
        intentId: "intent-content-hash",
        authorizationId: "authorization-content-hash",
        action: "payments:execute",
        target: "vendor://payments",
        parameters: {
          amount: 100,
        },
        createdAt: new Date(),
      },

      // Caller-declared PolicyReference never carries contentHash --
      // proof it's computed server-side, not merely passed through.
      policy: {
        name: "vendor-payment",
        version: "2.1.0",
        schemaVersion: "1.0.0",
      },

      signals: {
        vendorVerified: true,
        invoiceVerified: true,
        paymentApproved: true,
        sufficientFunds: true,
        paymentAmount: 100,
        riskScore: 10,
        vendorId: "vendor://payments",
      },

      status: BusinessTransactionStatus.RECEIVED,

      createdAt: new Date(),
    };

    const result = await runtime.execute(await withTestApproval(transaction));

    const loadedPolicy = await policyRepository.load("vendor-payment", "2.1.0");

    const expectedContentHash = await new TrustRecordHasher(
      CryptoBootstrap.create(),
    ).hash(loadedPolicy);

    expect(result.trustRecord.transaction.policy.contentHash).toBe(
      expectedContentHash,
    );

    // Not a degenerate constant: different content hashes differently.
    const differentContentHash = await new TrustRecordHasher(
      CryptoBootstrap.create(),
    ).hash({ ...loadedPolicy, policyVersion: "9.9.9" });

    expect(result.trustRecord.transaction.policy.contentHash).not.toBe(
      differentContentHash,
    );
  });

  it("blocks the exact live exploit: signals describe a small verified payment, intent executes a different amount to a different target", async () => {
    const runtime = new RuntimeEngine(
      pipeline,
      router,
      policyEngine,
      signalIntentBinder,
      new DecisionBuilder(),
      new ExecutionGate(),
      new ExecutionBuilder(),
      trustPipeline,
      authorizationSigner,
      120,
      [],
      undefined,
      undefined,
      testApprovalSignalVerifier(),
    );

    const exploitTransaction: BusinessTransaction = {
      businessTransactionId: "tx-exploit",

      metadata: {
        executionMode: "SYNC",
      } as unknown as TransactionMetadata,

      authority: {} as Authority,

      authorization: {} as Authorization,

      intent: {
        intentId: "intent-exploit",
        authorizationId: "authorization-exploit",
        action: "payments:execute",
        // What actually executes: an attacker-controlled account
        // for $999,999,999.
        target: "ATTACKER-CONTROLLED-ACCOUNT-9999",
        parameters: {
          amount: 999999999,
        },
        createdAt: new Date(),
      },

      policy: {
        name: "vendor-payment",
        version: "2.1.0",
        schemaVersion: "1.0.0",
      },

      signals: {
        // What is declared to the policy engine: a small,
        // fully-verified payment to a known, verified vendor.
        vendorVerified: true,
        invoiceVerified: true,
        paymentApproved: true,
        sufficientFunds: true,
        paymentAmount: 5000,
        riskScore: 10,
        vendorId: "VENDOR-1001",
      },

      status: BusinessTransactionStatus.RECEIVED,

      createdAt: new Date(),
    };

    await expect(
      runtime.execute(await withTestApproval(exploitTransaction)),
    ).rejects.toThrow("do not match the executed intent");
  });

  it("refuses execution when the configured PolicyExecutionVerifier finds a violation (2026-09-07 hardening pass), before PolicyEngine ever evaluates a rule", async () => {
    const policyExecutionVerifier = {
      verify: async () => ({
        reason: "has no PolicyChangeApprovalRecord -- test double",
      }),
    };

    const runtime = new RuntimeEngine(
      pipeline,
      router,
      policyEngine,
      signalIntentBinder,
      new DecisionBuilder(),
      new ExecutionGate(),
      new ExecutionBuilder(),
      trustPipeline,
      authorizationSigner,
      120,
      [],
      undefined,
      undefined,
      testApprovalSignalVerifier(),
      undefined,
      policyExecutionVerifier,
    );

    // Otherwise a fully valid, approving transaction -- same fixture
    // as "executes full trust pipeline deterministically" above.
    const transaction: BusinessTransaction = {
      businessTransactionId: "tx-governance-violation",

      metadata: {
        executionMode: "SYNC",
      } as unknown as TransactionMetadata,

      authority: {} as Authority,

      authorization: {} as Authorization,

      intent: {
        intentId: "intent-governance-violation",
        authorizationId: "authorization-governance-violation",
        action: "payments:execute",
        target: "vendor://payments",
        parameters: {
          amount: 100,
        },
        createdAt: new Date(),
      },

      policy: {
        name: "vendor-payment",
        version: "2.1.0",
        schemaVersion: "1.0.0",
      },

      signals: {
        vendorVerified: true,
        invoiceVerified: true,
        paymentApproved: true,
        sufficientFunds: true,
        paymentAmount: 100,
        riskScore: 10,
        vendorId: "vendor://payments",
      },

      status: BusinessTransactionStatus.RECEIVED,

      createdAt: new Date(),
    };

    await expect(
      runtime.execute(await withTestApproval(transaction)),
    ).rejects.toThrow("has no PolicyChangeApprovalRecord -- test double");
  });

  it("leaves execution unaffected when the configured PolicyExecutionVerifier finds no violation", async () => {
    const policyExecutionVerifier = {
      verify: async () => undefined,
    };

    const runtime = new RuntimeEngine(
      pipeline,
      router,
      policyEngine,
      signalIntentBinder,
      new DecisionBuilder(),
      new ExecutionGate(),
      new ExecutionBuilder(),
      trustPipeline,
      authorizationSigner,
      120,
      [],
      undefined,
      undefined,
      testApprovalSignalVerifier(),
      undefined,
      policyExecutionVerifier,
    );

    const transaction: BusinessTransaction = {
      businessTransactionId: "tx-governance-clean",

      metadata: {
        executionMode: "SYNC",
      } as unknown as TransactionMetadata,

      authority: {} as Authority,

      authorization: {} as Authorization,

      intent: {
        intentId: "intent-governance-clean",
        authorizationId: "authorization-governance-clean",
        action: "payments:execute",
        target: "vendor://payments",
        parameters: {
          amount: 100,
        },
        createdAt: new Date(),
      },

      policy: {
        name: "vendor-payment",
        version: "2.1.0",
        schemaVersion: "1.0.0",
      },

      signals: {
        vendorVerified: true,
        invoiceVerified: true,
        paymentApproved: true,
        sufficientFunds: true,
        paymentAmount: 100,
        riskScore: 10,
        vendorId: "vendor://payments",
      },

      status: BusinessTransactionStatus.RECEIVED,

      createdAt: new Date(),
    };

    const result = await runtime.execute(await withTestApproval(transaction));

    expect(result.trustRecord).toBeDefined();
    expect(result.trustRecord.businessTransactionId).toBe(
      transaction.businessTransactionId,
    );
  });

  it("stamps transaction.policy.governanceAnchor from the configured resolver, and never lets it affect the real outcome (G-45)", async () => {
    let resolveCalledWith: [string, string, string] | undefined;

    const policyGovernanceAnchorResolver = {
      resolve: async (
        policyName: string,
        policyVersion: string,
        policyContentHash: string,
      ) => {
        resolveCalledWith = [policyName, policyVersion, policyContentHash];

        return { status: "NO_APPROVAL_RECORD" as const };
      },
    };

    const runtime = new RuntimeEngine(
      pipeline,
      router,
      policyEngine,
      signalIntentBinder,
      new DecisionBuilder(),
      new ExecutionGate(),
      new ExecutionBuilder(),
      trustPipeline,
      authorizationSigner,
      120,
      [],
      undefined,
      undefined,
      testApprovalSignalVerifier(),
      undefined,
      undefined,
      policyGovernanceAnchorResolver,
    );

    const transaction: BusinessTransaction = {
      businessTransactionId: "tx-governance-anchor",

      metadata: {
        executionMode: "SYNC",
      } as unknown as TransactionMetadata,

      authority: {} as Authority,

      authorization: {} as Authorization,

      intent: {
        intentId: "intent-governance-anchor",
        authorizationId: "authorization-governance-anchor",
        action: "payments:execute",
        target: "vendor://payments",
        parameters: {
          amount: 100,
        },
        createdAt: new Date(),
      },

      policy: {
        name: "vendor-payment",
        version: "2.1.0",
        schemaVersion: "1.0.0",
      },

      signals: {
        vendorVerified: true,
        invoiceVerified: true,
        paymentApproved: true,
        sufficientFunds: true,
        paymentAmount: 100,
        riskScore: 10,
        vendorId: "vendor://payments",
      },

      status: BusinessTransactionStatus.RECEIVED,

      createdAt: new Date(),
    };

    const result = await runtime.execute(await withTestApproval(transaction));

    // Real APPROVE outcome, unaffected by the resolver -- this is
    // evidence, not enforcement.
    expect(result.trustRecord.executions[0]?.decision.outcome).toBe("APPROVED");

    expect(resolveCalledWith?.[0]).toBe("vendor-payment");
    expect(resolveCalledWith?.[1]).toBe("2.1.0");
    // Resolved with the same content hash G-24 stamps alongside it.
    expect(resolveCalledWith?.[2]).toBe(
      result.trustRecord.transaction.policy.contentHash,
    );

    expect(result.trustRecord.transaction.policy.governanceAnchor).toEqual({
      status: "NO_APPROVAL_RECORD",
    });
  });

  it("never lets a policyGovernanceAnchorResolver failure block a real execution (G-45, evidence not enforcement)", async () => {
    const policyGovernanceAnchorResolver = {
      resolve: async () => {
        throw new Error("simulated resolver failure");
      },
    };

    const runtime = new RuntimeEngine(
      pipeline,
      router,
      policyEngine,
      signalIntentBinder,
      new DecisionBuilder(),
      new ExecutionGate(),
      new ExecutionBuilder(),
      trustPipeline,
      authorizationSigner,
      120,
      [],
      undefined,
      undefined,
      testApprovalSignalVerifier(),
      undefined,
      undefined,
      policyGovernanceAnchorResolver,
    );

    const transaction: BusinessTransaction = {
      businessTransactionId: "tx-governance-anchor-failure",

      metadata: {
        executionMode: "SYNC",
      } as unknown as TransactionMetadata,

      authority: {} as Authority,

      authorization: {} as Authorization,

      intent: {
        intentId: "intent-governance-anchor-failure",
        authorizationId: "authorization-governance-anchor-failure",
        action: "payments:execute",
        target: "vendor://payments",
        parameters: {
          amount: 100,
        },
        createdAt: new Date(),
      },

      policy: {
        name: "vendor-payment",
        version: "2.1.0",
        schemaVersion: "1.0.0",
      },

      signals: {
        vendorVerified: true,
        invoiceVerified: true,
        paymentApproved: true,
        sufficientFunds: true,
        paymentAmount: 100,
        riskScore: 10,
        vendorId: "vendor://payments",
      },

      status: BusinessTransactionStatus.RECEIVED,

      createdAt: new Date(),
    };

    const result = await runtime.execute(await withTestApproval(transaction));

    expect(result.trustRecord.executions[0]?.decision.outcome).toBe("APPROVED");
    expect(
      result.trustRecord.transaction.policy.governanceAnchor,
    ).toBeUndefined();
  });

  it("fails safely on invalid transaction", async () => {
    const runtime = new RuntimeEngine(
      pipeline,
      router,
      policyEngine,
      signalIntentBinder,
      new DecisionBuilder(),
      new ExecutionGate(),
      new ExecutionBuilder(),
      trustPipeline,
      authorizationSigner,
      120,
      [],
      undefined,
      undefined,
      testApprovalSignalVerifier(),
    );
    await expect(runtime.execute({} as BusinessTransaction)).rejects.toThrow();
  });
});
