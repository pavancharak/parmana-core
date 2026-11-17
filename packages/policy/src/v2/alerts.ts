/**
 * Alerts for the governance console (design 11).
 *
 * Every pending item that needs a person now becomes an alert when it is created.
 * An alert cannot be dismissed. It clears only when its last step is done, or when
 * its item is closed by its own process, with a reason. It escalates to the backup,
 * then the Parmana owner, then Operations. A pending item that blocks an action stops
 * that action from approving. If an alert cannot be shown, the decision waits.
 *
 * Standalone. The console screens and the notification channels are not built here.
 */

export type AlertClass = "immediate" | "due" | "blocking";

export type EscalationStage = 0 | 1 | 2 | 3;

/** Who an alert reaches at each stage: the assignee, then the backup, then the Parmana owner, then Operations. */
function targetFor(alert: Alert, stage: EscalationStage): string {
  if (stage === 0) return alert.assignee;
  if (stage === 1) return alert.backup ?? "parmana-owner";
  if (stage === 2) return "parmana-owner";
  return "operations";
}

/** When an alert first becomes visible. A due alert is shown a set number of days before its deadline. */
function showFrom(
  alert: Pick<AlertInput, "class" | "openedAt" | "deadline" | "showDaysBefore">,
): number {
  if (alert.class === "due" && alert.showDaysBefore !== undefined) {
    return Date.parse(alert.deadline) - alert.showDaysBefore * 86_400_000;
  }
  return Date.parse(alert.openedAt);
}

export interface AlertInput {
  /** The pending item, such as "review-3" or "threshold erp:pay-invoice/automaticLimit". */
  readonly ref: string;
  readonly kind: string;
  readonly class: AlertClass;
  readonly assignee: string;
  readonly backup?: string;
  /** The action this alert blocks while it is open, if any. */
  readonly blocksAction?: string;
  readonly openedAt: string;
  /** The deadline. For a due alert, the date the item is due. */
  readonly deadline: string;
  /** Due alerts are shown this many days before their deadline. */
  readonly showDaysBefore?: number;
  /** Plain-language explanation: what is pending and why. */
  readonly explanation: string;
  /** What happens if nothing is done. */
  readonly consequence: string;
  /** The steps of the task, in order. The alert clears when the last is done. */
  readonly steps: readonly string[];
  /** The help entry for the task, from the owner help guide. */
  readonly helpRef: string;
}

export interface Alert extends AlertInput {
  readonly id: string;
  readonly status: "open" | "complete" | "closed";
  readonly stepIndex: number;
  readonly stage: EscalationStage;
  readonly closeReason?: string;
}

export interface AlertEvent {
  readonly at: string;
  readonly by: string;
  readonly event: string;
  readonly detail: string;
}

export interface Person {
  readonly id: string;
  readonly roles: readonly string[];
}

/** Sends a message on a channel. Returns false if it could not be delivered. */
export type Notifier = (
  to: string,
  alert: Alert,
  channel: "console" | "email" | "phone",
) => boolean;

export class AlertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlertError";
  }
}

/** The alert board's contents as plain data. */
export interface AlertSnapshot {
  readonly alerts: readonly Alert[];
  readonly events: readonly AlertEvent[];
  readonly counter: number;
}

export class AlertBoard {
  private readonly alerts = new Map<string, Alert>();
  private readonly events: AlertEvent[] = [];
  private counter = 0;

  constructor(
    private readonly now: () => Date,
    private readonly notify: Notifier,
    /** False when the store behind the alerts cannot be read or written. */
    private readonly healthy: () => boolean = () => true,
  ) {}

  /** Creates an alert. It exists from the moment its item exists. */
  raise(input: AlertInput): Alert {
    if (input.steps.length === 0)
      throw new AlertError("An alert needs at least one step.");
    if (
      !input.explanation.trim() ||
      !input.consequence.trim() ||
      !input.helpRef.trim()
    ) {
      throw new AlertError(
        "An alert needs an explanation, a consequence and a help entry.",
      );
    }
    this.counter += 1;
    const alert: Alert = {
      ...input,
      id: `alert-${this.counter}`,
      status: "open",
      stepIndex: 0,
      stage: 0,
    };
    this.alerts.set(alert.id, alert);
    this.record(
      "system",
      "alert.raised",
      `${alert.id} ${alert.kind} for ${alert.assignee}`,
    );
    if (this.now().getTime() >= showFrom(alert))
      this.deliver(alert, alert.assignee);
    return alert;
  }

  /** Completes the current step of the task. The alert clears only after the last step. */
  completeStep(id: string, by: string): Alert {
    const alert = this.requireOpen(id);
    const next = alert.stepIndex + 1;
    if (next >= alert.steps.length) {
      const done: Alert = { ...alert, status: "complete", stepIndex: next };
      this.alerts.set(id, done);
      this.record(by, "alert.complete", id);
      return done;
    }
    const advanced: Alert = { ...alert, stepIndex: next };
    this.alerts.set(id, advanced);
    this.record(
      by,
      "alert.step",
      `${id} step ${next + 1} of ${alert.steps.length}`,
    );
    return advanced;
  }

  /**
   * Closes an alert because its item was closed by its own process (expired,
   * withdrawn or replaced). A reason is required, and it is logged.
   */
  closeByProcess(id: string, reason: string, by: string): Alert {
    const alert = this.requireOpen(id);
    if (!reason.trim())
      throw new AlertError("Closing an alert needs a reason.");
    const closed: Alert = { ...alert, status: "closed", closeReason: reason };
    this.alerts.set(id, closed);
    this.record(by, "alert.closed", `${id}: ${reason}`);
    return closed;
  }

  /** There is no way to dismiss, snooze or hide an alert. Only the two calls above clear one. */

  /**
   * Moves alerts along: shows due alerts, escalates an alert past its stage point, and
   * raises an Operations alert if a notification cannot be delivered.
   */
  sweep(): Alert[] {
    const nowMs = this.now().getTime();
    const changed: Alert[] = [];
    for (const alert of [...this.alerts.values()]) {
      if (alert.status !== "open") continue;
      const start = showFrom(alert);
      if (nowMs < start) continue;
      const deadline = Date.parse(alert.deadline);
      const span = deadline - start;
      const stageAt = [
        start,
        start + span / 2,
        start + (3 * span) / 4,
        deadline,
      ];
      let stage: EscalationStage = alert.stage;
      while (stage < 3 && nowMs >= stageAt[stage + 1]!)
        stage = (stage + 1) as EscalationStage;
      if (stage !== alert.stage) {
        const escalated: Alert = { ...alert, stage };
        this.alerts.set(alert.id, escalated);
        this.record(
          "system",
          "alert.escalated",
          `${alert.id} to ${targetFor(alert, stage)}`,
        );
        this.deliver(escalated, targetFor(alert, stage));
        changed.push(escalated);
      }
    }
    return changed;
  }

  /** The open alerts a person must see on every screen. Never hidden, never dismissed. */
  visibleFor(person: Person): Alert[] {
    const nowMs = this.now().getTime();
    return [...this.alerts.values()].filter((alert) => {
      if (alert.status !== "open" || nowMs < showFrom(alert)) return false;
      if (alert.assignee === person.id || alert.backup === person.id)
        return true;
      if (alert.stage >= 2 && person.roles.includes("parmana-owner"))
        return true;
      return alert.stage >= 3 && person.roles.includes("operator");
    });
  }

  /**
   * Whether an action may approve. A pending item that blocks it stops it. If the alert
   * store cannot be read, the action waits, and the failure is recorded.
   */
  mayApprove(capability: string): { allowed: boolean; reason: string } {
    if (!this.healthy()) {
      this.record("system", "alert.store-unavailable", capability);
      return {
        allowed: false,
        reason: "The alert store is unavailable, so the decision waits.",
      };
    }
    const blocking = [...this.alerts.values()].find(
      (a) => a.status === "open" && a.blocksAction === capability,
    );
    if (blocking !== undefined) {
      return {
        allowed: false,
        reason: `${blocking.kind} is open for ${capability}: ${blocking.explanation}`,
      };
    }
    return { allowed: true, reason: "No open alert blocks this action." };
  }

  /** The board's contents as plain data, for storage. */
  snapshot(): AlertSnapshot {
    return {
      alerts: [...this.alerts.values()],
      events: [...this.events],
      counter: this.counter,
    };
  }

  /** Replaces the board's contents with a snapshot taken earlier. */
  load(snapshot: AlertSnapshot): void {
    this.alerts.clear();
    this.events.length = 0;
    for (const alert of snapshot.alerts) this.alerts.set(alert.id, alert);
    this.events.push(...snapshot.events);
    this.counter = snapshot.counter;
  }

  get(id: string): Alert | undefined {
    return this.alerts.get(id);
  }

  auditLog(): readonly AlertEvent[] {
    return [...this.events];
  }

  private requireOpen(id: string): Alert {
    const alert = this.alerts.get(id);
    if (alert === undefined)
      throw new AlertError(`Alert "${id}" does not exist.`);
    if (alert.status !== "open")
      throw new AlertError(`Alert "${id}" is already ${alert.status}.`);
    return alert;
  }

  private deliver(alert: Alert, to: string): void {
    const delivered = this.notify(to, alert, "email");
    if (!delivered) {
      this.record("system", "alert.delivery-failed", `${alert.id} to ${to}`);
      if (alert.kind !== "delivery-failure") {
        this.raise({
          ref: `${alert.id}/delivery`,
          kind: "delivery-failure",
          class: "immediate",
          assignee: "operations",
          openedAt: this.now().toISOString(),
          deadline: new Date(this.now().getTime() + 86_400_000).toISOString(),
          explanation: `A notification for ${alert.id} could not be delivered to ${to}.`,
          consequence: "The person may not know an action is waiting.",
          steps: ["Confirm the contact details and re-send the notification."],
          helpRef: "alerts-delivery-failure",
        });
      }
    }
  }

  private record(by: string, event: string, detail: string): void {
    this.events.push({ at: this.now().toISOString(), by, event, detail });
  }
}
