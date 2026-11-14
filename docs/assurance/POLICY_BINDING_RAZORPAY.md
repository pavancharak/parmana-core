# Policy binding: razorpay:refund to customer-refund

**Status:** Implemented on branch `claude/bind-razorpay-refund`. Not merged. The policy version is proposed and awaits the owner's confirmation (OPEN_ITEMS, decision row P-5).
**Date:** 14 November 2026
**Owner:** Pavan Charak

## 1. The gap

The Razorpay connector in `parmana-connectors` runs one capability, `razorpay:refund` (`RAZORPAY_REFUND_CAPABILITY` in `src/connectors/razorpay/razorpay-connector.ts`). Before this change nothing in `parmana-core` tied that capability to the `customer-refund` policy:

1. `razorpay:refund` is a built-in connector namespace. External connector registrations refuse built-in namespaces (`packages/api/src/routes/external-connectors.ts`, ADR-0013), so the link could not be made through that route.
2. The canonical table `CANONICAL_CAPABILITY_POLICY_BINDINGS` in `packages/capability-registry/src/CapabilityPolicyBinding.ts` was empty. Its test asserted that the table had no entries.
3. The `customer-refund` policies (1.0.0 to 1.3.0 under `policies/customer-refund/`) have no `capability` field, so nothing in the policy names the capability either.

Result: a request for `razorpay:refund` could declare any approved policy, including an unrelated one, and the binder would not refuse it.

Note: the audit note `docs/audit/2026-11-11/gaps/G-27.md` names the capability `razorpay:refund-create`. The connector source uses `razorpay:refund`, so that name is out of date. The binding uses the connector's name.

## 2. What changed

`CANONICAL_CAPABILITY_POLICY_BINDINGS` now contains one entry:

| Capability        | Policy            | Version | Schema version |
| ----------------- | ----------------- | ------- | -------------- |
| `razorpay:refund` | `customer-refund` | `1.3.0` | `1.0.0`        |

`CapabilityPolicyBinder.findViolation("razorpay:refund", declared)` now returns a violation unless `declared` names `customer-refund` at version `1.3.0`.

Files:

- `packages/capability-registry/src/CapabilityPolicyBinding.ts`: the new entry, with a comment that marks the version as proposed.
- `packages/capability-registry/tests/unit/razorpay-refund-binding.test.ts`: new. Four cases:
  - the bound policy and version are accepted;
  - the same policy at another version is refused;
  - an unrelated policy is refused;
  - a capability with no entry (`paytm:refund`) is unaffected.
- `packages/capability-registry/tests/unit/CapabilityPolicyBinder.test.ts`: the test that asserted an empty table now asserts that the only entry is `razorpay:refund`, bound to `customer-refund` 1.3.0.

## 3. Decision needed (owner)

The version `1.3.0` is the latest in this repository. It was chosen without a governance decision. The owner must confirm it, or name another version, before merge.

## 4. Risk to live refunds

This change alters live behaviour. Any request for `razorpay:refund` that declares a policy other than `customer-refund` 1.3.0 will be refused after this change is deployed. Requests that declared an older version (1.0.0, 1.1.0 or 1.2.0) will also be refused. Before merge, confirm:

- which policy version live callers declare;
- whether those callers can move to 1.3.0 before the change is deployed.

## 5. Rollback

Remove the `razorpay:refund` entry from `CANONICAL_CAPABILITY_POLICY_BINDINGS` and revert the test change. The table then returns to its previous empty state, and the binder behaves as it did before. No data migration is needed, because the table is in code.

## 6. Evidence

Run in this session, on `claude/bind-razorpay-refund`, after `npm run build:packages`, using Node 24.22.2:

- `npm run typecheck`: exit 0.
- `vitest run packages/capability-registry` (Node 24.22.2): 3 files, 32 tests, all passed.

Not run: the full suite, the frozen-core test, and the Razorpay live integration test. None of these were run in this session.

## 7. What this does not prove

- It does not show that the `customer-refund` policy is itself correct for refunds.
- It does not check the connector's own refund logic. That is covered by `parmana-connectors`.
- The link is enforced by the binder only. Whether every request path calls the binder is a separate question, not answered here.
