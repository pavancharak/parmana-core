import {
  CANONICAL_CAPABILITY_POLICY_BINDINGS,
  CapabilityPolicyBinder,
} from "@parmana/policy";

//
// TD-22 (Phase 2K): found by independent repository verification.
// boundSignals/SignalStateVerifier protections are declared per-POLICY
// and per-ACTION respectively -- but nothing cross-checked that the
// policy paired with a given capability was actually the right one.
// A caller could submit hubspot:deal-update (a data-mutating
// capability whose stage/amount protections are scoped to
// hubspot-deal-update/1.1.0's own boundSignals) paired with an
// unrelated, unprotected policy that declares no boundSignals for it
// at all -- entirely bypassing those protections, since
// PolicyEngine.evaluate takes no action parameter and nothing else
// enforced capability<->policy identity. CapabilityPolicyBinder is the
// fix: a canonical, one-to-one binding table, checked before policy
// evaluation.
//
console.log();
console.log("==================================================");
console.log("Tutorial 83 - Capability/Policy Binding (TD-22)");
console.log("==================================================");
console.log();

const binder = new CapabilityPolicyBinder();

console.log(
  "Scenario 1: An action with no canonical binding (every test/tutorial-only action)",
);
console.log("--------------------------------------------------");
const violation1 = await binder.findViolation("PAY", {
  name: "payment-approval",
  version: "1.0.0",
  schemaVersion: "1.0.0",
});
console.log(
  `Violation : ${violation1 === undefined ? "none" : JSON.stringify(violation1)}`,
);
console.log();

console.log(
  "Scenario 2: A real capability paired with its own correct, canonical policy",
);
console.log("--------------------------------------------------");
const violation2 = await binder.findViolation("hubspot:deal-update", {
  name: "hubspot-deal-update",
  version: "1.1.0",
  schemaVersion: "1.0.0",
});
console.log(
  `Violation : ${violation2 === undefined ? "none" : JSON.stringify(violation2)}`,
);
console.log();

console.log(
  "Scenario 3: The exact live-shaped exploit -- hubspot:deal-update paired with an unrelated, unprotected policy",
);
console.log("--------------------------------------------------");
// vendor-payment/2.1.0 is a real, production-loadable policy that
// declares no boundSignals for hubspot:deal-update -- its own approve
// rule is trivially satisfiable by caller-declared signals alone,
// entirely decoupled from the real deal state that would actually be
// mutated.
const violation3 = await binder.findViolation("hubspot:deal-update", {
  name: "vendor-payment",
  version: "2.1.0",
  schemaVersion: "1.0.0",
});
console.log(`Violation : ${JSON.stringify(violation3)}`);
console.log();

console.log(
  "Scenario 4: The same substitution shape against hubspot:deal-fetch",
);
console.log("--------------------------------------------------");
const violation4 = await binder.findViolation("hubspot:deal-fetch", {
  name: "customer-refund",
  version: "1.0.0",
  schemaVersion: "1.0.0",
});
console.log(`Violation : ${JSON.stringify(violation4)}`);
console.log();

console.log("Scenario 5: Correct policy NAME, but the wrong VERSION");
console.log("--------------------------------------------------");
const violation5 = await binder.findViolation("hubspot:deal-update", {
  name: "hubspot-deal-update",
  version: "9.9.9",
  schemaVersion: "1.0.0",
});
console.log(
  `Violation : ${violation5 !== undefined ? "caught (name matched, version did not)" : "none"}`,
);
console.log();

console.log("Every production-registered capability's canonical binding");
console.log("--------------------------------------------------");
for (const [action, policy] of CANONICAL_CAPABILITY_POLICY_BINDINGS) {
  console.log(`${action.padEnd(24)} -> ${policy.name}/${policy.version}`);
}
console.log();

const allPassed =
  violation1 === undefined &&
  violation2 === undefined &&
  violation3?.action === "hubspot:deal-update" &&
  violation3.expected.name === "hubspot-deal-update" &&
  violation3.declared.name === "vendor-payment" &&
  violation4?.expected.name === "hubspot-deal-read" &&
  violation5 !== undefined;

if (allPassed) {
  console.log(
    "✓ Every real capability is bound to exactly one canonical policy -- pairing it with any other is caught before evaluation.",
  );
} else {
  console.log(
    "✗ Expected the unbound/correctly-paired cases to pass and every substitution/version-mismatch to be caught.",
  );
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 84 - Caller Authentication");
