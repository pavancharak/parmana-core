/**
 * Operator kill switch, first slice (ADR-0017).
 *
 * While active, the guard refuses authorization and approval requests with
 * KILL_SWITCH_ACTIVE. Trip, reset and status stay reachable so the switch can
 * always be cleared. If the state cannot be read, the switch reports active
 * (fail closed).
 *
 * This slice keeps state in memory. It is NOT durable: a restart clears a
 * trip. Do not deploy the switch to production until the durable store
 * (ADR-0017, "First build") replaces MemoryKillSwitchStore.
 */

export interface KillSwitchState {
  readonly active: boolean;
  readonly version: number;
  readonly trippedBy?: string;
  readonly trippedAt?: string;
  readonly tripReason?: string;
  readonly resetBy?: string;
  readonly resetAt?: string;
  readonly resetReason?: string;
}

export interface KillSwitchStore {
  read(): Promise<KillSwitchState>;
  /** Writes next only if the stored version still equals expectedVersion. */
  compareAndWrite(
    expectedVersion: number,
    next: KillSwitchState,
  ): Promise<boolean>;
}

export class MemoryKillSwitchStore implements KillSwitchStore {
  private state: KillSwitchState = { active: false, version: 0 };

  async read(): Promise<KillSwitchState> {
    return this.state;
  }

  async compareAndWrite(
    expectedVersion: number,
    next: KillSwitchState,
  ): Promise<boolean> {
    if (this.state.version !== expectedVersion) {
      return false;
    }

    this.state = next;
    return true;
  }
}

export class KillSwitchService {
  constructor(private readonly store: KillSwitchStore) {}

  /** True when requests must be refused. A read failure also reports true. */
  async isActive(): Promise<boolean> {
    try {
      return (await this.store.read()).active;
    } catch {
      return true;
    }
  }

  async state(): Promise<KillSwitchState> {
    return this.store.read();
  }

  async trip(
    callerId: string,
    reason: string,
    at: Date = new Date(),
  ): Promise<KillSwitchState> {
    return this.write((current) => ({
      active: true,
      version: current.version + 1,
      trippedBy: callerId,
      trippedAt: at.toISOString(),
      tripReason: reason,
      resetBy: current.resetBy,
      resetAt: current.resetAt,
      resetReason: current.resetReason,
    }));
  }

  async reset(
    callerId: string,
    reason: string,
    at: Date = new Date(),
  ): Promise<KillSwitchState> {
    return this.write((current) => ({
      active: false,
      version: current.version + 1,
      trippedBy: current.trippedBy,
      trippedAt: current.trippedAt,
      tripReason: current.tripReason,
      resetBy: callerId,
      resetAt: at.toISOString(),
      resetReason: reason,
    }));
  }

  /** Retries on a concurrent write, so two operators acting at once cannot lose an update. */
  private async write(
    build: (current: KillSwitchState) => KillSwitchState,
  ): Promise<KillSwitchState> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.store.read();
      const next = build(current);

      if (await this.store.compareAndWrite(current.version, next)) {
        return next;
      }
    }

    throw new Error(
      "Kill switch state changed concurrently; retry the request.",
    );
  }
}
