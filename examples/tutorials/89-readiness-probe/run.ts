//
// GET /ready is an operational readiness probe (distinct from /health,
// a pure liveness check): it reports whether this process's actual,
// configured storage backend is reachable, not just whether the
// process is running. Under NODE_ENV=test, or with memory-backed
// storage, it reports READY without ever touching a real database --
// there's nothing external to check. With Supabase-backed storage
// that's unreachable, it reports NOT_READY (503) with a reason.
//
const { createExecutionSystem } =
  await import("../../../packages/api/src/bootstrap/createExecutionSystem.js");
const { createApplication } =
  await import("../../../packages/api/src/application.js");
const { createApp } = await import("../../../packages/api/src/app.js");

async function buildApp() {
  const executionSystem = await createExecutionSystem();
  const application = createApplication(executionSystem);
  return createApp(application, { callerAuth: "disabled" });
}

async function startServer(app: ReturnType<typeof buildApp>) {
  const server = app.listen(0);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
  return {
    baseUrl,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

console.log();
console.log("==================================================");
console.log("Tutorial 89 - Readiness Probe");
console.log("==================================================");
console.log();

const ENV_KEYS = ["NODE_ENV", "PARMANA_STORAGE", "DATABASE_URL"] as const;
const saved = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

try {
  process.env.NODE_ENV = "test";

  console.log(
    "Scenario 1: NODE_ENV=test -- reports READY without touching any real database",
  );
  console.log("--------------------------------------------------");
  const app1 = await buildApp();
  const server1 = await startServer(app1);
  const response1 = await fetch(`${server1.baseUrl}/ready`);
  const body1 = await response1.json();
  console.log(`Status : ${response1.status}`);
  console.log(`Body   : ${JSON.stringify(body1)}`);
  await server1.close();
  console.log();

  console.log(
    "Scenario 2: Outside test mode, but storage is explicitly memory-backed -- still READY, no database touched",
  );
  console.log("--------------------------------------------------");
  const app2 = await buildApp(); // built under NODE_ENV=test so construction's own eager checks don't throw
  const server2 = await startServer(app2);
  process.env.NODE_ENV = "production";
  process.env.PARMANA_STORAGE = "memory";
  const response2 = await fetch(`${server2.baseUrl}/ready`);
  const body2 = await response2.json();
  console.log(`Status : ${response2.status}`);
  console.log(`Body   : ${JSON.stringify(body2)}`);
  await server2.close();
  console.log();

  console.log(
    "Scenario 3: Supabase-backed storage configured, but genuinely unreachable -- NOT_READY, 503, with a reason",
  );
  console.log("--------------------------------------------------");
  process.env.NODE_ENV = "test"; // restore before construction, same reasoning as scenario 2
  const app3 = await buildApp();
  const server3 = await startServer(app3);
  process.env.NODE_ENV = "production";
  process.env.PARMANA_STORAGE = "supabase";
  process.env.DATABASE_URL =
    "postgresql://unreachable:unreachable@127.0.0.1:1/postgres";
  const response3 = await fetch(`${server3.baseUrl}/ready`);
  const body3 = await response3.json();
  console.log(`Status : ${response3.status}`);
  console.log(`Body   : ${JSON.stringify(body3)}`);
  await server3.close();
  console.log();

  const allPassed =
    response1.status === 200 &&
    body1.status === "READY" &&
    body1.storage === "not-supabase-backed" &&
    response2.status === 200 &&
    body2.status === "READY" &&
    response3.status === 503 &&
    body3.status === "NOT_READY" &&
    typeof body3.reason === "string";

  if (allPassed) {
    console.log(
      "✓ Memory-backed configurations report READY with zero database calls; a genuinely unreachable Supabase backend reports NOT_READY with a specific reason.",
    );
  } else {
    console.log(
      "✗ Expected READY for memory-backed storage and NOT_READY (503, with a reason) for an unreachable Supabase backend.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 90 - OpenAPI Self-Description");
} finally {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}
