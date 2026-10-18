//
// Without this check, authority.principalId on a Business Transaction
// is entirely caller-declared and never cross-checked against the
// identity actually proven by caller authentication (callerId) -- any
// caller holding any valid API key could claim to be any human/role in
// the resulting signed trust record. isPrincipalAllowed() is the fix:
// a fail-closed default (a key may only assert itself), with an
// explicit, operator-configured grant as the only way to widen that.
//
const { isPrincipalAllowed } =
  await import("../../../packages/api/src/auth/isPrincipalAllowed.js");

console.log();
console.log("==================================================");
console.log("Tutorial 76 - Caller Principal Scoping");
console.log("==================================================");
console.log();

console.log(
  "Scenario 1: A caller asserting its own identity (default, no grant needed)",
);
console.log("--------------------------------------------------");
const result1 = isPrincipalAllowed("caller-a", "caller-a", undefined);
console.log(
  `isPrincipalAllowed("caller-a", callerId="caller-a", grant=undefined) -> ${result1}`,
);
console.log();

console.log(
  "Scenario 2: A caller asserting someone else's identity, with no grant (the exploit shape)",
);
console.log("--------------------------------------------------");
const result2 = isPrincipalAllowed(
  "ceo@victim-corp.example",
  "sandbox-agent-2",
  undefined,
);
console.log(
  `isPrincipalAllowed("ceo@victim-corp.example", callerId="sandbox-agent-2", grant=undefined) -> ${result2}`,
);
console.log();

console.log(
  "Scenario 3: An operator-configured explicit grant widening what a key may assert",
);
console.log("--------------------------------------------------");
const result3 = isPrincipalAllowed("finance.manager", "caller-a", [
  "finance.manager",
  "finance.director",
]);
console.log(
  `isPrincipalAllowed("finance.manager", callerId="caller-a", grant=["finance.manager","finance.director"]) -> ${result3}`,
);
console.log();

console.log(
  "Scenario 4: The same caller, asserting a principal NOT in its own grant list",
);
console.log("--------------------------------------------------");
const result4 = isPrincipalAllowed("ceo@victim-corp.example", "caller-a", [
  "finance.manager",
  "finance.director",
]);
console.log(
  `isPrincipalAllowed("ceo@victim-corp.example", callerId="caller-a", grant=["finance.manager","finance.director"]) -> ${result4}`,
);
console.log();

console.log("Scenario 5: No principalId declared at all");
console.log("--------------------------------------------------");
const result5 = isPrincipalAllowed(undefined, "caller-a", undefined);
console.log(
  `isPrincipalAllowed(undefined, callerId="caller-a", grant=undefined) -> ${result5}`,
);
console.log();

const allPassed =
  result1 === true &&
  result2 === false &&
  result3 === true &&
  result4 === false &&
  result5 === false;

if (allPassed) {
  console.log(
    "✓ Self-assertion and explicit grants are allowed; asserting an unrelated identity is always denied.",
  );
} else {
  console.log(
    "✗ Expected self-assertion/grants to pass and every unauthorized assertion to be denied.",
  );
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 77 - Caller Ownership Scoping");
