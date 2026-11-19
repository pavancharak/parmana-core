# Vendor code out of core: plan

> **Status: steps 2 and 3 DONE on branch `claude/remove-vendor-code`. Owner decisions 2 and 3 approved; decision 1 not answered, so the identifiers stay as section 3 says.** It follows ADR-0018 (connectors outside core).

Owner: Pavan Charak. Decisions: the owner, with the gate owners named in the runbooks.

## 1. Why

ADR-0018 puts vendor code in `parmana-connectors`. Core should not hold vendor clients, vendor credentials, or code that is written for one vendor. Most of core is already clean. The gaps are listed in section 2.

## 2. What is in core today (checked 19 November 2026)

| Item                                     | Where                                                                                            | What it is                                                              | Used by                                             | Step |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------- | ---- |
| Razorpay payment source                  | `packages/runtime/src/business-validation/razorpay-payment-source.ts`                            | Reads a Razorpay payment and establishes the `payment.refundable` claim | Its own unit tests only. Not wired into any service | 2    |
| Razorpay payment source tests            | `packages/runtime/tests/unit/razorpay-payment-source.test.ts`, `refund-amount-scenarios.test.ts` | Tests for the module above                                              | Tests                                               | 2    |
| GitHub live-availability helper          | `packages/api/tests/helpers/github-live-availability.ts`                                         | Decides whether a live GitHub test may run                              | Live integration test                               | 3    |
| Vendor names in comments and identifiers | Several files, listed in the comment pass (commit `e0317100`)                                    | Comments and names that cite a vendor                                   | Documentation only                                  | 4    |

Core's other source packages have no vendor-specific code: a search of `packages/*/src` and the API routes found none. The `parmana-connectors` README's status table says the Paytm, GitHub and HubSpot connectors were removed from core, and its current-work section says GitHub and HubSpot were still in core. That disagreement is not resolved here. The search result above is the only fact this plan relies on.

## 3. What stays in core, and why

These are contract identifiers. They are data that signed policies and the release protocol rely on. They are not vendor code, and renaming them would change what signed policies authorize.

- **Capability identifiers**, for example `razorpay:refund`, `paytm:refund`, `hubspot:deal-update`. About 140 files and 21 signed or evidence files reference them. Policy `razorpay-refund` 1.1.0 is one. Renaming needs a new signed policy version through maker-checker.
- **Claim names**, for example `payment.refundable`. Policy 1.1.0 uses it.
- **Connector ids** of the form `ext-<capability>`, which core signs into releases.
- **Stored identifiers** in migrations (for example, capability names in the registry).

A rename would also need an alias for every old name. Two names for one action would let one approval authorize two things. That is the substitution risk core is built to prevent, so this plan does not rename them.

Environment variables are a deployment contract. They are left alone until the code in section 2 moves.

## 4. Steps

Each step is one pull request. Each runs the full core checks, and a step is not merged until its checks pass.

1. **Decide the identifier policy** (section 5, decision 1). Record it in a decision record. No code change.
2. **Remove the Razorpay payment source from core. Done.**
   - Finding: `parmana-connectors` already has the same signal (`src/signal/razorpay-payment-signal.ts`), wired into its signal service. Core's copy was a duplicate, and nothing in core's runtime imported it. So no copy was needed.
   - Its 11 unit-test cases were first ported to `parmana-connectors` (`tests/signal/razorpay-payment-signal.test.ts`, 10 cases; the credential refusal is covered by `config.ts`). Two behaviours differ: a wrong claim or a missing amount is answered `not_found` by connectors, not thrown as in core. The connector tests assert the connector's behaviour.
   - Core: the module and its test are removed. The scenario test in `refund-amount-scenarios.test.ts` now uses a labelled stub source. That test checks Parmana's handling of a sourced "true", not the signal's logic.
   - The claim name `payment.refundable` and the capability ids are unchanged. Policy 1.1.0 still refers to the claim.
3. **Move the GitHub live-availability helper. Done.** It had no importers in core and no live GitHub test exists in `parmana-connectors` yet. It is now `tests/connectors/github/github-live-availability.ts` in `parmana-connectors` (commit `3ef1caf`), with its core-path references marked as cross-repo.
4. **Neutral names in core where no contract depends on them.** Only identifiers that are internal to core and not part of a signed record, a migration, or a deployment setting. Each rename is checked against section 3 before it is made.
5. **Rename the stored and signed identifiers, only if decision 2 is yes.** This is a separate, owner-approved change with a new policy version and a migration plan.

Each step has a rollback. Steps 2 and 3 are copies first, so core keeps working until the removal.

## 5. Decisions needed from the owner

1. **Identifier policy.** Keep capability ids, claim names and connector ids as stable contract identifiers, as section 3 proposes? Or rename them, with a new signed policy version and a migration?
2. **Step 2.** Move the Razorpay payment source to `parmana-connectors`? If yes, who reviews the copy, and who approves the removal from core?
3. **Step 3.** Move the GitHub live-availability helper, or leave it in core as a test-only helper?

## 6. Checks for each step

- Core: `npm run build:packages`, then the architecture tests (`tests/architecture`, 590 tests) and the affected package tests, under Node 24.
- Connectors: `npm test` and the boundary test in `tests/boundaries.test.ts`.
- Policy: the policy 1.1.0 verification still passes.
- No new vendor names in core source or comments, except section 3 identifiers.

## 7. Not in this plan

- Renaming any capability, claim or connector id. (Decision 1.)
- Changing the release protocol or the signing format.
- Migrating the Paytm, HubSpot or GitHub connectors. Those were removed under ADR-0018 and are tracked there.
