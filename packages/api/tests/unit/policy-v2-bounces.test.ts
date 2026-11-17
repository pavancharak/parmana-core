import {
  createPrivateKey,
  createSign,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { policyV2 } from "@parmana/policy";

import {
  PolicyV2BounceService,
  type PolicyV2BounceDeliveryStore,
} from "../../src/policyV2/policyV2Bounces.js";
import {
  dispatchNotifications,
  type NotificationChannel,
} from "../../src/policyV2/policyV2Notifications.js";
import {
  canonicalSnsString,
  SnsRefused,
  type SnsEnvelope,
} from "../../src/policyV2/policyV2Sns.js";
import { createPolicyV2BouncesRouter } from "../../src/routes/policy-v2-bounces.js";

const NOW = new Date("2026-11-18T09:00:00Z");
const OWNER: policyV2.register.Person = {
  id: "owner-1",
  roles: ["parmana-owner"],
};
const CERT_URL =
  "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-abc.pem";

const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PUBLIC_PEM = rsa.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const PRIVATE: KeyObject = createPrivateKey(
  rsa.privateKey.export({ type: "pkcs8", format: "pem" }),
);

/** Builds an SNS envelope and signs it the way SNS does, with SignatureVersion 2 (SHA-256). */
function envelope(
  type: string,
  fields: Partial<SnsEnvelope> & { Message: string },
): string {
  const base: SnsEnvelope = {
    Type: type,
    MessageId: `sns-${Math.random().toString(36).slice(2)}`,
    TopicArn: "arn:aws:sns:eu-west-1:123456789012:ses-events",
    Timestamp: "2026-11-18T09:00:00.000Z",
    SignatureVersion: "2",
    Signature: "",
    SigningCertURL: CERT_URL,
    ...fields,
  };
  const signature = createSign("RSA-SHA256")
    .update(canonicalSnsString(base))
    .sign(PRIVATE, "base64");
  return JSON.stringify({ ...base, Signature: signature });
}

function bounceMessage(
  kind: "Permanent" | "Transient",
  recipient = "owner@example.com",
  sesId = "ses-1",
): string {
  return JSON.stringify({
    notificationType: "Bounce",
    mail: { messageId: sesId },
    bounce: {
      bounceType: kind,
      bouncedRecipients: [{ emailAddress: recipient }],
    },
  });
}

/** An in-memory delivery store with the same rule: an event is stored once. */
function memoryDeliveries(): PolicyV2BounceDeliveryStore & {
  rows: Map<string, policyV2.persistence.DeliveryEventRow>;
} {
  const rows = new Map<string, policyV2.persistence.DeliveryEventRow>();
  return {
    rows,
    async recordEvents(events) {
      const fresh: string[] = [];
      for (const event of events) {
        if (!rows.has(event.eventKey)) {
          rows.set(event.eventKey, event);
          fresh.push(event.eventKey);
        }
      }
      return fresh;
    },
  };
}

/** A register with the owner's email, and an empty alert board, held in one state store. */
function memoryState() {
  const state = new Map<string, { body: unknown; version: number }>();
  const register = new policyV2.register.PolicyRegister(() => NOW);
  register.bootstrapOwner(OWNER.id);
  register.setContact(OWNER.id, { email: "owner@example.com" }, OWNER);
  state.set("register", { body: register.snapshot(), version: 1 });
  return {
    state,
    async load<T>(component: "register" | "alerts") {
      return state.get(component) as { body: T; version: number } | undefined;
    },
    async commitSnapshots(commit: policyV2.persistence.SnapshotCommit) {
      if (commit.alerts !== undefined) {
        state.set("alerts", {
          body: commit.alerts.body,
          version: commit.alerts.readVersion + 1,
        });
      }
    },
  };
}

function service(
  deliveries = memoryDeliveries(),
  state = memoryState(),
  confirm = vi.fn(async () => {}),
) {
  return {
    deliveries,
    state,
    confirm,
    svc: new PolicyV2BounceService({
      deliveries,
      state,
      fetchCertificate: async () => PUBLIC_PEM,
      confirmSubscription: confirm,
      now: () => NOW,
    }),
  };
}

/** A register whose owner has an email address, so a send has somewhere to go. */
function registerWithOwnerEmail(): policyV2.register.PolicyRegister {
  const r = new policyV2.register.PolicyRegister(() => NOW);
  r.bootstrapOwner(OWNER.id);
  r.setContact(OWNER.id, { email: "owner@example.com" }, OWNER);
  return r;
}

function alertsOf(
  state: ReturnType<typeof memoryState>,
): policyV2.alerts.Alert[] {
  return (
    (
      state.state.get("alerts")?.body as
        policyV2.alerts.AlertSnapshot | undefined
    )?.alerts ?? []
  );
}

describe("verifying SNS messages", () => {
  it("refuses a message whose content was changed after signing", async () => {
    const good = JSON.parse(
      envelope("Notification", { Message: bounceMessage("Permanent") }),
    ) as SnsEnvelope;
    const tampered = {
      ...good,
      Message: bounceMessage("Permanent", "someone-else@example.com"),
    };
    await expect(
      service().svc.handle(JSON.stringify(tampered)),
    ).rejects.toBeInstanceOf(SnsRefused);
  });

  it("refuses a certificate that is not named by an SNS host", async () => {
    const good = JSON.parse(
      envelope("Notification", { Message: bounceMessage("Permanent") }),
    ) as SnsEnvelope;
    const elsewhere = {
      ...good,
      SigningCertURL: "https://evil.example.com/cert.pem",
    };
    await expect(
      service().svc.handle(JSON.stringify(elsewhere)),
    ).rejects.toBeInstanceOf(SnsRefused);
  });
});

describe("recording a bounce or a complaint", () => {
  it("raises a delivery-failure alert for a permanent bounce, and suppresses the address", async () => {
    const { svc, deliveries, state } = service();
    const result = await svc.handle(
      envelope("Notification", { Message: bounceMessage("Permanent") }),
    );
    expect(result).toEqual({ handled: "recorded", recorded: 1 });
    const alerts = alertsOf(state);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      kind: "delivery-failure",
      assignee: "operations",
    });
    expect(deliveries.rows.size).toBe(1);
  });

  it("counts a retried SNS message once, and raises no second alert", async () => {
    const { svc, state } = service();
    const message = envelope("Notification", {
      Message: bounceMessage("Permanent"),
    });
    await svc.handle(message);
    const again = await svc.handle(message);
    expect(again.recorded).toBe(0);
    expect(alertsOf(state)).toHaveLength(1);
  });

  it("records a transient bounce without an alert, and a complaint with one", async () => {
    const transient = service();
    await transient.svc.handle(
      envelope("Notification", {
        Message: bounceMessage("Transient", "owner@example.com", "ses-t"),
      }),
    );
    expect(alertsOf(transient.state)).toHaveLength(0);

    const complaint = service();
    await complaint.svc.handle(
      envelope("Notification", {
        Message: JSON.stringify({
          notificationType: "Complaint",
          mail: { messageId: "ses-c" },
          complaint: {
            complainedRecipients: [{ emailAddress: "owner@example.com" }],
          },
        }),
      }),
    );
    expect(alertsOf(complaint.state)).toHaveLength(1);
  });

  it("suppresses an address after a permanent bounce, so no further message is sent to it", async () => {
    const deliveries = memoryDeliveries();
    const { svc } = service(deliveries);
    await svc.handle(
      envelope("Notification", { Message: bounceMessage("Permanent") }),
    );
    const isSuppressed = async (address: string) =>
      [...deliveries.rows.values()].some(
        (r) =>
          r.recipient.toLowerCase() === address.toLowerCase() &&
          r.bounceType === "Permanent",
      );
    const send = vi.fn(async () => true);
    const channel: NotificationChannel = { send };
    const result = await dispatchNotifications(
      [
        {
          to: "owner-1",
          channel: "email",
          alertId: "alert-1",
          subject: "s",
          body: "b",
        },
      ],
      {
        register: registerWithOwnerEmail(),
        channels: { email: channel },
        isSuppressed,
      },
    );
    expect(send).not.toHaveBeenCalled();
    expect(result.failures[0]?.reason).toMatch(/suppressed/);
  });

  it("confirms a subscription by fetching the address SNS names", async () => {
    const { svc, confirm } = service();
    const subscribe =
      "https://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription&Token=abc";
    const result = await svc.handle(
      envelope("SubscriptionConfirmation", {
        Message: "confirm",
        SubscribeURL: subscribe,
        Token: "abc",
      }),
    );
    expect(result.handled).toBe("subscription-confirmed");
    expect(confirm).toHaveBeenCalledWith(subscribe);
  });
});

describe("POST /v2/notifications/ses", () => {
  function app(svc: PolicyV2BounceService) {
    const a = express();
    a.use("/v2/notifications", createPolicyV2BouncesRouter(svc));
    return a;
  }

  it("accepts a verified message, and refuses one that does not verify", async () => {
    const { svc } = service();
    const ok = await request(app(svc))
      .post("/v2/notifications/ses")
      .set("content-type", "text/plain; charset=UTF-8")
      .send(envelope("Notification", { Message: bounceMessage("Permanent") }));
    expect(ok.status).toBe(200);
    expect(ok.body.recorded).toBe(1);

    const bad = await request(app(svc))
      .post("/v2/notifications/ses")
      .set("content-type", "text/plain; charset=UTF-8")
      .send(
        JSON.stringify({
          Type: "Notification",
          Message: "x",
          Signature: "x",
          SigningCertURL: CERT_URL,
        }),
      );
    expect(bad.status).toBe(403);
  });
});
