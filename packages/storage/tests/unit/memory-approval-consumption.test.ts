import { describe, expect, it } from "vitest";

import {
  ApprovalNonceAlreadyConsumedError,
  InvalidStatusTransitionError,
  type AppendTransactionStatusEvent,
} from "@parmana/shared";

import { MemoryApprovalNonceLedger } from "../../src/memory/MemoryApprovalNonceLedger.js";
import { MemoryTransactionStatusEventRepository } from "../../src/memory/MemoryTransactionStatusEventRepository.js";

const TX = "approval-tx-1";

function event(
  overrides: Partial<AppendTransactionStatusEvent>,
): AppendTransactionStatusEvent {
  return {
    eventId: crypto.randomUUID(),
    businessTransactionId: TX,
    from: null,
    to: "RECEIVED",
    stage: "declare",
    occurredAt: new Date("2026-11-15T10:00:00Z"),
    ...overrides,
  };
}

function setup() {
  const ledger = new MemoryApprovalNonceLedger();
  const repository = new MemoryTransactionStatusEventRepository(
    async () => true,
    ledger,
  );
  return { ledger, repository };
}

/** Moves the transaction to POLICY_EVALUATED, as the decision does before APPROVED. */
async function toPolicyEvaluated(
  repository: MemoryTransactionStatusEventRepository,
) {
  await repository.append(event({}));
  await repository.append(
    event({ from: "RECEIVED", to: "POLICY_EVALUATED", stage: "decide" }),
  );
}

describe("memory: approval nonces are consumed with the APPROVED event (D24)", () => {
  it("records the nonces with the APPROVED event", async () => {
    const { ledger, repository } = setup();
    await toPolicyEvaluated(repository);

    await repository.append(
      event({
        from: "POLICY_EVALUATED",
        to: "APPROVED",
        stage: "decide",
        consumeApprovalNonces: [
          { nonce: "n-1", expiresAt: "2099-01-01T00:00:00Z" },
        ],
      }),
    );

    expect(await ledger.isConsumed("n-1")).toBe(true);
    expect((await repository.current(TX))?.status).toBe("APPROVED");
  });

  it("refuses a second transaction that uses the same nonce, and writes nothing", async () => {
    const { repository } = setup();
    const OTHER = "approval-tx-2";
    await toPolicyEvaluated(repository);
    await repository.append(event({ businessTransactionId: OTHER }));
    await repository.append(
      event({
        businessTransactionId: OTHER,
        from: "RECEIVED",
        to: "POLICY_EVALUATED",
        stage: "decide",
      }),
    );

    await repository.append(
      event({
        from: "POLICY_EVALUATED",
        to: "APPROVED",
        stage: "decide",
        consumeApprovalNonces: [
          { nonce: "n-2", expiresAt: "2099-01-01T00:00:00Z" },
        ],
      }),
    );

    // The other transaction reaches the same point and reuses the approval.
    await expect(
      repository.append(
        event({
          businessTransactionId: OTHER,
          from: "POLICY_EVALUATED",
          to: "APPROVED",
          stage: "decide",
          consumeApprovalNonces: [
            { nonce: "n-2", expiresAt: "2099-01-01T00:00:00Z" },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(ApprovalNonceAlreadyConsumedError);

    // The refused write left nothing behind on the other transaction.
    expect((await repository.current(OTHER))?.status).toBe("POLICY_EVALUATED");
  });

  it("records none of the nonces when one of them is already consumed", async () => {
    const { ledger, repository } = setup();
    await toPolicyEvaluated(repository);
    ledger.recordAll([{ nonce: "taken", expiresAt: "2099-01-01T00:00:00Z" }]);

    await expect(
      repository.append(
        event({
          from: "POLICY_EVALUATED",
          to: "APPROVED",
          stage: "decide",
          consumeApprovalNonces: [
            { nonce: "fresh", expiresAt: "2099-01-01T00:00:00Z" },
            { nonce: "taken", expiresAt: "2099-01-01T00:00:00Z" },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(ApprovalNonceAlreadyConsumedError);

    expect(await ledger.isConsumed("fresh")).toBe(false);
  });

  it("refuses a list that names the same nonce twice, and records none", async () => {
    const { ledger, repository } = setup();
    await toPolicyEvaluated(repository);

    await expect(
      repository.append(
        event({
          from: "POLICY_EVALUATED",
          to: "APPROVED",
          stage: "decide",
          consumeApprovalNonces: [
            { nonce: "twice", expiresAt: "2099-01-01T00:00:00Z" },
            { nonce: "twice", expiresAt: "2099-01-01T00:00:00Z" },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(ApprovalNonceAlreadyConsumedError);

    expect(await ledger.isConsumed("twice")).toBe(false);
  });

  it("checks the transition before it consumes anything", async () => {
    const { ledger, repository } = setup();
    await repository.append(event({}));

    await expect(
      repository.append(
        event({
          from: "RECEIVED",
          to: "APPROVED",
          stage: "decide",
          consumeApprovalNonces: [
            { nonce: "early", expiresAt: "2099-01-01T00:00:00Z" },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidStatusTransitionError);

    expect(await ledger.isConsumed("early")).toBe(false);
  });
});
