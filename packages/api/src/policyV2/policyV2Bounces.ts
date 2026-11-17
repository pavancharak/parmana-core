import { policyV2 } from "@parmana/policy";

import { recordDeliveryFailures } from "./policyV2Notifications.js";
import {
  requireSnsUrl,
  SnsRefused,
  verifySnsEnvelope,
  type SnsEnvelope,
} from "./policyV2Sns.js";

/**
 * Bounces and complaints that SES reports, delivered by Amazon SNS. A message is verified before
 * it is read. Each bounce or complaint is stored once per recipient. A permanent bounce or a
 * complaint raises a delivery-failure alert, and suppresses the address, so no further message is
 * sent to it.
 */

/** The part of the delivery store the bounces use. The Postgres store satisfies it. */
export interface PolicyV2BounceDeliveryStore {
  recordEvents(
    events: readonly policyV2.persistence.DeliveryEventRow[],
  ): Promise<string[]>;
}

/** The part of the state store the bounces use: the register for contacts, and the alerts. */
export interface PolicyV2BounceStateStore {
  load<T>(
    component: "register" | "alerts",
  ): Promise<{ readonly body: T; readonly version: number } | undefined>;
  commitSnapshots(commit: policyV2.persistence.SnapshotCommit): Promise<void>;
}

export interface PolicyV2BounceServiceOptions {
  readonly deliveries: PolicyV2BounceDeliveryStore;
  readonly state: PolicyV2BounceStateStore;
  /** Fetches the certificate SNS names for a signature. */
  readonly fetchCertificate: (url: string) => Promise<string>;
  /** Confirms a subscription by fetching the URL SNS names. */
  readonly confirmSubscription: (url: string) => Promise<void>;
  readonly now?: () => Date;
}

export interface PolicyV2BounceResult {
  readonly handled: "subscription-confirmed" | "recorded" | "ignored";
  readonly recorded: number;
}

export class PolicyV2BounceService {
  private readonly clock: () => Date;

  constructor(private readonly options: PolicyV2BounceServiceOptions) {
    this.clock = options.now ?? (() => new Date());
  }

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
    const sesMessageId = (event.mail as { messageId?: unknown } | undefined)
      ?.messageId;
    if (typeof sesMessageId !== "string")
      return { handled: "ignored", recorded: 0 };

    const rows: policyV2.persistence.DeliveryEventRow[] = [];
    if (kind === "Bounce") {
      const bounce = event.bounce as {
        bounceType?: unknown;
        bouncedRecipients?: Array<{ emailAddress?: unknown }>;
      };
      for (const r of bounce.bouncedRecipients ?? []) {
        if (typeof r.emailAddress !== "string") continue;
        rows.push(
          this.row(
            envelope.MessageId,
            "Bounce",
            r.emailAddress,
            sesMessageId,
            event,
            bounce.bounceType,
          ),
        );
      }
    } else if (kind === "Complaint") {
      const complaint = event.complaint as {
        complainedRecipients?: Array<{ emailAddress?: unknown }>;
      };
      for (const r of complaint.complainedRecipients ?? []) {
        if (typeof r.emailAddress !== "string") continue;
        rows.push(
          this.row(
            envelope.MessageId,
            "Complaint",
            r.emailAddress,
            sesMessageId,
            event,
          ),
        );
      }
    }
    if (rows.length === 0) return { handled: "ignored", recorded: 0 };

    const fresh = new Set(await this.options.deliveries.recordEvents(rows));
    const failures = rows
      .filter(
        (row) =>
          fresh.has(row.eventKey) &&
          (row.eventType === "Complaint" || row.bounceType === "Permanent"),
      )
      .map((row) => ({
        to: row.recipient,
        channel: "email" as const,
        alertId: `ses-${row.sesMessageId}`,
        reason: `SES reported a ${row.eventType === "Complaint" ? "complaint" : "permanent bounce"} for this address`,
      }));
    await recordDeliveryFailures(this.options.state, failures, this.clock());
    return { handled: "recorded", recorded: fresh.size };
  }

  private row(
    snsMessageId: string,
    eventType: "Bounce" | "Complaint",
    recipient: string,
    sesMessageId: string,
    detail: unknown,
    bounceType?: unknown,
  ): policyV2.persistence.DeliveryEventRow {
    return {
      eventKey: `${snsMessageId}/${recipient.toLowerCase()}`,
      eventType,
      ...(typeof bounceType === "string" ? { bounceType } : {}),
      sesMessageId,
      recipient,
      detail,
    };
  }
}
