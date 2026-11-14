# razorpay:refund and customer-refund: the policy binding gap

**Status:** Gap open. The binding attempted on branch `claude/bind-razorpay-refund` was dropped by owner decision D15 (14 November 2026). Nothing binds `razorpay:refund` to a policy in `parmana-core`.
**Owner:** Pavan Charak

## 1. The gap

The Razorpay connector in `parmana-connectors` runs one capability, `razorpay:refund` (`RAZORPAY_REFUND_CAPABILITY` in `src/connectors/razorpay/razorpay-connector.ts`). Nothing in `parmana-core` ties that capability to the `customer-refund` policy:

1. `razorpay:refund` is a built-in connector namespace. External connector registrations refuse built-in namespaces (`packages/api/src/routes/external-connectors.ts`, ADR-0013), so the link cannot be made through that route.
2. The canonical table `CANONICAL_CAPABILITY_POLICY_BINDINGS` in `packages/capability-registry/src/CapabilityPolicyBinding.ts` is empty.
3. The `customer-refund` policies (1.0.0 to 1.3.0 under `policies/customer-refund/`) have no `capability` field.

Result: a request for `razorpay:refund` can declare any approved policy, including an unrelated one, and the binder does not refuse it.

Note: the audit note `docs/audit/2026-11-11/gaps/G-27.md` names the capability `razorpay:refund-create`. The connector source uses `razorpay:refund`. The audit note is out of date.

## 2. What was attempted

Branch `claude/bind-razorpay-refund` (pull request [#635](https://github.com/pavancharak/parmana-core/pull/635)) added a canonical entry binding `razorpay:refund` to `customer-refund` 1.3.0, with four binder tests and an updated canonical-table test. The owner confirmed version 1.3.0 (D14).

Running the full suite under Node 24.22.2 showed a conflict with the G-77 guard, `packages/api/tests/unit/connector-policies-not-self-authorizing.test.ts`. Its first assertion requires every bound capability to be in the read set, so any write binding fails it. The per-capability check for `razorpay:refund` passed: the approve rules of `customer-refund` 1.3.0 require a trusted fact. The conflict is in the classification assertion, not in the policy.

## 3. Decision

Owner decision D15 (14 November 2026): keep the strict G-77 assertion and drop the binding. The G-77 guard is not changed. The binding is removed from the canonical table, and its tests are removed.

## 4. State after the revert

- `CANONICAL_CAPABILITY_POLICY_BINDINGS` is empty, as before the attempt.
- `CapabilityPolicyBinder.test.ts` and `CapabilityPolicyBinding.ts` match the base commit `d7082f0c`.
- The binding test file is removed.
- Checks run after the revert, on the revert commit: `npm run typecheck` exit 0; `vitest run packages/capability-registry packages/api/tests/unit/connector-policies-not-self-authorizing.test.ts` (Node 24.22.2) 3 files, 29 tests, all passed.

Not run: the full suite after the revert.

## 5. What is needed to bind it later

The binding can be added again only after the owner decides how G-77 classifies writes. Options for that decision:

1. Change the classification assertion, so that bound writes are checked by the per-capability test. That test already passes for `razorpay:refund`.
2. Keep the strict assertion, and find another way to link the capability, such as a policy field or a connector-level binding.

The version to bind is 1.3.0 (D14). Live traffic: the owner states there is none for `razorpay:refund`.

## 6. Commit and signing

- The commits on the branch are signed off (`Signed-off-by`) but not signed. Git reported that `gpg.ssh.allowedSignersFile` is not configured. The key file `/home/claude/.ssh/commit_signing_key.pub` is empty and no private key is present, so this session cannot sign commits. Signing must be fixed before merge.

## 7. Capability connection (as it stands)

| Field           | Value                                                                        | Where it is defined                                                  |
| --------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Capability name | `razorpay:refund`                                                            | `parmana-connectors` `src/connectors/razorpay/razorpay-connector.ts` |
| Intent name     | `customer-refund`. The owner states that the policy name is the intent name. | Owner statement (14 November 2026)                                   |
| Policy name     | `customer-refund`                                                            | `policies/customer-refund/`                                          |
| Policy version  | `1.3.0` (owner confirmed, D14). Latest version in the repo.                  | D14 in `docs/ASSURANCE_DECISIONS.md`                                 |
| Binding in code | **None.** `CANONICAL_CAPABILITY_POLICY_BINDINGS` is empty (D15).             | `packages/capability-registry/src/CapabilityPolicyBinding.ts`        |

Two other places the link could live, both to verify before any binding is designed:

- `docs/guides/production-integration-guide.md` says a capability (for example `razorpay:refund`) is bound to an endpoint and a policy, and is registered through maker-checker. If that registration records the policy, it is a second connection path and was not checked here.
- `docs/audit/2026-11-11/STALE-DOCUMENTS.md` and G-66 cite `paytm:refund` to `customer-refund` as an example of the canonical table. That example is stale: the table is empty.

Because the intent name is the policy name, a binding for `razorpay:refund` would name `customer-refund` as both the intent and the policy. Whether the code accepts that equality has not been checked.

## 8. Check of the intent name and the policy (14 November 2026)

The check found that the policy chosen for the binding is not the policy that authorizes Razorpay refunds.

**`customer-refund` 1.3.0 refuses every customer refund.** Its only rule is `reject-all-customer-refunds` (`"condition": { "always": true }`, action `reject`). Its description says Razorpay refunds go through `razorpay-refund`. Binding `razorpay:refund` to it would make every Razorpay refund rejected.

**`razorpay-refund` 1.1.0 is the policy that approves a Razorpay refund** (`policies/razorpay-refund/1.1.0/policy.json`). It requires `paymentRefundable` (a Razorpay signal source, `payment.refundable`, max age 60 s) to be true, and a signed `managerApproved`. It has a reject default. It is the only version in the repo.

So the connection table in section 7 is wrong on the policy. The intent name the owner stated (the policy name) would be `razorpay-refund`, not `customer-refund`.

The owner confirmed `customer-refund` 1.3.0 as correct (D14). That confirmation was made on the basis of this record, which named `customer-refund` as the latest version to bind. The owner should look at it again before it stands.

Intent name check in code: `packages/shared/src/domain/intent.ts` has no `name` or `policy` field, so the code does not link an intent to a policy by name. Whether an intent name equal to the policy name is accepted by any code path was not established.

Not changed: D14 and D15 are the owner's recorded decisions and are left as they stand.

## 9. Capability naming (owner statement, 14 November 2026)

The owner states: "connectorname_policyname_version is capability." No further detail was given. This is recorded as stated; it has not been confirmed as the intended format.

Code as it stands: capability names are validated as `namespace:verb`, one colon, lowercase letters, digits and hyphens. This is enforced in `packages/api/src/routes/external-connectors.ts` (`CAPABILITY_PATTERN`), `packages/api/src/routes/inbound-checks.ts` and `packages/api/src/routes/authority-grants.ts`. The form `connectorname_policyname_version` does not match that pattern (it uses underscores and has no colon). The connector uses `razorpay:refund`.

Open question for the owner: does "capability" in the owner's statement mean a new naming format, or a label for the combination of connector, policy and version? The answer decides whether the existing validation changes.
