import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

//
// Rate limiting: the API protects itself, per caller and per source.
//
// Two limits matter for a caller:
//   * POST /execute is limited per caller (keyed by the authenticated caller
//     ID, not the IP), so one busy caller cannot starve another that shares
//     the same backend address. The limiter runs before policy evaluation and
//     signing, so a rejected request consumes nothing.
//   * Failed authentications are limited per source address. A client that
//     keeps sending wrong keys is cut off, and a correct key is never counted.
//
// The limits here are set low so the example shows them. Production uses the
// defaults or the operator's configuration, and a Postgres-backed store so the
// limit holds across every machine in the fleet (see chapter 16).
//
// Hermetic: an in-process server on a random local port, in memory limit stores.
//

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
const { InMemoryCallerAuditSink } =
  await import("../../../packages/api/src/auth/InMemoryCallerAuditSink.js");
const { AuthorityType } = await import("@parmana/shared");

const ALICE_KEY = "tutorial-130-alice-key";
const BOB_KEY = "tutorial-130-bob-key";

const EXECUTE_PER_MINUTE = 3;
const AUTH_FAILURES_PER_MINUTE = 2;

const app = createApp(createApplication(await createExecutionSystem()), {
  callerAuth: {
    authenticator: new StaticKeyAuthenticator([
      {
        callerId: "alice",
        keyHash: hashApiKey(ALICE_KEY),
        credentialHolderType: AuthorityType.USER,
      },
      {
        callerId: "bob",
        keyHash: hashApiKey(BOB_KEY),
        credentialHolderType: AuthorityType.USER,
      },
    ]),
    auditSink: new InMemoryCallerAuditSink(),
  },
  rateLimit: {
    executePerMinute: EXECUTE_PER_MINUTE,
    healthPerMinute: 600,
    authFailurePerMinute: AUTH_FAILURES_PER_MINUTE,
  },
});

const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

interface Response {
  readonly status: number;
  readonly code: string | undefined;
  readonly retryAfter: string | null;
}

// A request the server must reject before it does any real work: a malformed body.
// The limiter runs before the body is read, so the count does not depend on it.
async function post(key: string): Promise<Response> {
  const response = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const body = (await response.json().catch(() => ({}))) as { code?: string };
  return {
    status: response.status,
    code: body.code,
    retryAfter: response.headers.get("retry-after"),
  };
}

const results: Array<{ step: string; expected: boolean; actual: boolean }> = [];

function check(
  label: string,
  expected: boolean,
  actual: boolean,
  detail: string,
) {
  results.push({ step: label, expected, actual });
  console.log(label);
  console.log(`  ${actual === expected ? "PASSED  " : "FAILED  "}${detail}`);
  console.log();
}

console.log("Tutorial 130: rate limiting");
console.log();

// 1. Alice, with her own key, is within her limit: the requests reach the route.
const alice: Response[] = [];
for (let i = 0; i < EXECUTE_PER_MINUTE; i += 1)
  alice.push(await post(ALICE_KEY));
check(
  `1. Alice makes ${EXECUTE_PER_MINUTE} requests within her limit: ${alice.map((r) => r.status).join(", ")}`,
  true,
  alice.every((r) => r.status !== 429),
  "none is rate limited; the malformed body is rejected by the route instead",
);

// 2. Her next request is over the limit.
const aliceOver = await post(ALICE_KEY);
check(
  `2. Alice's next request: ${aliceOver.status} ${aliceOver.code ?? ""}`,
  true,
  aliceOver.status === 429 && aliceOver.code === "RATE_LIMITED",
  `refused with Retry-After ${aliceOver.retryAfter ?? "missing"}, before any policy or signing work`,
);

// 3. Bob has his own limit: Alice's usage does not count against him.
const bob = await post(BOB_KEY);
check(
  `3. Bob's first request while Alice is limited: ${bob.status}`,
  true,
  bob.status !== 429,
  "the execute limit is per caller, so one caller does not starve another",
);

// 4. Health checks are polled often by the platform, and are not throttled at this rate.
const health: number[] = [];
for (let i = 0; i < 5; i += 1) {
  health.push((await fetch(`${baseUrl}/health`)).status);
}
check(
  `4. Five health checks in a row: ${health.join(", ")}`,
  true,
  health.every((status) => status === 200),
  "the health route has its own, far higher limit",
);

// 5. Wrong keys from this address: the first two are failed authentications,
// the third is refused by the limiter before authentication is tried.
const bad: Response[] = [];
for (let i = 0; i < 3; i += 1) bad.push(await post("wrong-key"));
check(
  `5. Three attempts with a wrong key: ${bad.map((r) => r.status).join(", ")}`,
  true,
  bad[0]?.status === 401 && bad[1]?.status === 401 && bad[2]?.status === 429,
  `two 401s, then 429 ${bad[2]?.code ?? ""} with Retry-After ${bad[2]?.retryAfter ?? "missing"}`,
);

// 6. Bob, with his valid key, is refused from the same address: the failed-authentication
// limit is per source address, so it covers every caller behind that address.
const bobAfter = await post(BOB_KEY);
check(
  `6. Bob's valid request from the same address after the wrong keys: ${bobAfter.status} ${bobAfter.code ?? ""}`,
  true,
  bobAfter.status === 429,
  "current behaviour: the source address is blocked for the window, not only the failing key",
);

server.close();

const failed = results.filter((r) => r.expected !== r.actual);
if (failed.length > 0) {
  for (const r of failed) console.log(`✗ ${r.step}`);
  process.exitCode = 1;
} else {
  console.log(
    `✓ All ${results.length} checks behaved as the rate limit rules require.`,
  );
}

console.log();
console.log("Tutorial Complete");
