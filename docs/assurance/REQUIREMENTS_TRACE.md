# Requirements trace: ATS-001 to ATS-012

**Purpose:** each engineering invariant in the standard (plan section 7) must have at least one test that names its ID. Tests are tagged by putting the ID in the test name, for example `it("ATS-002: refuses unauthorized execution", ...)`.
**Written:** 2026-11-22. **Status at writing:** no test in `packages/`, `proof-audit/` or `tests/` references any ID (checked with `grep -rhoE "ATS-0[01][0-9]"`, count zero).

| ID      | Requirement                                               | Tagged tests | Plan area that must provide evidence                |
| ------- | --------------------------------------------------------- | ------------ | --------------------------------------------------- |
| ATS-001 | Identical inputs produce identical defined outputs        | none         | Phase 1 property suite; Phase 2 determinism         |
| ATS-002 | No unauthorized execution                                 | none         | Phase 2 boundary matrix; Phase 3 attack examples    |
| ATS-003 | Tampering is detected                                     | none         | Phase 1 tamper and cross-verification               |
| ATS-004 | Invalid evidence is rejected                              | none         | Phase 1 vectors; Phase 3 fuzzing                    |
| ATS-005 | Untrusted keys cannot establish valid authorization       | none         | Phase 1 key separation; Phase 2 trust root          |
| ATS-006 | One agent cannot exceed another agent's authority         | none         | Phase 2 item 4 (credential scope, tenant isolation) |
| ATS-007 | Revoked authority cannot authorize new execution          | none         | Phase 2 item 2; Phase 4 item 4                      |
| ATS-008 | Simultaneous requests cannot bypass limits                | none         | Phase 4 items 1 and 4                               |
| ATS-009 | A verification failure cannot become an approval          | none         | Phase 2 item 3 (fail-closed matrix)                 |
| ATS-010 | Execution evidence corresponds to the actual decision     | none         | Phase 2 end-to-end; Phase 1 evidence                |
| ATS-011 | Release testing can be repeated independently             | none         | Phase 5 items 1 and 4                               |
| ATS-012 | Published artifacts correspond to validated source builds | none         | Phase 5 items 2 and 3                               |

## Rules

1. A row moves from "none" to the test names once the test exists and passes. The row must name the test file.
2. A requirement is not "covered" because a test exists. It is covered when the Phase exit criteria for its area are met and recorded in `ASSURANCE_RESULTS.md`.
3. A check that verifies this table (every ID appears in at least one test name) is the permanent gate. It is not yet written or wired into CI; see EXECUTION_PLAN.md section 9.
