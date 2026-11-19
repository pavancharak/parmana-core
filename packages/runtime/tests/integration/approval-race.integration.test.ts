import path from "node:path";
import { describe, expect, it } from "vitest";

import { ApprovalSignalVerifier, ApprovalVerifier } from "@parmana/approval";
import { APPROVAL_ARTIFACT_CRYPTO_PROVIDER } from "@parmana/crypto";
import { FilePolicyRepository } from "@parmana/policy";
import {
  MemoryApprovalNonceLedger,
  MemoryExecutionTrustRecordRepository,
  MemoryTransactionStatusEventRepository,
} from "@parmana/storage";
import type { ApprovalNonceLedger, BusinessTransaction } from "@parmana/shared";

import { RuntimeBuilder } from "../../src/RuntimeBuilder.js";
import { TransactionStatusRecorder } from "../../src/services/TransactionStatusRecorder.js";

import {
  testApprovalIssuerRegistry,
  withTestApproval,
} from "../../../../test-support/approvals.js";

/**
 * The approval race, end to end through the engine (decision D24). Two
 * transactions use one signed approval. Only one may reach APPROVED, and the
 * other is refused with 403 POLICY_DENIED and writes no APPROVED event.
 */

const POLICY = {
  name: "payment-limit",
  version: "2.1.0",
  schemaVersion: "1.0.0",
} as const;

function transaction(
  id: string,
  extra: Partial<BusinessTransaction> = {},
): BusinessTransaction {
  return {
    businessTransactionId: id,
    policy: POLICY,
    signals: {
      vendorVerified: true,
      invoiceVerified: true,
      paymentApproved: true,
      sufficientFunds: true,
      paymentAmount: 5000,
      riskScore: 10,
      vendorId: "vendor://payments",
    },
    authority: { authorityId: "authority-001" },
    authorization: { authorizationId: `authorization-${id}` },
    intent: {
      intentId: `intent-${id}`,
      authorizationId: `authorization-${id}`,
      action: "payments:execute",
      target: "vendor://payments",
      parameters: { amount: 5000 },
      createdAt: new Date(),
    },
    ...extra,
  } as BusinessTransaction;
}

/** A runtime with status events on, sharing one approval ledger between the verifier and the status write. */
function setup(ledgerForVerifier: ApprovalNonceLedger = ledger) {
  const events = new MemoryTransactionStatusEventRepository(
    async () => true,
    ledger,
  );
  const recorder = new TransactionStatusRecorder(events);
  const verifier = new ApprovalVerifier({
    crypto: APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
    issuerRegistry: testApprovalIssuerRegistry(),
    nonceStore: ledgerForVerifier,
  });
  const runtime = new RuntimeBuilder()
    .withPolicyRepository(
      new FilePolicyRepository(
        path.resolve(import.meta.dirname, "../../../../fixtures/policies"),
      ),
    )
    .withSignalStateVerifier(new ApprovalSignalVerifier(verifier))
    .withTransactionStatusRecorder(recorder)
    .build(new MemoryExecutionTrustRecordRepository());

  return { runtime, recorder };
}

let ledger: MemoryApprovalNonceLedger;

async function signedSignals(id: string) {
  const { signals } = await withTestApproval(transaction(id));
  return signals;
}

describe("approval race, end to end through the engine (D24)", () => {
  it("refuses the second transaction when its APPROVED write finds the approval already used", async () => {
    ledger = new MemoryApprovalNonceLedger();
    // The decision's read is made stale on purpose: it reports the nonce unseen for both transactions, as it would when
    // the two decisions read before either writes. The APPROVED write then decides, and it uses the real ledger.
    const staleReads: ApprovalNonceLedger = {
      isConsumed: async () => false,
      checkAndRecord: (nonce, expiresAt) =>
        ledger.checkAndRecord(nonce, expiresAt),
    };
    const { runtime, recorder } = setup(staleReads);
    const signals = await signedSignals("race-stale");

    const first = transaction("race-stale-1", { signals });
    const second = transaction("race-stale-2", { signals });
    await recorder.advance(first.businessTransactionId, "RECEIVED", "declare");
    await recorder.advance(second.businessTransactionId, "RECEIVED", "declare");

    const { trustRecord } = await runtime.execute(first);
    expect(trustRecord.executions[0]!.decision.outcome).toBe("APPROVED");

    const refused = await runtime.execute(second).catch((e: unknown) => e);
    expect(refused).toMatchObject({ status: 403, code: "POLICY_DENIED" });

    const history = await recorder.history(second.businessTransactionId);
    expect(history.map((e) => e.status)).toEqual([
      "RECEIVED",
      "POLICY_EVALUATED",
      "REJECTED",
    ]);
    expect(history.at(-1)?.reason).toMatch(/approval already used/);
    expect(await ledger.isConsumed(nonceOf(signals))).toBe(true);
  }, 60000);

  it("lets exactly one of two concurrent transactions use the approval", async () => {
    ledger = new MemoryApprovalNonceLedger();
    // The read of the nonce takes a moment, so both decisions read before either writes APPROVED.
    const slowReads: ApprovalNonceLedger = {
      isConsumed: async (nonce) => {
        const consumed = await ledger.isConsumed(nonce);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return consumed;
      },
      checkAndRecord: (nonce, expiresAt) =>
        ledger.checkAndRecord(nonce, expiresAt),
    };
    const { runtime, recorder } = setup(slowReads);
    const signals = await signedSignals("race-concurrent");

    const a = transaction("race-concurrent-a", { signals });
    const b = transaction("race-concurrent-b", { signals });
    await recorder.advance(a.businessTransactionId, "RECEIVED", "declare");
    await recorder.advance(b.businessTransactionId, "RECEIVED", "declare");

    const results = await Promise.allSettled([
      runtime.execute(a),
      runtime.execute(b),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({
      status: 403,
      code: "POLICY_DENIED",
    });

    // The refused one reached its APPROVED write, which found the nonce recorded, so the race branch refused it.
    const histories = await Promise.all([
      recorder.history(a.businessTransactionId),
      recorder.history(b.businessTransactionId),
    ]);
    const refusedHistory = histories.find((h) =>
      h.some((e) => e.status === "REJECTED"),
    );
    expect(refusedHistory?.at(-1)?.reason).toMatch(/approval already used/);

    // The approval was used once, by the transaction that succeeded.
    const statuses = await Promise.all([
      recorder.current(a.businessTransactionId),
      recorder.current(b.businessTransactionId),
    ]);
    const approvedCount = (
      await Promise.all([
        recorder.history(a.businessTransactionId),
        recorder.history(b.businessTransactionId),
      ])
    )
      .flat()
      .filter((e) => e.status === "APPROVED").length;
    expect(approvedCount).toBe(1);
    expect(statuses.map((s) => s?.status).sort()).toEqual(
      expect.arrayContaining(["REJECTED"]),
    );
  }, 60000);

  it("refuses a second transaction that comes later, and writes no APPROVED for it", async () => {
    ledger = new MemoryApprovalNonceLedger();
    const { runtime, recorder } = setup();
    const signals = await signedSignals("race-sequential");

    const first = transaction("race-sequential-1", { signals });
    const second = transaction("race-sequential-2", { signals });
    await recorder.advance(first.businessTransactionId, "RECEIVED", "declare");
    await recorder.advance(second.businessTransactionId, "RECEIVED", "declare");

    await runtime.execute(first);
    const refused = await runtime.execute(second).catch((e: unknown) => e);

    expect(refused).toMatchObject({ status: 403, code: "POLICY_DENIED" });
    expect((await recorder.current(second.businessTransactionId))?.status).toBe(
      "REJECTED",
    );
    // The reason says the approval was used, not that a signal fails to match the verified state.
    const reason = (await recorder.current(second.businessTransactionId))
      ?.reason;
    expect(reason).toBe(
      "Rejected: signal 'humanApproved': the signed approval has already been used.",
    );
    expect(
      (await recorder.history(second.businessTransactionId)).some(
        (e) => e.status === "APPROVED",
      ),
    ).toBe(false);
  }, 60000);
});

function nonceOf(signals: BusinessTransaction["signals"]): string {
  const artifact = signals?.approvalArtifact as { payload: { nonce: string } };
  return artifact.payload.nonce;
}
