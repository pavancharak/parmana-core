# Parmana master document

**Status:** Written 14 November 2026, from the repository and the decision records as they stand. It is a map, not a substitute for the records it points to. Where it disagrees with a record, the record governs and this document should be corrected.
**Owner:** Pavan Charak

## 1. What Parmana is

Parmana authorizes AI-agent actions that move money or change data, and proves afterwards that each action was authorized. The chain is Declared, then Authorized, then Executed, then Proven.

## 2. How a request works end to end

This is an overview from the code, not a full trace.

1. **Declare.** The caller sends one request, `POST /transactions`, with a Business Transaction. Declaring and executing are one call in the code: the handler passes the transaction straight to execution, and there is no separate stored declare step. The request has these parts:
   - **Caller identity.** The `Authorization` key identifies the caller (`callerId`). It does not identify the transaction. The key's holder type (human or service) is set by the operator when the key is issued. If it is absent, the key is treated as non-human.
   - **Authority.** `authority.principalId` and `authority.authorityType` are asserted by the caller. The server checks only that the key is allowed to assert that principal.
   - **Action and parameters.** `intent.action` is the capability, such as `razorpay:refund`. `intent.parameters` (for example the amount) are supplied by the caller. The policy uses only the parameters bound to its signals.
   - **Policy.** `policy.name` and `policy.version` are named by the caller (D17). Governance decides whether that version is the one in effect (D18).
   - **Transaction ID.** `businessTransactionId` identifies the transaction (`DECLARE_STAGE.md`, section 5).
2. **Authorize.** The runtime loads the named policy version and checks it against:
   - **Governance:** the version must have a signed approval record, and it must be the most recently approved version for that name (`PolicyGovernanceExecutionVerifier`).
   - **Signals:** facts the policy needs. Some come from the caller; others are verified by a trusted source.
   - **Binding:** parameters the policy depends on must match what the caller declared.
     The policy returns approve or reject. On approve, the runtime signs an authorization envelope with a nonce, an expiry, and the policy's content hash.
3. **Execute.** The execution gateway checks the envelope before anything is released: the signature, expiry and nonce; that the policy hash matches the approved record and the live policy; that any authority grant is still active and not revoked. Only then does a connector run the action. The outcome is recorded against the nonce, so a retry after a lost response can recover it.
4. **Prove.** The runtime writes a signed execution trust record and evidence. A verifier can check it without trusting Parmana's database.

**Policy governance** is separate. A maker proposes a change. A different checker approves it, with a step-up signature from a registered key, and the approval is recorded as a signed approval record. Nothing can execute under a policy version without one (D19).

## 3. Repositories

| Repository                     | Holds                                                                  | Notes                                                                       |
| ------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `parmana-core`                 | The product: runtime, gateway, policy engine, API, assurance docs      | Start with `docs/assurance/OPEN_ITEMS.md` and `docs/ASSURANCE_DECISIONS.md` |
| `parmana-connectors`           | Connectors, including the Razorpay connector (`razorpay:refund`)       | Read-only in this work                                                      |
| `parmana-poae-benchmark`       | All PoAE research: specification, scenarios, benchmark runner, results | `parmana-core` holds no PoAE material                                       |
| `parmana-docs`, `parmana-site` | Public documentation and site                                          | Not changed in this work                                                    |

## 4. Decisions

Owner decisions are recorded in `docs/ASSURANCE_DECISIONS.md`. The status below is as of this document.

| ID  | Decision                                                                                            | Status                                                                                                               | Where the change is                                                                      |
| --- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| D1  | Adopt the assurance standard (candidate mappings still open)                                        | Adopted                                                                                                              | Docs only                                                                                |
| D2  | The ATS list governs                                                                                | Adopted                                                                                                              | Docs only                                                                                |
| D3  | Accept the recommendation                                                                           | Adopted                                                                                                              | Docs only                                                                                |
| D4  | Yes, with boundary suites                                                                           | Adopted                                                                                                              | Docs only                                                                                |
| D5  | Revisit after Phase 2                                                                               | Adopted                                                                                                              | Docs only                                                                                |
| D7  | In scope                                                                                            | Adopted                                                                                                              | Docs only                                                                                |
| D8  | Define as proposed                                                                                  | Adopted                                                                                                              | Docs only                                                                                |
| D9  | Reject non-canonical signature encodings                                                            | Adopted                                                                                                              | Implemented in `canonicalSignatureBytes`; tested in the crypto package                   |
| D10 | Vendor adapter hash                                                                                 | Pending owner decision                                                                                               | None                                                                                     |
| D11 | Ledger connection and anchor                                                                        | Pending owner decision                                                                                               | None                                                                                     |
| D12 | Authority version (AM-04)                                                                           | Pending owner decision                                                                                               | None                                                                                     |
| D13 | Permanent direction for assurance                                                                   | Adopted                                                                                                              | Docs only                                                                                |
| D14 | `razorpay:refund` policy version 1.3.0                                                              | Superseded by D20                                                                                                    | Record only                                                                              |
| D15 | Drop the `razorpay:refund` binding; keep the G-77 check strict                                      | Adopted                                                                                                              | Branch `claude/bind-razorpay-refund` (PR #635)                                           |
| D16 | Capability names: connector, policy and version format, option A (`razorpay_customer-refund_1-3-0`) | Owner chose option A. Not implemented; depends on section 5, item 1                                                  | Record only                                                                              |
| D17 | The request defines the policy version                                                              | Adopted                                                                                                              | Record only; the binder already compares the declared version                            |
| D18 | No fallback to the canonical table version; version in effect comes from governance only            | Adopted and implemented                                                                                              | Branch `claude/bind-razorpay-refund` (commit `6b07e947`)                                 |
| D19 | Execution-time governance follows the same rule in every environment                                | Adopted. Implemented in code and tests. Out-of-process harnesses and the Postgres tie-break are not done (section 5) | Branch `claude/d19-governance-everywhere` (commits `c66125b3`, `61541dc7`); no PR opened |
| D20 | Bind `razorpay:refund` to `razorpay-refund` 1.1.0                                                   | Owner decided. Blocked until G-77 classifies writes (D15)                                                            | Record only; no binding in code                                                          |

## 5. Open issues, most important first

1. **Razorpay policy (D20).** The owner chose `razorpay-refund` 1.1.0. The binding is blocked until G-77 classifies writes. Previously: `customer-refund` 1.3.0 rejects every refund. The policy that approves Razorpay refunds is `razorpay-refund` 1.1.0. D14 confirmed 1.3.0 on the basis of an earlier record, so it needs the owner's review. Naming (D16) depends on this.
2. **The `razorpay:refund` binding is not in the code.** It was dropped under D15 because it failed the G-77 classification assertion. A later binding needs a decision on how G-77 classifies writes. Branch `claude/bind-razorpay-refund` (PR #635 in `parmana-core`) holds the record and must not be merged as it stands.
3. **Out-of-process harnesses are refused under D19.** These start a separate API server, which has no approval records: the Python live-server tests, `scripts/load-test.ts`, `scripts/run-examples.ts`, the outage drill, the docker smoke test in CI, and tutorial 81. The owner chose to give each one real approvals through the maker-checker flow before it runs. This needs CI secrets for a maker and a checker identity, and the checker must be registered and listed in `POLICY_CHANGE_CHECKERS`. The owner has the maker and checker identities; the registration is not yet done.
4. **Postgres tie-break.** When two approvals for one policy have the same timestamp, the database picks one by a random record id. The fix is an insertion-order column and a migration, which needs the owner's approval. The in-memory repository is fixed.
5. **Signing.** The commits on the working branches are signed off but not signed. This session has no signing key, so `verified-commits` will fail until they are re-signed.
6. **Signing readiness** (`createSigningReadiness`) has its own environment rule (`SIGNING_READINESS_CHECK`). It is outside D19 and unchanged.
7. **Capability naming and G-77** are linked to items 1 and 2.
8. **PoAE.** The README next-step section is updated on branch `claude/readme-next-step` in `parmana-poae-benchmark` (commit `49f3e32`), not merged. Two pull requests in that repository, #8 and #9, were listed in an earlier session and were not re-checked for this document. Gate G2 review and the grant-capability name are open.

## 6. What has been verified, and how

| Change                               | Verified by                                     | Result                                                                         |
| ------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Capability-registry binder tests     | Node 24.22.2, vitest                            | 32 passed (before revert); 29 after revert with the G-77 test                  |
| D18: governed version source         | Targeted API and registry suites                | 7 files, 62 tests passed                                                       |
| D19: governance in every environment | Full suite, Node 24.22.2, after the seeding fix | 403 files passed, 29 skipped; 3,948 tests passed, 1 expected fail, 106 skipped |
| Shared package after doctor change   | vitest, shared tests                            | 175 passed                                                                     |
| Typecheck                            | `npm run typecheck`                             | exit 0 on each change                                                          |

**Not verified:**

- The out-of-process harnesses (item 3). They are expected to fail until they get approvals.
- The Postgres repository's behaviour on ties.
- The live Razorpay path. There is no live traffic for `razorpay:refund` (owner statement).
- Whether anything reached `main`. Several branches are open and unmerged.

All branches named in this document are unmerged. None has been merged to `main`.

## 7. Decisions still needed from the owner, in order

1. Confirm whether D14 (`customer-refund` 1.3.0 for `razorpay:refund`) stands, or the capability should bind to `razorpay-refund` 1.1.0.
2. Choose the capability name format (D16) once item 1 is settled.
3. Approve the Postgres insertion-order migration (item 4).
4. Approve the maker and checker CI setup for the out-of-process harnesses (item 3), and register the checker.
5. Decide how G-77 should classify writes, if a Razorpay binding is to return (item 2).
6. Review and merge PR #635 or close it, once the above are settled.
7. Re-sign the commits before merge (item 5).

## 8. Where to find things

- Decisions: `docs/ASSURANCE_DECISIONS.md`
- Open items: `docs/assurance/OPEN_ITEMS.md`
- Razorpay binding record: `docs/assurance/POLICY_BINDING_RAZORPAY.md`
- Results log: `docs/ASSURANCE_RESULTS.md`
- Plan: `docs/ASSURANCE_TESTING_PLAN.md`
- Frozen cryptographic core: `docs/assurance/FROZEN_CORE.md`
- Coverage: `docs/assurance/COVERAGE_REGISTER.md`
- Declare stage (request fields and checks): `docs/DECLARE_STAGE.md`
