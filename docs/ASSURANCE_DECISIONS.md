# Assurance decisions

**Status:** Draft for owner decision. Owner: Pavan Charak.
**Source:** [ASSURANCE_TESTING_PLAN.md](ASSURANCE_TESTING_PLAN.md) Section 9 (decisions 1 to 4) and Section 11.4 and 11.6. Standard: [ASSURANCE_TESTING_STANDARD.md](ASSURANCE_TESTING_STANDARD.md).

No decision below is in force until the owner records it in the **Owner decision** field. Under `CLAUDE.md`, changes to the plan's score policy, exit criteria and acceptance principles need the owner's decision. The recommendations are not decisions.

---

## D1. Adopt the Assurance Testing Standard (plan decision 9.1)

**Question:** Should `docs/ASSURANCE_TESTING_STANDARD.md` (PARMANA-ATS-001) become the repository standard?

**Recommendation:** Adopt it once D2 is decided and the candidate package mappings in its Section 3 are confirmed.

**Owner decision:** _[ ] Adopt  [ ] Adopt with changes  [ ] Do not adopt_
**Notes:**

---

## D2. Which invariant list governs (plan Section 7 vs standard Section 2)

**Question:** Which list is the authoritative set of acceptance principles: the eight principles in plan Section 7, or ATS-001 to ATS-012 in the standard?

**Recommendation:** ATS-001 to ATS-012 governs. Map the plan's eight principles onto it, and add the four missing principles (trust, revocation, evidence, supply chain) to plan Section 7 by reference.

| Plan principle | ATS ID |
|---|---|
| Determinism | ATS-001 |
| Authorization | ATS-002 |
| Integrity | ATS-003 |
| Verification | ATS-004 |
| Isolation | ATS-006 |
| Concurrency | ATS-008 |
| Fail-closed | ATS-009 |
| Reproducibility | ATS-011 |
| _(not in plan)_ Trust | ATS-005 |
| _(not in plan)_ Revocation | ATS-007 |
| _(not in plan)_ Evidence | ATS-010 |
| _(not in plan)_ Supply chain | ATS-012 |

**Owner decision:** _[ ] ATS list governs  [ ] Plan Section 7 governs  [ ] Other_
**Notes:**

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

**Owner decision:**

| Item | Add now | Add in Phase 2 | Add in Phase 4 | Reject |
|---|---|---|---|---|
| Integration testing | [ ] | [ ] | [ ] | [ ] |
| End-to-end (one payment test) | [ ] | [ ] | [ ] | [ ] |
| Credential scope, tenant isolation | [ ] | [ ] | [ ] | [ ] |
| Fail-closed partial execution | [ ] | [ ] | [ ] | [ ] |
| Concurrency: revocation, policy change | [ ] | [ ] | [ ] | [ ] |
| Supply chain as release gate | [ ] | [ ] | [ ] | [ ] |

**Notes:**

---

## D4. Plain-language authority specification and paired tests (plan Section 11.6)

**Question (a):** Should a one-page plain-language specification of the authority invariant be written before any formal tool is considered?

**Recommendation (a):** Yes. The standard already depends on terms ("authorized", "approved action matches") that need definitions.

**Question (b):** Should every deny case in the authorization-boundary suites have a paired allow case on the same execution path?

**Recommendation (b):** Yes, for authorization-boundary suites only, not every test in the repository. This prevents a system that always denies from passing.

**Owner decision (a):** _[ ] Yes  [ ] No  [ ] Later, after Phase 2_
**Owner decision (b):** _[ ] Yes, boundary suites  [ ] Yes, all tests  [ ] No_
**Notes:**

---

## D5. Formal-proof effort (plan Section 11.6)

**Question:** Is a formal-proof effort, such as machine-checked proofs in Lean, in scope?

**Recommendation:** Not now. Revisit after Phase 2, once the D4 specification exists. If it goes ahead, limit it to the payment workflow, and name an owner and a budget. The DeepMind reference project needs multi-hour builds, 15 to 34 GiB of RAM and Linux-only tooling, and its results are scoped to one binary with hooked cryptographic primitives.

**Owner decision:** _[ ] Not in scope  [ ] Revisit after Phase 2  [ ] In scope now, limited to payment workflow_
**Owner and budget, if in scope:**

---

## Record

| Decision | Owner decision | Date | Recorded by |
|---|---|---|---|
| D1 | | | |
| D2 | | | |
| D3 | | | |
| D4 | | | |
| D5 | | | |
