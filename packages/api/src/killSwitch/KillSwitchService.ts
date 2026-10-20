/**
 * Operator kill switch (ADR-0017).
 *
 * While active, the guard refuses authorization and approval requests with
 * KILL_SWITCH_ACTIVE. Trip, reset, status and probe stay reachable so the switch
 * can always be cleared and checked. If the state cannot be read, the switch
 * reports active (fail closed).
 *
 * Reset takes two different operators when resetNeedsSecondOperator is set
 * (production, ADR-0017 decision 1). The first reset request is held as pending;
 * a second, different operator completes it.
 */

export interface KillSwitchState {
  readonly active: boolean;
  readonly version: number;
  readonly trippedBy?: string | undefined;
  readonly trippedAt?: string | undefined;
  readonly tripReason?: string | undefined;
  readonly pendingResetBy?: string | undefined;
  readonly pendingResetAt?: string | undefined;
  readonly pendingResetReason?: string | undefined;
  readonly resetRequestedBy?: string | undefined;
  readonly resetBy?: string | undefined;
  readonly resetAt?: string | undefined;
  readonly resetReason?: string | undefined;
}

export interface KillSwitchStore {
  read(): Promise<KillSwitchState>;
  /** Writes next only if the stored version still equals expectedVersion. */
  compareAndWrite(
    expectedVersion: number,
    next: KillSwitchState,
  ): Promise<boolean>;
}

/** One probe result: what the scheduler saw from a request sent while the switch was in some state. */
export interface KillSwitchProbe {
  readonly probedAt: string;
  readonly recordedBy: string;
  readonly switchActive: boolean;
  readonly switchVersion: number;
  readonly observedStatus: number;
  readonly observedErrorCode?: string;
  readonly refused: boolean;
  readonly passed: boolean;
}

export interface KillSwitchProbeLog {
  record(probe: KillSwitchProbe): Promise<void>;
}

export interface KillSwitchOptions {
  /** Production: a reset takes two different operators (ADR-0017 decision 1). */
  readonly resetNeedsSecondOperator: boolean;
  readonly probes: KillSwitchProbeLog;
}

export type KillSwitchResetOutcome = "pending" | "reset";

export interface KillSwitchResetResult {
  readonly outcome: KillSwitchResetOutcome;
  readonly state: KillSwitchState;
}

/** The same operator asked for a reset twice; a second operator must confirm. */
export class SameOperatorResetError extends Error {
  constructor() {
    super("A second operator must confirm this reset.");
    this.name = "SameOperatorResetError";
  }
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

export class MemoryKillSwitchProbeLog implements KillSwitchProbeLog {
  readonly probes: KillSwitchProbe[] = [];

  async record(probe: KillSwitchProbe): Promise<void> {
    this.probes.push(probe);
  }
}

export class KillSwitchService {
  constructor(
    private readonly store: KillSwitchStore,
    private readonly options: KillSwitchOptions,
  ) {}

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
      resetRequestedBy: current.resetRequestedBy,
      resetBy: current.resetBy,
      resetAt: current.resetAt,
      resetReason: current.resetReason,
    }));
  }

  async reset(
    callerId: string,
    reason: string,
    at: Date = new Date(),
  ): Promise<KillSwitchResetResult> {
    const state = await this.write((current) =>
      this.resetStep(current, callerId, reason, at),
    );

    return { outcome: state.active ? "pending" : "reset", state };
  }

  /** Records what the scheduler observed for one probe request. The probe passes when the refusal matches the switch state. */
  async recordProbe(
    callerId: string,
    observed: { readonly status: number; readonly errorCode?: string },
    at: Date = new Date(),
  ): Promise<KillSwitchProbe> {
    const state = await this.store.read();
    const refused =
      observed.status === 503 && observed.errorCode === "KILL_SWITCH_ACTIVE";

    const probe: KillSwitchProbe = {
      probedAt: at.toISOString(),
      recordedBy: callerId,
      switchActive: state.active,
      switchVersion: state.version,
      observedStatus: observed.status,
      ...(observed.errorCode !== undefined
        ? { observedErrorCode: observed.errorCode }
        : {}),
      refused,
      passed: refused === state.active,
    };

    await this.options.probes.record(probe);
    return probe;
  }

  private resetStep(
    current: KillSwitchState,
    callerId: string,
    reason: string,
    at: Date,
  ): KillSwitchState {
    if (!current.active) {
      return current;
    }

    if (!this.options.resetNeedsSecondOperator) {
      return completeReset(current, callerId, reason, at, callerId);
    }

    if (current.pendingResetBy === undefined) {
      return {
        ...current,
        version: current.version + 1,
        pendingResetBy: callerId,
        pendingResetAt: at.toISOString(),
        pendingResetReason: reason,
      };
    }

    if (current.pendingResetBy === callerId) {
      throw new SameOperatorResetError();
    }

    return completeReset(current, callerId, reason, at, current.pendingResetBy);
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

function completeReset(
  current: KillSwitchState,
  callerId: string,
  reason: string,
  at: Date,
  requestedBy: string,
): KillSwitchState {
  return {
    active: false,
    version: current.version + 1,
    trippedBy: current.trippedBy,
    trippedAt: current.trippedAt,
    tripReason: current.tripReason,
    resetRequestedBy: requestedBy,
    resetBy: callerId,
    resetAt: at.toISOString(),
    resetReason: reason,
  };
}
