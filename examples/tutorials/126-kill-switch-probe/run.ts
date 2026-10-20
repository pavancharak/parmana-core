// Tutorial 126: an external probe checks the kill switch from outside. It sends
// a request to /execute with a probe key, reports what came back, and Parmana
// records whether the refusal matched the switch state. A probe that reports a
// request getting through while the switch is tripped is recorded as failed.
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

const OPERATOR_KEY = "tutorial-126-operator-raw-key";
const PROBE_KEY = "tutorial-126-probe-raw-key";

const probes = new MemoryKillSwitchProbeLog();
const killSwitch = new KillSwitchService(new MemoryKillSwitchStore(), {
  resetNeedsSecondOperator: false,
  probes,
});

const authenticator = new StaticKeyAuthenticator([
  {
    callerId: "operator",
    keyHash: hashApiKey(OPERATOR_KEY),
    credentialHolderType: AuthorityType.USER,
    allowedCapabilities: ["kill-switch:trip", "kill-switch:reset"],
  },
  {
    callerId: "scheduler",
    keyHash: hashApiKey(PROBE_KEY),
    credentialHolderType: AuthorityType.SERVICE,
    allowedCapabilities: ["kill-switch:probe"],
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

// What the scheduler does: send one harmless request to /execute, then report
// the status and error code it got back.
async function probeOnce(): Promise<{ status: number; errorCode?: string }> {
  const sent = await call("POST", "/execute", PROBE_KEY, {});
  return { status: sent.status, errorCode: sent.body?.error };
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
console.log("Tutorial 126 - Kill Switch: External Probe");
console.log("==================================================");
console.log();

try {
  const idle = await probeOnce();
  const idleRecord = await call("POST", "/kill-switch/probes", PROBE_KEY, idle);
  expect(
    "while the switch is off, the probe passes",
    idleRecord.body.passed,
    true,
  );
  expect(
    "the record shows the switch state",
    idleRecord.body.switchActive,
    false,
  );

  await call("POST", "/kill-switch/trip", OPERATOR_KEY, {
    reason: "probe test",
  });

  const tripped = await probeOnce();
  const trippedRecord = await call(
    "POST",
    "/kill-switch/probes",
    PROBE_KEY,
    tripped,
  );
  expect(
    "while tripped, the probe is refused with KILL_SWITCH_ACTIVE",
    tripped.errorCode,
    "KILL_SWITCH_ACTIVE",
  );
  expect("while tripped, the probe passes", trippedRecord.body.passed, true);

  const broken = await call("POST", "/kill-switch/probes", PROBE_KEY, {
    status: 200,
  });
  expect(
    "a request getting through while tripped is recorded as failed",
    broken.body.passed,
    false,
  );

  expect("every probe result is kept", probes.probes.length, 3);

  console.log();
  console.log("All checks passed.");
} finally {
  server.close();
}
