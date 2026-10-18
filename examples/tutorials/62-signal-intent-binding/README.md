# Tutorial 62 — Signal/Intent Binding

## Overview

A policy evaluates `transaction.signals`. Execution runs `transaction.intent`. Nothing forces those two to describe the same real-world action — unless a policy declares `boundSignals`.

This tutorial demonstrates Parmana's signal/intent binding guarantee: a caller can declare any signals it likes, but for every signal a policy's `boundSignals` names, the declared value must exactly equal the value found at the matching `intent` field. A mismatch — including a signal the caller never declared at all — is rejected before policy evaluation ever runs, and no authorization is ever generated for it.

This is not a hypothetical concern. It closes a real, previously live gap: a caller could declare a fully verified, policy-approved payment while `intent` executed something else entirely, and still receive a signed, APPROVED Execution Trust Record for it. `SignalIntentBinder` (`packages/policy/src/SignalIntentBinder.ts`) is what stops that.

---

## The Policy Declaration

`policies/vendor-payment/2.1.0/policy.json` declares:

```json
"boundSignals": {
  "paymentAmount": "parameters.amount",
  "vendorId": "target"
}
```

This means: whatever `signals.vendorId` a caller declares must exactly equal `intent.target`. Both transactions in this tutorial share the same `intent.target`, `"sap.payment.release"` — only their `signals.vendorId` differs.

---

## Scenario 1: A Missing Signal

`transaction-mismatched-signal.json` declares every other signal `vendor-payment@2.1.0`'s approve rule needs — but never declares `vendorId` at all.

```ts
try {
  await runtime.execute(mismatchedSignalTransaction);
} catch (error) {
  console.log(`✗ ${(error as Error).message}`);
}
```

`SignalIntentBinder` runs before `PolicyEngine.evaluate`, over the exact signals about to be evaluated and the exact intent that would be signed and executed if approved. `signals.vendorId` (`undefined`) does not equal `intent.target` (`"sap.payment.release"`), so this is rejected as an ordinary policy decision — no rule is ever evaluated, and `ExecutionGate.enforce` throws before any authorization is generated.

---

## Scenario 2: The Same Transaction, Correctly Bound

`transaction-correctly-bound.json` is otherwise identical — same policy, same `intent.target`, same approve-shaped facts — except `signals.vendorId` is declared as `"sap.payment.release"`, matching `intent.target` exactly.

```ts
const { context } = await runtime.execute(correctlyBoundTransaction);

console.log(`✓ ${context.decision.outcome}`);
```

With the binding satisfied, `SignalIntentBinder` finds no violation, `PolicyEngine.evaluate` runs normally, and this transaction is approved and executed exactly like any other.

---

## Expected Output

```text
==================================================
Tutorial 62 - Signal/Intent Binding
==================================================
A policy evaluates transaction.signals. Execution runs transaction.intent.
boundSignals declares which signal must equal which intent field, so
the facts a policy approved are guaranteed to describe the same
real-world action the system actually executes — not just a payload
that happens to look correct in isolation.
vendor-payment@2.1.0 declares: boundSignals.vendorId = "target".
Every transaction below shares the same intent.target, "sap.payment.release".
--------------------------------------------------
Scenario 1: signals.vendorId is not declared
--------------------------------------------------
✗ Execution rejected: Rejected: declared signal(s) do not match the executed intent (vendorId=undefined != intent.target="sap.payment.release").
This is Parmana working as intended: the caller never declared a
vendorId signal at all, so nothing proves the approved facts describe
this specific intent.target. No authorization is generated for it.
--------------------------------------------------
Scenario 2: signals.vendorId matches intent.target
--------------------------------------------------
✓ APPROVED
Reason : Vendor payment authorized. Vendor verification, invoice verification, payment approval, funding, and risk assessment requirements were satisfied.
Same policy, same intent.target, same approve-shaped facts — the only
difference is that signals.vendorId now equals intent.target. That is
enough for SignalIntentBinder to confirm the two describe the same
action, so PolicyEngine.evaluate runs and this executes normally.
==================================================
Summary
==================================================
Scenario 1 : REJECTED — vendorId signal missing, cannot be bound to intent.target
Scenario 2 : APPROVED — vendorId signal declared and matches intent.target
Tutorial completed successfully.
```

---

## Design Principles

`boundSignals` only closes the _decoupling_ between what a policy evaluates and what actually executes, for the specific fields a policy author declares bound. It does not independently verify that an unbound signal is true — a caller-declared `vendorVerified: true` is still taken on faith unless a policy author separately fetch-verifies it (see `HubSpotSignalStateVerifier` and Tutorial 71 for what that looks like for one real connector).

A rejection here is not an error to work around. It is the system correctly refusing to sign an authorization for an action it cannot confirm the approved facts actually describe.

---

## Running the Example

```bash
tsx examples/tutorials/62-signal-intent-binding/run.ts
```

or

```bash
npm run examples
```

---

## Summary

In this tutorial you learned how to:

- Read a policy's `boundSignals` declaration and know exactly which signals it constrains
- Recognize a signal/intent binding rejection and its exact wording
- Confirm that a correctly-bound transaction executes identically to any other
- Understand why this check runs before policy evaluation, not after

This is the same guarantee that closed a real, previously live authorization bypass: without it, a caller could declare small, fully-verified signals while `intent` executed an arbitrary action, and still walk away with a signed, APPROVED Execution Trust Record.
