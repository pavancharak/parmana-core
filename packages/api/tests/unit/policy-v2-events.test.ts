import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { policyV2 } from "@parmana/policy";

import {
  PolicyV2EventService,
  type PolicyV2BounceDeliveryStore,
} from "../../src/policyV2/policyV2Bounces.js";
import {
  signEvents,
  verifyEventsSignature,
} from "../../src/policyV2/policyV2EventsAuth.js";
import { policyV2ChannelsFromEnv } from "../../src/policyV2/sesEmailChannel.js";
import {
  SmtpEmailChannel,
  type SmtpSender,
} from "../../src/policyV2/smtpEmailChannel.js";
import { createPolicyV2EventsRouter } from "../../src/routes/policy-v2-events.js";

const NOW = new Date("2026-11-18T09:00:00Z");
const OWNER: policyV2.register.Person = {
  id: "owner-1",
  roles: ["parmana-owner"],
};
const SECRET = "x".repeat(40);

function memoryDeliveries(): PolicyV2BounceDeliveryStore {
  const seen = new Set<string>();
  return {
    async recordEvents(events) {
      const fresh: string[] = [];
      for (const e of events) {
        if (!seen.has(e.eventKey)) {
          seen.add(e.eventKey);
          fresh.push(e.eventKey);
        }
      }
      return fresh;
    },
  };
}

function memoryState() {
  const state = new Map<string, { body: unknown; version: number }>();
  const register = new policyV2.register.PolicyRegister(() => NOW);
  register.bootstrapOwner(OWNER.id);
  register.setContact(OWNER.id, { email: "owner@example.com" }, OWNER);
  state.set("register", { body: register.snapshot(), version: 1 });
  return {
    state,
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
}

function appWith(service: PolicyV2EventService) {
  const a = express();
  a.use(
    "/v2/notifications/events",
    createPolicyV2EventsRouter({ service, secret: SECRET }),
  );
  return a;
}

const bounceBody = (eventId = "provider-1/owner@example.com") =>
  JSON.stringify({
    events: [
      {
        eventId,
        type: "bounce",
        bounceKind: "permanent",
        messageId: "msg-1",
        recipient: "owner@example.com",
      },
    ],
  });

describe("the signature", () => {
  it("accepts a body signed with the shared secret, and refuses any other", () => {
    const body = bounceBody();
    expect(verifyEventsSignature(body, signEvents(body, SECRET), SECRET)).toBe(
      true,
    );
    expect(
      verifyEventsSignature(
        body,
        signEvents(body, "other-secret-value-0000000000000000"),
        SECRET,
      ),
    ).toBe(false);
    expect(
      verifyEventsSignature(body + " ", signEvents(body, SECRET), SECRET),
    ).toBe(false);
  });
});

describe("POST /v2/notifications/events", () => {
  it("records a signed permanent bounce, and raises a delivery-failure alert for it", async () => {
    const state = memoryState();
    const service = new PolicyV2EventService({
      deliveries: memoryDeliveries(),
      state,
      now: () => NOW,
    });
    const body = bounceBody();
    const res = await request(appWith(service))
      .post("/v2/notifications/events")
      .set("content-type", "text/plain")
      .set("x-parmana-signature", signEvents(body, SECRET))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.recorded).toBe(1);
    const alerts = (
      state.state.get("alerts")!.body as policyV2.alerts.AlertSnapshot
    ).alerts;
    expect(alerts[0]).toMatchObject({
      kind: "delivery-failure",
      assignee: "operations",
    });
  });

  it("counts an event once when the provider sends it again", async () => {
    const service = new PolicyV2EventService({
      deliveries: memoryDeliveries(),
      state: memoryState(),
      now: () => NOW,
    });
    const body = bounceBody();
    const app = appWith(service);
    const send = () =>
      request(app)
        .post("/v2/notifications/events")
        .set("content-type", "text/plain")
        .set("x-parmana-signature", signEvents(body, SECRET))
        .send(body);
    expect((await send()).body.recorded).toBe(1);
    expect((await send()).body.recorded).toBe(0);
  });

  it("refuses an unsigned or wrongly signed request with 403, and a malformed one with 400", async () => {
    const service = new PolicyV2EventService({
      deliveries: memoryDeliveries(),
      state: memoryState(),
      now: () => NOW,
    });
    const app = appWith(service);
    const unsigned = await request(app)
      .post("/v2/notifications/events")
      .set("content-type", "text/plain")
      .send(bounceBody());
    expect(unsigned.status).toBe(403);
    const malformed = JSON.stringify({
      events: [{ eventId: "", type: "bounce", messageId: "m", recipient: "x" }],
    });
    const badShape = await request(app)
      .post("/v2/notifications/events")
      .set("content-type", "text/plain")
      .set("x-parmana-signature", signEvents(malformed, SECRET))
      .send(malformed);
    expect(badShape.status).toBe(400);
  });
});

describe("the SMTP channel", () => {
  it("sends through the transport from the configured sender, and reports sent when a message id comes back", async () => {
    const sendMail = vi.fn(async () => ({
      messageId: "<abc@mail.example.com>",
    }));
    const transport: SmtpSender = { sendMail };
    const channel = new SmtpEmailChannel(transport, "alerts@example.com");
    expect(
      await channel.send({ to: "owner@example.com", subject: "s", body: "b" }),
    ).toBe(true);
    expect(sendMail).toHaveBeenCalledWith({
      from: "alerts@example.com",
      to: "owner@example.com",
      subject: "s",
      text: "b",
    });
  });

  it("reports not sent when the server returns no message id", async () => {
    const channel = new SmtpEmailChannel(
      { sendMail: async () => ({}) },
      "alerts@example.com",
    );
    expect(
      await channel.send({ to: "a@example.com", subject: "s", body: "b" }),
    ).toBe(false);
  });

  it("is chosen from PARMANA_POLICY_V2_SMTP_URL, and needs a sender address", () => {
    expect(
      policyV2ChannelsFromEnv({
        PARMANA_POLICY_V2_SMTP_URL: "smtp://relay.example.com:587",
        PARMANA_POLICY_V2_EMAIL_FROM: "alerts@example.com",
      }),
    ).toHaveProperty("email");
    expect(() =>
      policyV2ChannelsFromEnv({
        PARMANA_POLICY_V2_SMTP_URL: "smtp://relay.example.com:587",
      }),
    ).toThrow(/EMAIL_FROM/);
  });
});
