import { randomUUID } from "node:crypto";

import {
  type AppendTransactionStatusEvent,
  type TransactionStatus,
  type TransactionStatusEvent,
  type TransactionStatusEventRepository,
  type TransactionStatusStage,
} from "@parmana/shared";

/**
 * Records a business transaction's status as append-only events (decision D23,
 * design sections 3 and 5).
 *
 * `advance` reads the current status and asks the repository to append the
 * next one. The repository checks the expected status and the transition table
 * under the transaction's row lock, so a stale read cannot skip a step: a
 * concurrent writer makes the append fail with INVALID_STATUS_TRANSITION (409).
 */
export class TransactionStatusRecorder {
  constructor(
    private readonly events: TransactionStatusEventRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly newEventId: () => string = () => randomUUID(),
  ) {}

  async advance(
    businessTransactionId: string,
    to: TransactionStatus,
    stage: TransactionStatusStage,
    options: { reason?: string; recordRef?: string } = {},
  ): Promise<TransactionStatusEvent> {
    const current = await this.events.current(businessTransactionId);

    return this.events.append({
      eventId: this.newEventId(),
      businessTransactionId,
      from: current?.status ?? null,
      to,
      stage,
      occurredAt: this.now(),
      ...(options.reason !== undefined && { reason: options.reason }),
      ...(options.recordRef !== undefined && { recordRef: options.recordRef }),
    });
  }

  /**
   * The RECEIVED event the declare stage writes, built here so a declaration
   * store can write it together with the transaction (design section 3).
   */
  declarationEvent(
    businessTransactionId: string,
  ): AppendTransactionStatusEvent {
    return {
      eventId: this.newEventId(),
      businessTransactionId,
      from: null,
      to: "RECEIVED",
      stage: "declare",
      occurredAt: this.now(),
    };
  }

  current(
    businessTransactionId: string,
  ): Promise<TransactionStatusEvent | null> {
    return this.events.current(businessTransactionId);
  }

  history(
    businessTransactionId: string,
  ): Promise<readonly TransactionStatusEvent[]> {
    return this.events.history(businessTransactionId);
  }
}
