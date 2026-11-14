# Assurance decisions

**Status:** Decisions recorded 14 November 2026. Owner: Pavan Charak.
**Source:** [ASSURANCE_TESTING_PLAN.md](ASSURANCE_TESTING_PLAN.md) Section 9 (decisions 1 to 4) and Section 11.4 and 11.6. Standard: [ASSURANCE_TESTING_STANDARD.md](ASSURANCE_TESTING_STANDARD.md).

Under `CLAUDE.md`, changes to the plan's score policy, exit criteria and acceptance principles need the owner's decision. The decisions below were recorded from the owner's agreement with the recommendations in this session.

---

## D1. Adopt the Assurance Testing Standard (plan decision 9.1)

**Question:** Should `docs/ASSURANCE_TESTING_STANDARD.md` (PARMANA-ATS-001) become the repository standard?

**Recommendation:** Adopt it once D2 is decided and the candidate package mappings in its Section 3 are confirmed.

**Owner decision:** **Adopt.** D2 is decided. The candidate package mappings in Section 3 are not yet confirmed and remain open items.
**Notes:** The standard's status is updated to adopted. Its Appendix A open items still apply.

---

## D2. Which invariant list governs (plan Section 7 vs standard Section 2)

**Question:** Which list is the authoritative set of acceptance principles: the eight principles in plan Section 7, or ATS-001 to ATS-012 in the standard?

**Recommendation:** ATS-001 to ATS-012 governs. Map the plan's eight principles onto it, and add the four missing principles (trust, revocation, evidence, supply chain) to plan Section 7 by reference.

| Plan principle               | ATS ID  |
| ---------------------------- | ------- |
| Determinism                  | ATS-001 |
| Authorization                | ATS-002 |
| Integrity                    | ATS-003 |
| Verification                 | ATS-004 |
| Isolation                    | ATS-006 |
| Concurrency                  | ATS-008 |
| Fail-closed                  | ATS-009 |
| Reproducibility              | ATS-011 |
| _(not in plan)_ Trust        | ATS-005 |
| _(not in plan)_ Revocation   | ATS-007 |
| _(not in plan)_ Evidence     | ATS-010 |
| _(not in plan)_ Supply chain | ATS-012 |

**Owner decision:** **ATS list governs.**
**Notes:** Plan Section 7 now carries the mapping and the four added principles.

---

## D3. Scope of added categories (plan Section 11.4)

**Question:** Which of the proposed additions should enter the plan?

**Recommendation:**

- **Integration testing:** add now, as a category of its own.
- **End-to-end testing:** keep narrow. One test of the payment workflow, not a broad category.
- **Credential scope and tenant isolation** (ATS-006, ATS-007): add to the Phase 2 matrix.
- **Fail-closed partial execution** (ATS-009): add to the Phase 2 fail-closed matrix.
- **Concurrency: revocation and policy change during execution** (ATS-007, ATS-008): add to Phase 4.
- **Supply chain:** keep as a Phase 5 release gate. ATS-012 already covers it, so it needs no separate category.
- **Timing:** start none of these before Phase 2 is underway.

**Owner decision:** **Accept the recommendation.**

| Item                                   | Decision             |
| -------------------------------------- | -------------------- |
| Integration testing                    | Add now              |
| End-to-end (one payment test)          | Add now, as one test |
| Credential scope, tenant isolation     | Add in Phase 2       |
| Fail-closed partial execution          | Add in Phase 2       |
| Concurrency: revocation, policy change | Add in Phase 4       |
| Supply chain as release gate           | Add in Phase 5       |

**Notes:** Nothing starts before Phase 2 is underway.

---

## D4. Plain-language authority specification and paired tests (plan Section 11.6)

**Question (a):** Should a one-page plain-language specification of the authority invariant be written before any formal tool is considered?

**Recommendation (a):** Yes. The standard already depends on terms ("authorized", "approved action matches") that need definitions.

**Question (b):** Should every deny case in the authorization-boundary suites have a paired allow case on the same execution path?

**Recommendation (b):** Yes, for authorization-boundary suites only, not every test in the repository. This prevents a system that always denies from passing.

**Owner decision (a):** **Yes.**
**Owner decision (b):** **Yes, boundary suites only.**
**Notes:**

---

## D5. Formal-proof effort (plan Section 11.6)

**Question:** Is a formal-proof effort, such as machine-checked proofs in Lean, in scope?

**Recommendation:** Not now. Revisit after Phase 2, once the D4 specification exists. If it goes ahead, limit it to the payment workflow, and name an owner and a budget. The DeepMind reference project needs multi-hour builds, 15 to 34 GiB of RAM and Linux-only tooling, and its results are scoped to one binary with hooked cryptographic primitives.

**Owner decision:** **Revisit after Phase 2.** Not in scope now.
**Owner and budget, if in scope:** Not applicable now.

---

## Record

| Decision | Owner decision                        | Date       | Recorded by                              |
| -------- | ------------------------------------- | ---------- | ---------------------------------------- |
| D1       | Adopt (candidate mappings still open) | 2026-11-14 | Recorded in session at owner's direction |
| D2       | ATS list governs                      | 2026-11-14 | Recorded in session at owner's direction |
| D3       | Accept recommendation                 | 2026-11-14 | Recorded in session at owner's direction |
| D4       | (a) Yes; (b) yes, boundary suites     | 2026-11-14 | Recorded in session at owner's direction |
| D5       | Revisit after Phase 2                 | 2026-11-14 | Recorded in session at owner's direction |

---

## D7. Execution receipt in scope (plan Section 12.3, item 3)

**Question:** Should Parmana add an execution receipt that binds the executed action hash to the authorization?

**Recommendation:** Yes, as a product change on its own branch. It closes the record-level correspondence gap. It needs its own review, because it changes what the system outputs.

**Owner decision:** **In scope.** Build on its own branch, with a versioned format and verifier checks.
**Notes:** Premise revised on 14 November 2026: a signed receipt already exists, so the design now extends the existing signed records. Owner to confirm before code.

---

## D8. Definition of the frozen cryptographic core (plan Section 12.3, item 2)

**Question:** Which files form the "frozen" cryptographic integrity core, and what changes are allowed to them?

**Recommendation:** Define it in writing before relying on the rule. The definition should list the files and the change process. No file should be frozen until it is listed.

**Owner decision:** **Define as proposed.** Confirmed 14 November 2026 with the draft list in docs/assurance/COVERAGE_REGISTER.md, section 3.
**Notes:**

---

---

## D9. Reject non-canonical signature encodings (14 November 2026)

**Question:** Should signature verification reject any base64 string that is not the canonical encoding of the signature bytes?

**Finding:** Changing the final base64 character of an Ed25519 signature still verifies. The signature bytes are unchanged, so this is not a forgery. The verifier accepts more than one encoding of one signature.

**Recommendation:** Reject non-canonical encodings: decode the signature, re-encode it, and compare with the input. This is a small change, but it is in the verifier, so it needs review. Check first whether any stored record or receipt hashes the signature string, since such a change would alter those hashes.

**Owner decision:** **Reject non-canonical encodings.** Implemented in `035e1697`.
**Notes:**

## Record

| Decision | Owner decision                          | Date       | Recorded by                              |
| -------- | --------------------------------------- | ---------- | ---------------------------------------- |
| D7       | In scope                                | 2026-11-14 | Recorded in session at owner's direction |
| D8       | Define as proposed                      | 2026-11-14 | Recorded in session at owner's direction |
| D9       | Reject non-canonical encodings          | 2026-11-14 | Recorded in session at owner's direction |
| D10      | Pending                                 |            |                                          |
| D11      | Pending                                 |            |                                          |
| D12      | Pending                                 |            |                                          |
| D13      | Adopted: permanent direction            | 2026-11-14 | Recorded in session at owner's direction |
| D14      | Adopted: razorpay:refund policy version | 2026-11-14 | Owner confirmed version 1.3.0            |

---

## D10 to D12. Open items after the connector and reconciliation work (plan: docs/assurance/OPEN_ITEMS_DESIGN.md)

**D10, vendor adapter hash.** Choose how the in-repository vendor adapters are covered. Recommended: a declared mapping per adapter (option A). External connectors later (option B). Owner decision: _[ ] A [ ] B [ ] C (accept the gap) [ ] Other_

**D11, ledger connection.** Choose how reconciliation reads the stored ledger. Recommended: a scheduled job (option A), with the window set from measured write latency, and listing methods added to the outcome and trust-record stores. Owner decision: _[ ] A [ ] B [ ] C [ ] Other_. Window: _____. Listing methods may be added: _[ ] yes [ ] no_

**D12, authority version (AM-04).** Choose how re-issued authority is handled. Recommended: immutable grant identifiers (option B), if the registry can enforce them. Owner decision: _[ ] A (version field) [ ] B (immutable IDs) [ ] C (leave as is)_. Registry can enforce immutable IDs: _[ ] yes [ ] no_

**Long-term recommendation (not a decision):** A now, and B for external connectors later (D10). A now, with an external anchor (C) as the target, because only an anchor lets an outside party detect removal (D11). B, enforced by a database constraint (D12). Details: docs/assurance/OPEN_ITEMS_DESIGN.md.

---

## D13. Permanent direction for Parmana assurance (14 November 2026)

**Question:** Should the long-term direction in [assurance/PERMANENT_DIRECTION.md](assurance/PERMANENT_DIRECTION.md) be adopted as the standing reference?

**Recommendation:** Adopt it. It covers: claims limited to the coverage register; the frozen-core list written down; one source of truth per fact; independent review of the verifier; small pull requests.

**Owner decision:** **Agreed.** Adopted as the standing direction. Coverage claims follow [assurance/COVERAGE_REGISTER.md](assurance/COVERAGE_REGISTER.md). The frozen-core list in that register still needs confirmation under D8.

---

## D14. Policy version for razorpay:refund (14 November 2026)

- **Reference:** D14
- **Source:** docs/assurance/POLICY_BINDING_RAZORPAY.md, section 3
- **Date recorded:** 2026-11-14
- **Owner:** Pavan Charak

**Question:** Which version of `customer-refund` does `razorpay:refund` bind to?

**Options considered:** the latest version in the repository (1.3.0), or another version named by the owner.

**Recommendation:** 1.3.0, the latest in the repository.

**Owner decision:** **Policy is correct.** Version 1.3.0 is confirmed. Owner also stated that there is no live traffic for `razorpay:refund`, so no live caller can be refused by the binding. Correction: an earlier draft of this entry said live traffic already uses 1.3.0. That was a misreading of the owner's words and is withdrawn.

**Effect on the documents**

| Document                                  | Change                                               |
| ----------------------------------------- | ---------------------------------------------------- |
| docs/assurance/OPEN_ITEMS.md              | P-5 closed for the version. Caller check still open. |
| docs/assurance/POLICY_BINDING_RAZORPAY.md | Status and section 3 updated to show the decision.   |
