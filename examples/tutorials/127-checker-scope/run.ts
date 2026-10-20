// Tutorial 127: POLICY_CHANGE_CHECKERS names who may approve a change to each
// policy. A caller not listed for a policy is refused, and a malformed value
// stops startup rather than being guessed at. Pure functions, no server.
process.env.NODE_ENV = "test";

const { parsePolicyChangeCheckers, isCheckerInScope } =
  await import("../../../packages/api/src/governance/policyChangeCheckers.js");

console.log();
console.log("==================================================");
console.log("Tutorial 127 - Checker Scope");
console.log("==================================================");
console.log();

function expect(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(actual)}`);
  if (!ok) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}`);
  }
}

const scope = parsePolicyChangeCheckers('{"vendor-payment":["checker-1"]}');

expect(
  "a listed checker may approve the listed policy",
  isCheckerInScope(scope, "vendor-payment", "checker-1"),
  true,
);
expect(
  "a caller not listed for the policy may not approve it",
  isCheckerInScope(scope, "vendor-payment", "checker-2"),
  false,
);
expect(
  "a policy with no entry allows nobody",
  isCheckerInScope(scope, "refund-limits", "checker-1"),
  false,
);
expect(
  "an unset variable lists nobody",
  isCheckerInScope(
    parsePolicyChangeCheckers(undefined),
    "vendor-payment",
    "checker-1",
  ),
  false,
);

let refused = false;
try {
  parsePolicyChangeCheckers("not json");
} catch {
  refused = true;
}
expect(
  "a malformed value stops startup instead of being guessed at",
  refused,
  true,
);

console.log();
console.log("All checks passed.");
