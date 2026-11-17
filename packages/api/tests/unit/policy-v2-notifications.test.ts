import { describe, expect, it, vi } from "vitest";
import { policyV2 } from "@parmana/policy";

import {
  deliveryFailureAlerts,
  dispatchNotifications,
  NotificationOutbox,
  recordDeliveryFailures,
  type NotificationChannel,
  type NotificationChannels,
} from "../../src/policyV2/policyV2Notifications.js";

const NOW = new Date("2026-11-18T09:00:00Z");
const OWNER: policyV2.register.Person = {
  id: "owner-1",
  roles: ["parmana-owner"],
};

function channel(
  accept = true,
): NotificationChannel & { send: ReturnType<typeof vi.fn> } {
  return {
    send: vi.fn(async () => accept),
  } as unknown as NotificationChannel & {
    send: ReturnType<typeof vi.fn>;
  };
}

/** A register with an owner, a reviewer, and contacts for both. */
function registerWithContacts(): policyV2.register.PolicyRegister {
  const r = new policyV2.register.PolicyRegister(() => NOW);
  r.bootstrapOwner(OWNER.id);
  r.grantRole(OWNER, "rev-1", "reviewer");
  r.setContact(
    "owner-1",
    { email: "owner@example.com", phone: "+447700900123" },
    OWNER,
  );
  r.setContact("rev-1", { email: "reviewer@example.com" }, OWNER);
  return r;
}

/** A board with one open review alert, whose outbox is returned. The clock is moved by the test. */
function boardWithAlert(
  clock: { now: Date },
  deadline: string,
  assignee = "reviewers",
) {
  const outbox = new NotificationOutbox();
  const board = new policyV2.alerts.AlertBoard(
    () => clock.now,
    outbox.notify,
    () => true,
  );
  board.raise({
    ref: "review-1",
    kind: "review",
    class: "immediate",
    assignee,
    openedAt: clock.now.toISOString(),
    deadline,
    explanation: "A decision is waiting for review.",
    consequence: "It expires if no one reviews it.",
    steps: ["Review it."],
    helpRef: "reviewers",
  });
  return { board, outbox };
}

describe("the outbox", () => {
  it("queues an email for each alert, and a phone message once it escalates to the Parmana owner", () => {
    const clock = { now: NOW };
    const { board, outbox } = boardWithAlert(clock, "2026-11-20T09:00:00Z");
    expect(outbox.take().map((m) => m.channel)).toEqual(["email"]);

    clock.now = new Date("2026-11-19T22:00:00Z");
    board.sweep();
    const escalated = outbox.take();
    expect(escalated.map((m) => m.channel)).toEqual(["email", "phone"]);
    expect(escalated[0]!.subject).toBe("[review] review-1");
  });

  it("does not queue a message for a delivery-failure alert, so a failed send cannot queue another", () => {
    const outbox = new NotificationOutbox();
    const board = new policyV2.alerts.AlertBoard(
      () => NOW,
      outbox.notify,
      () => true,
    );
    deliveryFailureAlerts(
      board,
      [{ to: "reviewers", channel: "email", alertId: "alert-1", reason: "x" }],
      NOW,
    );
    expect(outbox.take()).toEqual([]);
  });
});

describe("sending the queued messages", () => {
  const message = {
    to: "owner-1",
    channel: "email" as const,
    alertId: "alert-1",
    subject: "s",
    body: "b",
  };

  it("sends to the person's own address", async () => {
    const send = channel();
    const result = await dispatchNotifications([message], {
      register: registerWithContacts(),
      channels: { email: send },
    });
    expect(result.sent).toBe(1);
    expect(send.send).toHaveBeenCalledWith({
      to: "owner@example.com",
      subject: "s",
      body: "b",
    });
  });

  it("sends a group message to every person in the group", async () => {
    const send = channel();
    const result = await dispatchNotifications(
      [
        { ...message, to: "reviewers" },
        { ...message, to: "parmana-owner", channel: "email" },
      ],
      { register: registerWithContacts(), channels: { email: send } },
    );
    expect(result.sent).toBe(2);
    expect(
      send.send.mock.calls.map((c) => (c[0] as { to: string }).to),
    ).toEqual(["reviewer@example.com", "owner@example.com"]);
  });

  it("skips a channel that is not configured, and reports the console still shows the alert", async () => {
    const result = await dispatchNotifications([message], {
      register: registerWithContacts(),
      channels: {},
    });
    expect(result).toEqual({ sent: 0, skipped: 1, failures: [] });
  });

  it("records a failure when there is no contact for the channel", async () => {
    const send = channel();
    const result = await dispatchNotifications(
      [{ ...message, to: "operations" }],
      {
        register: registerWithContacts(),
        channels: { email: send },
      },
    );
    expect(result.failures).toEqual([
      expect.objectContaining({
        to: "operations",
        reason: "there is no email contact for operations",
      }),
    ]);
    expect(send.send).not.toHaveBeenCalled();
  });

  it("records a failure when the provider refuses or throws", async () => {
    const refusing: NotificationChannels = { email: channel(false) };
    const refused = await dispatchNotifications([message], {
      register: registerWithContacts(),
      channels: refusing,
    });
    expect(refused.failures).toHaveLength(1);

    const throwing: NotificationChannels = {
      email: {
        send: async () => {
          throw new Error("network down");
        },
      },
    };
    const thrown = await dispatchNotifications([message], {
      register: registerWithContacts(),
      channels: throwing,
    });
    expect(thrown.failures).toHaveLength(1);
  });
});

describe("contacts in the register", () => {
  it("lets only the Parmana owner set a contact, and checks each address", () => {
    const r = registerWithContacts();
    expect(() =>
      r.setContact(
        "rev-1",
        { email: "x@example.com" },
        { id: "rev-1", roles: [] },
      ),
    ).toThrow(/parmana-owner/);
    expect(() =>
      r.setContact("rev-1", { email: "not-an-address" }, OWNER),
    ).toThrow(/not an email/);
    expect(() =>
      r.setContact("rev-1", { phone: "07700 900123" }, OWNER),
    ).toThrow(/international/);
    expect(() => r.setContact("rev-1", {}, OWNER)).toThrow(
      /needs an email address or a phone/,
    );
    expect(r.getContact("rev-1")?.email).toBe("reviewer@example.com");
  });

  it("records each contact change in the audit log", () => {
    const r = registerWithContacts();
    expect(r.auditLog().filter((e) => e.event === "contact.set")).toHaveLength(
      2,
    );
  });
});

describe("recording a failed send", () => {
  it("raises a delivery-failure alert for Operations, saved at the version read", async () => {
    const state = new Map<string, { body: unknown; version: number }>();
    const store = {
      async load<T>(component: "alerts") {
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
    await recordDeliveryFailures(
      store,
      [
        {
          to: "reviewers",
          channel: "email",
          alertId: "alert-1",
          reason: "no contact",
        },
      ],
      NOW,
    );
    const saved = state.get("alerts")!;
    expect(saved.version).toBe(1);
    const snapshot = saved.body as policyV2.alerts.AlertSnapshot;
    expect(snapshot.alerts[0]).toMatchObject({
      kind: "delivery-failure",
      assignee: "operations",
    });
  });
});
