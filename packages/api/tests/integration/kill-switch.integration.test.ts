import { describe, expect, it } from "vitest";
import request from "supertest";

import { AuthorityType } from "@parmana/shared";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";
import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";
import {
  KillSwitchService,
  MemoryKillSwitchProbeLog,
  MemoryKillSwitchStore,
} from "../../src/killSwitch/KillSwitchService.js";

import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";

/**
 * Kill switch over HTTP (ADR-0017, first slice). Operator keys hold the
 * trip and reset capabilities. The agent key does not.
 */

const OPERATOR_KEY = "kill-switch-operator-raw-key-for-tests-only";
const SECOND_OPERATOR_KEY = "kill-switch-operator-b-raw-key-for-tests-only";
const AGENT_KEY = "kill-switch-agent-raw-key-for-tests-only";
const PROBE_KEY = "kill-switch-probe-raw-key-for-tests-only";

function buildApp() {
  const { executionSystem } = createInspectableExecutionSystem();
  const application = createApplication(executionSystem);
  const killSwitch = new KillSwitchService(new MemoryKillSwitchStore(), {
    resetNeedsSecondOperator: true,
    probes: new MemoryKillSwitchProbeLog(),
  });

  const authenticator = new StaticKeyAuthenticator([
    {
      callerId: "operator-a",
      keyHash: hashApiKey(OPERATOR_KEY),
      credentialHolderType: AuthorityType.USER,
      allowedCapabilities: ["kill-switch:trip", "kill-switch:reset"],
    },
    {
      callerId: "operator-b",
      keyHash: hashApiKey(SECOND_OPERATOR_KEY),
      credentialHolderType: AuthorityType.USER,
      allowedCapabilities: ["kill-switch:reset"],
    },
    {
      callerId: "scheduler",
      keyHash: hashApiKey(PROBE_KEY),
      credentialHolderType: AuthorityType.SERVICE,
      allowedCapabilities: ["kill-switch:probe"],
    },
    {
      callerId: "agent-1",
      keyHash: hashApiKey(AGENT_KEY),
      credentialHolderType: AuthorityType.SERVICE,
      allowedCapabilities: ["test:fixture-execute"],
    },
  ]);

  const app = createApp(application, {
    callerAuth: { authenticator, auditSink: new InMemoryCallerAuditSink() },
    killSwitch,
  });

  return { app };
}

describe("kill switch over HTTP (ADR-0017, first slice)", () => {
  it("refuses a trip from a key without the trip capability", async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post("/kill-switch/trip")
      .set("Authorization", `Bearer ${AGENT_KEY}`)
      .send({ reason: "agent trying to stop itself" });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("CAPABILITY_NOT_ALLOWED");
  });

  it("refuses a trip without a reason", async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post("/kill-switch/trip")
      .set("Authorization", `Bearer ${OPERATOR_KEY}`)
      .send({});

    expect(response.status).toBe(400);
  });

  it("refuses execute with KILL_SWITCH_ACTIVE after a trip, and reset lets the next request through", async () => {
    const { app } = buildApp();

    const tripped = await request(app)
      .post("/kill-switch/trip")
      .set("Authorization", `Bearer ${OPERATOR_KEY}`)
      .send({ reason: "suspicious refunds" });
    expect(tripped.status).toBe(200);
    expect(tripped.body.active).toBe(true);

    const refused = await request(app)
      .post("/execute")
      .set("Authorization", `Bearer ${AGENT_KEY}`)
      .send({});
    expect(refused.status).toBe(503);
    expect(refused.body.error).toBe("KILL_SWITCH_ACTIVE");

    const pending = await request(app)
      .post("/kill-switch/reset")
      .set("Authorization", `Bearer ${OPERATOR_KEY}`)
      .send({ reason: "reviewed, safe" });
    expect(pending.status).toBe(202);
    expect(pending.body.outcome).toBe("pending");
    expect(pending.body.state.active).toBe(true);

    const reset = await request(app)
      .post("/kill-switch/reset")
      .set("Authorization", `Bearer ${SECOND_OPERATOR_KEY}`)
      .send({ reason: "confirmed by a second operator" });
    expect(reset.status).toBe(200);
    expect(reset.body.outcome).toBe("reset");
    expect(reset.body.state.active).toBe(false);
    expect(reset.body.state.resetRequestedBy).toBe("operator-a");

    const allowed = await request(app)
      .post("/execute")
      .set("Authorization", `Bearer ${AGENT_KEY}`)
      .send({});
    expect(allowed.body.error).not.toBe("KILL_SWITCH_ACTIVE");
  });

  it("keeps status reachable while tripped and echoes the nonce", async () => {
    const { app } = buildApp();

    await request(app)
      .post("/kill-switch/trip")
      .set("Authorization", `Bearer ${OPERATOR_KEY}`)
      .send({ reason: "check" });

    const status = await request(app)
      .get("/kill-switch/status?nonce=abc123")
      .set("Authorization", `Bearer ${AGENT_KEY}`);

    expect(status.status).toBe(200);
    expect(status.body.active).toBe(true);
    expect(status.body.nonce).toBe("abc123");
    expect(status.body.signed).toBe(false);
  });

  it("keeps the trip and reset routes reachable while tripped", async () => {
    const { app } = buildApp();

    await request(app)
      .post("/kill-switch/trip")
      .set("Authorization", `Bearer ${OPERATOR_KEY}`)
      .send({ reason: "first" });

    const second = await request(app)
      .post("/kill-switch/trip")
      .set("Authorization", `Bearer ${OPERATOR_KEY}`)
      .send({ reason: "second" });

    expect(second.status).toBe(200);
    expect(second.body.tripReason).toBe("second");
  });

  it("refuses a second reset from the operator who asked first", async () => {
    const { app } = buildApp();

    await request(app)
      .post("/kill-switch/trip")
      .set("Authorization", `Bearer ${OPERATOR_KEY}`)
      .send({ reason: "trip" });
    await request(app)
      .post("/kill-switch/reset")
      .set("Authorization", `Bearer ${OPERATOR_KEY}`)
      .send({ reason: "first" });

    const again = await request(app)
      .post("/kill-switch/reset")
      .set("Authorization", `Bearer ${OPERATOR_KEY}`)
      .send({ reason: "again" });

    expect(again.status).toBe(409);
    expect(again.body.error).toBe("SAME_OPERATOR_CANNOT_CONFIRM_RESET");
  });

  it("refuses a probe from a key without the probe capability", async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post("/kill-switch/probes")
      .set("Authorization", `Bearer ${AGENT_KEY}`)
      .send({ status: 503, errorCode: "KILL_SWITCH_ACTIVE" });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("CAPABILITY_NOT_ALLOWED");
  });

  it("records a probe that the scheduler sends while tripped", async () => {
    const { app } = buildApp();

    await request(app)
      .post("/kill-switch/trip")
      .set("Authorization", `Bearer ${OPERATOR_KEY}`)
      .send({ reason: "probe" });

    const probe = await request(app)
      .post("/kill-switch/probes")
      .set("Authorization", `Bearer ${PROBE_KEY}`)
      .send({ status: 503, errorCode: "KILL_SWITCH_ACTIVE" });

    expect(probe.status).toBe(201);
    expect(probe.body.refused).toBe(true);
    expect(probe.body.passed).toBe(true);
    expect(probe.body.recordedBy).toBe("scheduler");
  });

  it("refuses a probe with no integer status", async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post("/kill-switch/probes")
      .set("Authorization", `Bearer ${PROBE_KEY}`)
      .send({ status: "503" });

    expect(response.status).toBe(400);
  });
});
