import { policyV2 } from "@parmana/policy";

import { recordDeliveryFailures } from "./policyV2Notifications.js";
import {
  requireSnsUrl,
  SnsRefused,
  verifySnsEnvelope,
  type SnsEnvelope,
} from "./policyV2Sns.js";

/**
 * Delivery events from any mail provider, in one neutral form. A provider adapter turns its own
 * bounce or complaint reports into these events. The core stores each event once, raises a
 * delivery-failure alert for a permanent bounce or a complaint, and suppresses the address. Amazon
 * SNS is one adapter, and it is optional.
 */

/** One bounce, complaint or delivery, for one recipient. eventId is unique for each. */
export interface NeutralDeliveryEvent {
  readonly eventId: string;
  readonly type: "bounce" | "complaint" | "delivery";
  readonly bounceKind?: "permanent" | "transient";
  readonly messageId: string;
  readonly recipient: string;
}

/** The part of the delivery store the core uses. The Postgres store satisfies it. */
export interface PolicyV2BounceDeliveryStore {
  recordEvents(
    events: readonly policyV2.persistence.DeliveryEventRow[],
  ): Promise<string[]>;
}

/** The part of the state store the core uses: the alerts. */
export interface PolicyV2BounceStateStore {
  load<T>(
    component: "alerts",
  ): Promise<{ readonly body: T; readonly version: number } | undefined>;
  commitSnapshots(commit: policyV2.persistence.SnapshotCommit): Promise<void>;
}

export interface PolicyV2BounceCoreDeps {
  readonly deliveries: PolicyV2BounceDeliveryStore;
  readonly state: PolicyV2BounceStateStore;
  readonly now: () => Date;
}

/** Stores the events and raises the alerts they call for. Returns the number of new events. */
export async function recordDeliveryEvents(
  events: readonly NeutralDeliveryEvent[],
  deps: PolicyV2BounceCoreDeps,
): Promise<number> {
  const rows: policyV2.persistence.DeliveryEventRow[] = [];
  for (const event of events) {
    if (event.type !== "bounce" && event.type !== "complaint") continue;
    const bounceType =
      event.type === "bounce"
        ? event.bounceKind === "permanent"
          ? "Permanent"
          : "Transient"
        : undefined;
    rows.push({
      eventKey: event.eventId,
      eventType: event.type === "bounce" ? "Bounce" : "Complaint",
      ...(bounceType !== undefined ? { bounceType } : {}),
      messageId: event.messageId,
      recipient: event.recipient,
      detail: event,
    });
  }
  if (rows.length === 0) return 0;
  const fresh = new Set(await deps.deliveries.recordEvents(rows));
  const failures = rows
    .filter(
      (row) =>
        fresh.has(row.eventKey) &&
        (row.eventType === "Complaint" || row.bounceType === "Permanent"),
    )
    .map((row) => ({
      to: row.recipient,
      channel: "email" as const,
      alertId: `msg-${row.messageId}`,
      reason: `the provider reported a ${row.eventType === "Complaint" ? "complaint" : "permanent bounce"} for this address`,
    }));
  await recordDeliveryFailures(deps.state, failures, deps.now());
  return fresh.size;
}

/** The neutral endpoint's service: events that a provider adapter has already translated. */
export class PolicyV2EventService {
  constructor(private readonly deps: PolicyV2BounceCoreDeps) {}

  async handle(events: readonly NeutralDeliveryEvent[]): Promise<number> {
    return recordDeliveryEvents(events, this.deps);
  }
}

export interface PolicyV2BounceServiceOptions extends PolicyV2BounceCoreDeps {
  /** Fetches the certificate SNS names for a signature. */
  readonly fetchCertificate: (url: string) => Promise<string>;
  /** Confirms a subscription by fetching the URL SNS names. */
  readonly confirmSubscription: (url: string) => Promise<void>;
}

export interface PolicyV2BounceResult {
  readonly handled: "subscription-confirmed" | "recorded" | "ignored";
  readonly recorded: number;
}

/** The Amazon SNS adapter: verifies an SNS message and translates SES reports into neutral events. */
export class PolicyV2BounceService {
  constructor(private readonly options: PolicyV2BounceServiceOptions) {}

  /** Handles one message from SNS. Throws SnsRefused if the message does not verify. */
  async handle(body: string): Promise<PolicyV2BounceResult> {
    let envelope: SnsEnvelope;
    try {
      envelope = JSON.parse(body) as SnsEnvelope;
    } catch {
      throw new SnsRefused("The message is not JSON.");
    }
    if (
      typeof envelope !== "object" ||
      envelope === null ||
      typeof envelope.Type !== "string"
    ) {
      throw new SnsRefused("The message has no type.");
    }
    await verifySnsEnvelope(envelope, this.options.fetchCertificate);

    if (envelope.Type === "SubscriptionConfirmation") {
      if (envelope.SubscribeURL === undefined)
        throw new SnsRefused("The confirmation has no subscribe address.");
      await this.options.confirmSubscription(
        requireSnsUrl(envelope.SubscribeURL).toString(),
      );
      return { handled: "subscription-confirmed", recorded: 0 };
    }
    if (envelope.Type !== "Notification")
      return { handled: "ignored", recorded: 0 };

    const event = JSON.parse(envelope.Message) as Record<string, unknown>;
    const kind = (event.eventType ?? event.notificationType) as
      string | undefined;
    const messageId = (event.mail as { messageId?: unknown } | undefined)
      ?.messageId;
    if (typeof messageId !== "string")
      return { handled: "ignored", recorded: 0 };

    const neutral: NeutralDeliveryEvent[] = [];
    if (kind === "Bounce") {
      const bounce = event.bounce as {
        bounceType?: unknown;
        bouncedRecipients?: Array<{ emailAddress?: unknown }>;
      };
      for (const r of bounce.bouncedRecipients ?? []) {
        if (typeof r.emailAddress !== "string") continue;
        neutral.push({
          eventId: `${envelope.MessageId}/${r.emailAddress.toLowerCase()}`,
          type: "bounce",
          bounceKind:
            bounce.bounceType === "Permanent" ? "permanent" : "transient",
          messageId,
          recipient: r.emailAddress,
        });
      }
    } else if (kind === "Complaint") {
      const complaint = event.complaint as {
        complainedRecipients?: Array<{ emailAddress?: unknown }>;
      };
      for (const r of complaint.complainedRecipients ?? []) {
        if (typeof r.emailAddress !== "string") continue;
        neutral.push({
          eventId: `${envelope.MessageId}/${r.emailAddress.toLowerCase()}`,
          type: "complaint",
          messageId,
          recipient: r.emailAddress,
        });
      }
    }
    if (neutral.length === 0) return { handled: "ignored", recorded: 0 };
    const recorded = await recordDeliveryEvents(neutral, this.options);
    return { handled: "recorded", recorded };
  }
}
