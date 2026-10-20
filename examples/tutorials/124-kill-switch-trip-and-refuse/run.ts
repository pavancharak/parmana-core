// Tutorial 124: an operator trips the kill switch, a request is refused
// with KILL_SWITCH_ACTIVE, status still answers, and a reset lets the next
// request through. Runs against the real app on an ephemeral port, with
// in-memory stores, so nothing leaves this machine.
process.env.NODE_ENV = "test";

const { createExecutionSystem } =
  await import("../../../packages/api/src/bootstrap/createExecutionSystem.js");
const { createApplication } =
  await import("../../../packages/api/src/application.js");
const { createApp } = await import("../../../packages/api/src/app.js");
const { hashApiKey } =
  await import("../../../packages/api/src/auth/hashApiKey.js");
const { StaticKeyAuthenticator } =
  await import("../../../packages/api/src/auth/StaticKeyAuthenticator.js");
const { AuthorityType } = await import("@parmana/shared");
const { KillSwitchService, MemoryKillSwitchProbeLog, MemoryKillSwitchStore } =
  await import("../../../packages/api/src/killSwitch/KillSwitchService.js");

const OPERATOR_KEY = "tutorial-124-operator-raw-key";
const AGENT_KEY = "tutorial-124-agent-raw-key";

const killSwitch = new KillSwitchService(new MemoryKillSwitchStore(), {
  resetNeedsSecondOperator: false,
  probes: new MemoryKillSwitchProbeLog(),
});

const authenticator = new StaticKeyAuthenticator([
  {
    callerId: "operator",
    keyHash: hashApiKey(OPERATOR_KEY),
    credentialHolderType: AuthorityType.USER,
    allowedCapabilities: ["kill-switch:trip", "kill-switch:reset"],
  },
  {
    callerId: "agent",
    keyHash: hashApiKey(AGENT_KEY),
    credentialHolderType: AuthorityType.SERVICE,
    allowedCapabilities: ["test:fixture-execute"],
  },
]);

const application = createApplication(await createExecutionSystem());
const app = createApp(application, {
  callerAuth: { authenticator, auditSink: { record: async () => {} } },
  killSwitch,
});
const server = await new Promise<import("node:http").Server>((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const address = server.address();
const baseUrl = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;

async function call(method: string, path: string, key: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}

function expect(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(actual)}`);
  if (!ok) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}`);
  }
}

console.log();
console.log("==================================================");
console.log("Tutorial 124 - Kill Switch: Trip and Refuse");
console.log("==================================================");
console.log();

try {
  const before = await call("POST", "/execute", AGENT_KEY, {});
  expect(
    "before the trip, the agent is not refused by the switch",
    before.body?.error !== "KILL_SWITCH_ACTIVE",
    true,
  );

  const tripped = await call("POST", "/kill-switch/trip", OPERATOR_KEY, {
    reason: "suspicious refunds",
  });
  expect("the operator trips the switch (status)", tripped.status, 200);
  expect("the switch reports active", tripped.body.active, true);

  const refused = await call("POST", "/execute", AGENT_KEY, {});
  expect("while tripped, execute is refused (status)", refused.status, 503);
  expect(
    "while tripped, execute is refused (code)",
    refused.body.error,
    "KILL_SWITCH_ACTIVE",
  );

  const status = await call(
    "GET",
    "/kill-switch/status?nonce=tutorial-124",
    AGENT_KEY,
  );
  expect("status still answers while tripped", status.status, 200);
  expect("status echoes the nonce", status.body.nonce, "tutorial-124");
  expect("status is not signed yet", status.body.signed, false);

  const reset = await call("POST", "/kill-switch/reset", OPERATOR_KEY, {
    reason: "reviewed, safe",
  });
  expect(
    "the operator resets the switch (outcome)",
    reset.body.outcome,
    "reset",
  );

  const allowed = await call("POST", "/execute", AGENT_KEY, {});
  expect(
    "after the reset, execute is not refused by the switch",
    allowed.body?.error !== "KILL_SWITCH_ACTIVE",
    true,
  );

  console.log();
  console.log("All checks passed.");
} finally {
  server.close();
}
