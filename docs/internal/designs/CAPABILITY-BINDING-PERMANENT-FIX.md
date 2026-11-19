# Permanent fix: binding `razorpay:refund` to a policy

> **Status: PROPOSED. Not decided. No code has changed.** This needs the owner's decision (D16) before any change. It resolves the gap in `docs/assurance/POLICY_BINDING_RAZORPAY.md`.

Owner: Pavan Charak. Decision: D16, to be recorded in `docs/ASSURANCE_DECISIONS.md`.

## 1. The problem, in one line

The G-77 guard (`packages/api/tests/unit/connector-policies-not-self-authorizing.test.ts`) requires every bound capability to be in the read set, so no write capability can be bound to a policy. Binding `razorpay:refund` is therefore impossible while the guard stays as it is. The owner kept the guard under D15, and the binding was dropped.

## 2. Why the strict guard is the wrong permanent rule

G-77 exists to stop a connector policy from approving its own writes without a trusted fact. Its first assertion checks a proxy, read-set membership, not the thing it guards. A write capability can be bound safely if its approve rules require a trusted fact. The per-capability check already tests exactly that for `razorpay:refund` against `customer-refund` 1.3.0, and it passes. Keeping the proxy means no write capability can ever be bound, even a safe one. Every new vendor would hit the same wall.

A workaround (a policy field, or a connector-level binding) would leave the proxy in place and add a second route around it. That is weaker, because two rules would have to agree.

## 3. Proposed permanent fix

Replace the proxy with the property itself.

1. **G-77 checks the property.** For each bound capability, whether a read or a write:
   - the policy's approve rules must require at least one trusted fact (`signalSources` or a required signal), and
   - the per-capability test must show that rule holds for that capability.
     A write with no trusted-fact requirement fails. A read with none fails too.
2. **The binding is a canonical entry.** `CANONICAL_CAPABILITY_POLICY_BINDINGS` gets one entry: `razorpay:refund` → `customer-refund` 1.3.0 (D14).
3. **Restore the four binder tests** from PR #635, and the canonical-table test.
4. **Record the decision.** D16 in `docs/ASSURANCE_DECISIONS.md`, and a note in the gap record that it is closed.

This keeps the guard, makes it stricter about the thing that matters, and lets a safe write be bound. The change to G-77 is a security change, so it needs owner approval and a second reviewer.

## 4. What is not changed

- The capability name `razorpay:refund` and the policy `customer-refund` 1.3.0 stay as they are.
- The release protocol and the signing format stay as they are.
- No live traffic is involved. The owner states there is none for `razorpay:refund`.

## 5. Order of work, once D16 is approved

1. Amend G-77 as in section 3.1, with its tests, in one PR.
2. Restore the binding and its tests, as in section 3.2 and 3.3, in a second PR that depends on the first.
3. Run the full suite under Node 24 (the record notes the full suite was not run after the revert). The result is recorded in the PR.
4. Update the gap record and `ASSURANCE_DECISIONS.md` in the same PR as step 2.

## 6. Blockers that are outside this change

- **Commit signing.** The record notes that this session cannot sign commits, because no signing key is present. Signing must be fixed before either PR merges.
- **Vendor names.** The capability name still contains a vendor name. That is decision 1 in `VENDOR-CODE-MOVE-PLAN.md`, and it is separate from this fix.

## 7. Decision needed (D16)

Approve the replacement of the read-set proxy in G-77 with the trusted-fact property (section 3.1), and the restoration of the binding (section 3.2)? Or keep the strict guard and accept that no write capability can be bound?

## 8. Correction (19 November 2026): the target policy is not customer-refund 1.3.0

Section 2 said the per-capability check for `razorpay:refund` against `customer-refund` 1.3.0 passes because its approve rules require a trusted fact. That is not what the policy contains:

- `customer-refund` 1.3.0 has no approve rule. Its only rule rejects every refund, by design (its description says so, and it sends Razorpay refunds to `razorpay-refund`). The per-capability check passes only because there is nothing to check.
- Binding `razorpay:refund` to it would make the capability refuse every refund.

The policy that fits `razorpay:refund` is `razorpay-refund` 1.1.0. Its approve rule needs the `paymentRefundable` signal source and a signed `managerApproved` approval, so the property check tests something real for it.

Owner decision D14 named `customer-refund` 1.3.0. It needs to be re-confirmed for `razorpay-refund` 1.1.0 before any binding is added (decision D17).

What has changed in code so far (step 1 of section 5): the guard's first test now accepts an explicit write list (`WRITE_CAPABILITIES`) instead of requiring every bound capability to be a read. Writes are then checked by the property test. The guard tests pass (29 tests across the guard and the capability registry). No binding has been added.
