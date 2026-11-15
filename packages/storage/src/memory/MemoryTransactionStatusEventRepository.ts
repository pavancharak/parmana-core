import {
  BusinessTransactionNotFoundError,
  InvalidStatusTransitionError,
  isAllowedTransition,
  type AppendTransactionStatusEvent,
  type TransactionStatusEvent,
  type TransactionStatusEventRepository,
} from "@parmana/shared";

import type { MemoryApprovalNonceLedger } from "./MemoryApprovalNonceLedger.js";

/**
 * In-memory implementation of TransactionStatusEventRepository.
 *
 * `append` checks and writes in one synchronous step, so no other write can
 * interleave with it, which is the same guarantee the Postgres implementation
 * gets from its row lock.
 *
 * `transactionExists` is asked before any write, so an event for an unknown
 * transaction is refused the same way Postgres refuses it (the foreign key).
 */
export class MemoryTransactionStatusEventRepository implements TransactionStatusEventRepository {
  private readonly events = new Map<string, TransactionStatusEvent[]>();

  constructor(
    private readonly transactionExists: (id: string) => Promise<boolean>,
    private readonly approvalNonces: MemoryApprovalNonceLedger,
  ) {}

  async append(
    input: AppendTransactionStatusEvent,
  ): Promise<TransactionStatusEvent> {
    const id = input.businessTransactionId;

    if (!(await this.transactionExists(id))) {
      throw new BusinessTransactionNotFoundError(id);
    }

    const list = this.events.get(id) ?? [];
    const current = list.length === 0 ? null : list[list.length - 1]!.status;

    if (current !== input.from) {
      throw new InvalidStatusTransitionError(
        id,
        `current status is ${current ?? "none"}, expected ${input.from ?? "none"}`,
      );
    }
    if (!isAllowedTransition(current, input.to)) {
      throw new InvalidStatusTransitionError(
        id,
        `status cannot move from ${current ?? "none"} to ${input.to}`,
      );
    }

    // Approvals are consumed by the same step as the event (decision D24): both or neither.
    if (input.consumeApprovalNonces !== undefined) {
      this.approvalNonces.recordAll(input.consumeApprovalNonces);
    }

    const event: TransactionStatusEvent = {
      eventId: input.eventId,
      businessTransactionId: id,
      sequence: list.length + 1,
      status: input.to,
      stage: input.stage,
      occurredAt: input.occurredAt,
      ...(input.recordRef !== undefined && { recordRef: input.recordRef }),
      ...(input.reason !== undefined && { reason: input.reason }),
      legacy: false,
    };
    list.push(event);
    this.events.set(id, list);
    return event;
  }

  async current(
    businessTransactionId: string,
  ): Promise<TransactionStatusEvent | null> {
    const list = this.events.get(businessTransactionId);
    return list === undefined || list.length === 0
      ? null
      : list[list.length - 1]!;
  }

  async history(
    businessTransactionId: string,
  ): Promise<readonly TransactionStatusEvent[]> {
    return [...(this.events.get(businessTransactionId) ?? [])];
  }
}
