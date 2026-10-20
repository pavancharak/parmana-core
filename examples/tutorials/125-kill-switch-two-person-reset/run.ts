// Tutorial 125: in production a kill switch reset takes two different
// operators. The first request is held as pending, the same operator cannot
// confirm it, and a second, different operator completes it. Runs against the
// real app on an ephemeral port with in-memory stores.
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

const OPERATOR_A_KEY = "tutorial-125-operator-a-raw-key";
const OPERATOR_B_KEY = "tutorial-125-operator-b-raw-key";

const killSwitch = new KillSwitchService(new MemoryKillSwitchStore(), {
  resetNeedsSecondOperator: true,
  probes: new MemoryKillSwitchProbeLog(),
});

const authenticator = new StaticKeyAuthenticator([
  {
    callerId: "operator-a",
    keyHash: hashApiKey(OPERATOR_A_KEY),
    credentialHolderType: AuthorityType.USER,
    allowedCapabilities: ["kill-switch:trip", "kill-switch:reset"],
  },
  {
    callerId: "operator-b",
    keyHash: hashApiKey(OPERATOR_B_KEY),
    credentialHolderType: AuthorityType.USER,
    allowedCapabilities: ["kill-switch:reset"],
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
console.log("Tutorial 125 - Kill Switch: Two-Person Reset");
console.log("==================================================");
console.log();

try {
  await call("POST", "/kill-switch/trip", OPERATOR_A_KEY, {
    reason: "suspicious refunds",
  });

  const first = await call("POST", "/kill-switch/reset", OPERATOR_A_KEY, {
    reason: "looks fine",
  });
  expect(
    "the first reset request is held as pending (status)",
    first.status,
    202,
  );
  expect(
    "the pending request names its operator",
    first.body.state.pendingResetBy,
    "operator-a",
  );
  expect(
    "the switch stays on while the reset is pending",
    first.body.state.active,
    true,
  );

  const same = await call("POST", "/kill-switch/reset", OPERATOR_A_KEY, {
    reason: "again",
  });
  expect(
    "the same operator cannot confirm their own reset (status)",
    same.status,
    409,
  );
  expect(
    "the refusal has its code",
    same.body.error,
    "SAME_OPERATOR_CANNOT_CONFIRM_RESET",
  );

  const second = await call("POST", "/kill-switch/reset", OPERATOR_B_KEY, {
    reason: "confirmed",
  });
  expect(
    "a different operator completes the reset (status)",
    second.status,
    200,
  );
  expect(
    "the completed reset records the requester",
    second.body.state.resetRequestedBy,
    "operator-a",
  );
  expect(
    "the completed reset records the confirmer",
    second.body.state.resetBy,
    "operator-b",
  );
  expect("the switch is off after the reset", second.body.state.active, false);

  console.log();
  console.log("All checks passed.");
} finally {
  server.close();
}
