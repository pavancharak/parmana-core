import {
  createGracefulShutdown,
  type CloseableServer,
} from "../../../packages/api/src/bootstrap/createGracefulShutdown.js";

//
// The standard "drain, don't drop" shutdown shape a PaaS orchestrator
// expects: on SIGTERM/SIGINT, stop accepting new connections, let
// in-flight requests finish via the server's own close() semantics,
// then exit cleanly -- with a hard timeout guarding against a request
// that never completes (a hung downstream call) blocking shutdown
// forever. This tutorial exercises createGracefulShutdown() directly
// against fake servers simulating each real-world outcome, using real
// (short) timers rather than a test framework's fake ones.
//
function fakeServer(
  behavior: (callback: (error?: Error) => void) => void,
): CloseableServer & { closeCalls: number } {
  const server = {
    closeCalls: 0,
    close(callback: (error?: Error) => void) {
      server.closeCalls += 1;
      behavior(callback);
    },
  };
  return server;
}

console.log();
console.log("==================================================");
console.log("Tutorial 91 - Graceful Shutdown");
console.log("==================================================");
console.log();

let scenario1Passed: boolean;
let scenario2Passed: boolean;
let scenario3Passed: boolean;
let scenario4Passed: boolean;
let scenario5Passed: boolean;

console.log("Scenario 1: A clean close() -- exits 0");
console.log("--------------------------------------------------");
{
  const server = fakeServer((callback) => callback());
  const exitCodes: number[] = [];
  const logs: string[] = [];
  const shutdown = createGracefulShutdown({
    server,
    timeoutMs: 10_000,
    exit: (code) => exitCodes.push(code),
    log: (m) => logs.push(m),
  });

  shutdown("SIGTERM");

  console.log(
    `close() called ${server.closeCalls} time(s), exit code(s): ${JSON.stringify(exitCodes)}`,
  );
  console.log(
    `Logged "closed cleanly" : ${logs.some((l) => l.includes("closed cleanly"))}`,
  );
  scenario1Passed =
    server.closeCalls === 1 && exitCodes.length === 1 && exitCodes[0] === 0;
  console.log();
}

console.log("Scenario 2: close() reports an error -- exits 1");
console.log("--------------------------------------------------");
{
  const server = fakeServer((callback) => callback(new Error("boom")));
  const exitCodes: number[] = [];
  const errors: string[] = [];
  const shutdown = createGracefulShutdown({
    server,
    timeoutMs: 10_000,
    exit: (code) => exitCodes.push(code),
    log: () => {},
    logError: (m) => errors.push(m),
  });

  shutdown("SIGTERM");

  console.log(`Exit code(s) : ${JSON.stringify(exitCodes)}`);
  console.log(
    `Logged error : ${errors.some((e) => e.includes("error while closing server"))}`,
  );
  scenario2Passed = exitCodes.length === 1 && exitCodes[0] === 1;
  console.log();
}

console.log(
  "Scenario 3: Idempotent -- a second signal while already shutting down never calls close() twice",
);
console.log("--------------------------------------------------");
{
  const server = fakeServer(() => {}); // never calls back -- simulates a still-draining server
  const shutdown = createGracefulShutdown({
    server,
    timeoutMs: 10_000,
    exit: () => {},
    log: () => {},
  });

  shutdown("SIGTERM");
  shutdown("SIGINT");

  console.log(`close() call count after two signals : ${server.closeCalls}`);
  scenario3Passed = server.closeCalls === 1;
  console.log();
}

console.log(
  "Scenario 4: close() never calls back -- force-exits 1 after the timeout (real timer, 300ms)",
);
console.log("--------------------------------------------------");
{
  const server = fakeServer(() => {}); // never calls back -- a request that hangs forever
  const exitCodes: number[] = [];
  const errors: string[] = [];
  const shutdown = createGracefulShutdown({
    server,
    timeoutMs: 300,
    exit: (code) => exitCodes.push(code),
    log: () => {},
    logError: (m) => errors.push(m),
  });

  shutdown("SIGTERM");
  console.log(`Exit called immediately : ${exitCodes.length > 0}`);

  await new Promise((resolve) => setTimeout(resolve, 400));

  console.log(
    `Exit called after timeout elapsed : ${JSON.stringify(exitCodes)}`,
  );
  console.log(
    `Logged timeout error : ${errors.some((e) => e.includes("timed out after 300ms"))}`,
  );
  scenario4Passed = exitCodes.length === 1 && exitCodes[0] === 1;
  console.log();
}

console.log(
  "Scenario 5: close() succeeds in time -- the force-exit timer is cleared, never fires later",
);
console.log("--------------------------------------------------");
{
  const server = fakeServer((callback) => callback());
  const exitCodes: number[] = [];
  const shutdown = createGracefulShutdown({
    server,
    timeoutMs: 300,
    exit: (code) => exitCodes.push(code),
    log: () => {},
  });

  shutdown("SIGTERM");
  console.log(
    `Exit called immediately, code(s) : ${JSON.stringify(exitCodes)}`,
  );

  await new Promise((resolve) => setTimeout(resolve, 400));

  console.log(
    `Exit call count after waiting past the timeout : ${exitCodes.length} (still exactly 1 -- timer was cleared, not just superseded)`,
  );
  scenario5Passed = exitCodes.length === 1 && exitCodes[0] === 0;
  console.log();
}

const allPassed =
  scenario1Passed &&
  scenario2Passed &&
  scenario3Passed &&
  scenario4Passed &&
  scenario5Passed;

if (allPassed) {
  console.log(
    "✓ Clean close exits 0, a close error exits 1, repeated signals are idempotent, and a hung close force-exits after its timeout exactly once.",
  );
} else {
  console.log(
    "✗ Expected every shutdown scenario above to match createGracefulShutdown's documented behavior.",
  );
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 92 - Public API Boundary");
