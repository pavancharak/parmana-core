import type {
  TransactionExecutionLease,
  TransactionExecutionLock,
} from "@parmana/shared";

const POLL_INTERVAL_MS = 25;

/** In-process lock for the memory provider: one process, one lock table. */
export class MemoryTransactionExecutionLock implements TransactionExecutionLock {
  private readonly held = new Set<string>();

  async acquire(
    businessTransactionId: string,
    timeoutMs: number,
  ): Promise<TransactionExecutionLease | null> {
    const deadline = Date.now() + timeoutMs;

    while (this.held.has(businessTransactionId)) {
      if (Date.now() >= deadline) return null;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    this.held.add(businessTransactionId);
    let released = false;

    return {
      release: async (): Promise<void> => {
        if (released) return;
        released = true;
        this.held.delete(businessTransactionId);
      },
    };
  }
}
