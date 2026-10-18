import type { Pool } from "pg";

//
// docs/VERIFICATION-GAPS.md G-49, and item 5 of the 2026-09-15 KMS migration
// troubleshooting guide (in git history): createApp() used to pass ONE shared PostgresRateLimitStore
// instance to both the /execute and /health,/ready rate limiters --
// express-rate-limit v8 explicitly documents that a Store instance
// must not back more than one limiter.
//
// IMPORTANT CORRECTION (verified directly against the installed
// express-rate-limit source, node_modules/express-rate-limit/dist/index.mjs):
// this validation logs its ERR_ERL_STORE_REUSE ValidationError via
// console.error -- it does NOT throw. Every validation in this library
// is wrapped in a try/catch that swallows the error and only logs it
// (`wrappedValidations`, source/validations.ts). An earlier version of
// this project's own documentation stated this validation "crashed the
// process" / "caused every request to 500" -- that was an unverified
// causal assumption from seeing this log line appear near a real 500,
// not a confirmed mechanism. The 500 observed at the time was actually
// caused by a SEPARATE, still-unfixed bug (the signing/verification
// key divergence -- see Tutorial 114) that happened to be logged in the
// same request. This is still a real, worth-fixing violation of the
// library's documented contract (and could become fatal in a future
// express-rate-limit version, or under stricter `validate` config) --
// just not the mechanism that was actually crashing requests that
// night. Corrected in docs/VERIFICATION-GAPS.md G-49 and
// the 2026-09-15 KMS migration troubleshooting guide (in git history) at
// the same time this tutorial was corrected.
//
// Hermetic: a minimal fake `pg.Pool` stands in for a real database
// connection.
//

const { createExecuteRateLimiter, createHealthReadyRateLimiter } =
  await import("../../../packages/api/src/middleware/rate-limit.js");
const { PostgresRateLimitStore } = await import("@parmana/storage");

function fakePool(): Pool {
  return {
    query: async () => ({ rows: [{ count: 1, reset_time: new Date() }] }),
  } as unknown as Pool;
}

console.log();
console.log("==================================================");
console.log("Tutorial 115 - Per-Limiter Rate Limit Stores");
console.log("==================================================");
console.log();

console.log(
  "Scenario 1 (THE BUG, reproduced): one Store instance shared between both limiters",
);
console.log("--------------------------------------------------");

const sharedStore = new PostgresRateLimitStore(fakePool());

const originalConsoleError = console.error;
const loggedErrors: unknown[] = [];
console.error = (...args: unknown[]) => {
  loggedErrors.push(args[0]);
};

// Mirrors app.ts's old shape exactly: options.rateLimit?.store passed to
// BOTH createHealthReadyRateLimiter and createExecuteRateLimiter. This
// does NOT throw (see the correction above) -- express-rate-limit logs
// the violation via console.error and continues.
createHealthReadyRateLimiter(300, sharedStore);
createExecuteRateLimiter(30, sharedStore);

console.error = originalConsoleError;

const reuseErrorLogged = loggedErrors.some(
  (err) =>
    err instanceof Error &&
    (err as { code?: string }).code === "ERR_ERL_STORE_REUSE",
);

console.log(
  reuseErrorLogged
    ? "console.error was called with an ERR_ERL_STORE_REUSE ValidationError -- logged, not thrown. Both limiter objects were still constructed and returned normally."
    : "No ERR_ERL_STORE_REUSE logged (unexpected -- express-rate-limit version may differ from what this was written against)",
);
console.log();

console.log(
  "Scenario 2 (THE FIX): two separate Store instances, each with its own prefix",
);
console.log("--------------------------------------------------");

const executeStore = new PostgresRateLimitStore(fakePool(), "execute:");
const healthStore = new PostgresRateLimitStore(fakePool(), "health:");

const loggedErrorsAfterFix: unknown[] = [];
console.error = (...args: unknown[]) => {
  loggedErrorsAfterFix.push(args[0]);
};

createHealthReadyRateLimiter(300, healthStore);
createExecuteRateLimiter(30, executeStore);

console.error = originalConsoleError;

const noReuseErrorAfterFix = loggedErrorsAfterFix.length === 0;

console.log(
  noReuseErrorAfterFix
    ? "No ERR_ERL_STORE_REUSE logged -- both limiters constructed cleanly."
    : `Unexpectedly logged: ${String(loggedErrorsAfterFix[0])}`,
);
console.log(`executeStore.prefix : ${JSON.stringify(executeStore.prefix)}`);
console.log(`healthStore.prefix  : ${JSON.stringify(healthStore.prefix)}`);
console.log();
console.log(
  "prefix is not an invented mechanism -- it's express-rate-limit's own documented",
);
console.log(
  "Store.prefix field, used by its own double-count/reuse detection. Matching that",
);
console.log(
  "exact name and making it public (not a private implementation detail) is what lets",
);
console.log("the library recognize these as two legitimately distinct stores.");
console.log();

const allPassed = reuseErrorLogged && noReuseErrorAfterFix;

if (allPassed) {
  console.log(
    "✓ Reproduced the logged ERR_ERL_STORE_REUSE with one shared instance, and confirmed two prefixed instances construct cleanly with no warning at all.",
  );
} else {
  console.log(
    "✗ Expected Scenario 1 to log ERR_ERL_STORE_REUSE and Scenario 2 to log nothing.",
  );
}

console.log();
console.log("Tutorial Complete");
console.log("End of the 2026-09-15/16 KMS migration tutorial series.");
