import { policyV2 } from "@parmana/policy";

/**
 * Alerts reach people through channels. The alert board asks for a message and the outbox
 * queues it. After the state is saved, the messages are sent. A message that cannot be sent is
 * recorded as a delivery-failure alert for Operations. The console always shows every alert,
 * whether or not a message is sent.
 */

export type ChannelName = "email" | "phone";

/** A channel that sends a message. Returns false if the provider did not accept it. */
export interface NotificationChannel {
  send(message: {
    readonly to: string;
    readonly subject: string;
    readonly body: string;
  }): Promise<boolean>;
}

/** The channels that are configured. A channel with no entry is not configured, and its messages are skipped. */
export type NotificationChannels = Partial<
  Record<ChannelName, NotificationChannel>
>;

/** A message queued for sending. `to` is a person id or a group name, such as parmana-owner. */
export interface Notification {
  readonly to: string;
  readonly channel: ChannelName;
  readonly alertId: string;
  readonly subject: string;
  readonly body: string;
}

export interface DeliveryFailure {
  readonly to: string;
  readonly channel: ChannelName;
  readonly alertId: string;
  readonly reason: string;
}

/**
 * Collects the messages the alert board asks for. Email is sent for every alert. Phone is sent
 * too once an alert has escalated to stage 2, which is the Parmana owner. Delivery-failure alerts
 * are shown on the console only, so a failed send cannot queue another send.
 */
export class NotificationOutbox {
  private readonly pending: Notification[] = [];

  /** The alert board's notifier. It always reports success: the send happens later, after the save. */
  readonly notify = (
    to: string,
    alert: policyV2.alerts.Alert,
    channel: "console" | "email" | "phone",
  ): boolean => {
    if (channel !== "email" || alert.kind === "delivery-failure") return true;
    const subject = `[${alert.kind}] ${alert.ref}`;
    const body = [
      alert.explanation,
      `If nothing is done: ${alert.consequence}`,
      "Steps:",
      ...alert.steps.map((step, index) => `${index + 1}. ${step}`),
      `Help: ${alert.helpRef}`,
    ].join("\n");
    this.pending.push({
      to,
      channel: "email",
      alertId: alert.id,
      subject,
      body,
    });
    if (alert.stage >= 2) {
      this.pending.push({
        to,
        channel: "phone",
        alertId: alert.id,
        subject,
        body,
      });
    }
    return true;
  };

  /** The messages queued since the last call. Clears them. */
  take(): Notification[] {
    return this.pending.splice(0);
  }
}

export interface DispatchResult {
  readonly sent: number;
  /** Messages for a channel that is not configured. The console still shows the alert. */
  readonly skipped: number;
  readonly failures: readonly DeliveryFailure[];
}

/**
 * Sends the queued messages. Each message goes to the contacts of the person or group it names.
 * A person with no contact for the channel is a failure, not a skip, so a missing contact is seen.
 */
export async function dispatchNotifications(
  pending: readonly Notification[],
  deps: {
    readonly register: policyV2.register.PolicyRegister;
    readonly channels: NotificationChannels;
    /** True for an address that SES reported as bouncing or complaining. Such an address is not sent to. */
    readonly isSuppressed?: (address: string) => Promise<boolean>;
  },
): Promise<DispatchResult> {
  let sent = 0;
  let skipped = 0;
  const failures: DeliveryFailure[] = [];
  for (const message of pending) {
    const channel = deps.channels[message.channel];
    if (channel === undefined) {
      skipped += 1;
      continue;
    }
    const addresses = addressesFor(message.to, message.channel, deps.register);
    if (addresses.length === 0) {
      failures.push({
        to: message.to,
        channel: message.channel,
        alertId: message.alertId,
        reason: `there is no ${message.channel} contact for ${message.to}`,
      });
      continue;
    }
    for (const address of addresses) {
      if (
        deps.isSuppressed !== undefined &&
        (await deps.isSuppressed(address))
      ) {
        failures.push({
          to: message.to,
          channel: message.channel,
          alertId: message.alertId,
          reason: "the address is suppressed after an SES bounce or complaint",
        });
        continue;
      }
      const accepted = await channel
        .send({ to: address, subject: message.subject, body: message.body })
        .catch(() => false);
      if (accepted) {
        sent += 1;
      } else {
        failures.push({
          to: message.to,
          channel: message.channel,
          alertId: message.alertId,
          reason: "the provider did not accept the message",
        });
      }
    }
  }
  return { sent, skipped, failures };
}

/** The addresses for a target: its own contact, and for a group, the contacts of the people in it. */
function addressesFor(
  to: string,
  channel: ChannelName,
  register: policyV2.register.PolicyRegister,
): string[] {
  const people = new Set<string>([to]);
  if (to === "parmana-owner") {
    for (const id of register.holdersOf("parmana-owner")) people.add(id);
  }
  if (to === "reviewers") {
    for (const id of register.holdersOf("reviewer")) people.add(id);
  }
  const addresses: string[] = [];
  for (const id of people) {
    const contact = register.getContact(id);
    const address = channel === "email" ? contact?.email : contact?.phone;
    if (address !== undefined) addresses.push(address);
  }
  return addresses;
}

/** The alert board's record of a failed send: a delivery-failure alert for Operations. */
export function deliveryFailureAlerts(
  board: policyV2.alerts.AlertBoard,
  failures: readonly DeliveryFailure[],
  now: Date,
): void {
  for (const failure of failures) {
    board.raise({
      ref: `delivery-${failure.alertId}-${failure.to}-${failure.channel}`,
      kind: "delivery-failure",
      class: "immediate",
      assignee: "operations",
      openedAt: now.toISOString(),
      deadline: new Date(now.getTime() + 86_400_000).toISOString(),
      explanation: `A ${failure.channel} notification for ${failure.alertId} to ${failure.to} was not delivered: ${failure.reason}.`,
      consequence: "The person may not know that an action is waiting.",
      steps: ["Confirm the contact details, then send the notification again."],
      helpRef: "alerts-delivery-failure",
    });
  }
}

/**
 * Records failed sends as delivery-failure alerts. The alert state is read again first, so the
 * record is written at the version it is based on, and a write by another process is not lost.
 */
export async function recordDeliveryFailures(
  store: {
    load<T>(
      component: "alerts",
    ): Promise<{ readonly body: T; readonly version: number } | undefined>;
    commitSnapshots(commit: policyV2.persistence.SnapshotCommit): Promise<void>;
  },
  failures: readonly DeliveryFailure[],
  now: Date,
): Promise<void> {
  if (failures.length === 0) return;
  const state = await store.load<policyV2.alerts.AlertSnapshot>("alerts");
  const board = new policyV2.alerts.AlertBoard(
    () => now,
    () => true,
    () => true,
  );
  if (state !== undefined) board.load(state.body);
  deliveryFailureAlerts(board, failures, now);
  await store.commitSnapshots({
    alerts: { body: board.snapshot(), readVersion: state?.version ?? 0 },
  });
}
