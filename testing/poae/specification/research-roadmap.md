# Research roadmap

**Status:** Phase 1 draft. Phases follow the master plan. Each phase ends at a gate, and the next phase starts only after the gate is passed.

## Phases and gates

| Phase | Work                                                                                  | Gate | Gate criterion                                  | Status                                                           |
| ----- | ------------------------------------------------------------------------------------- | ---- | ----------------------------------------------- | ---------------------------------------------------------------- |
| 1     | Research specification (these documents)                                              | G1   | Specification reviewed by the owner             | In review                                                        |
| 2     | Benchmark foundation: 30 scenarios documented, fixtures, machine-readable definitions | G2   | All 30 scenarios documented in the threat model | Not started (the 30 are in the threat model draft)               |
| 3     | Implement the scenarios, mutation operators, evidence tests                           | G3   | Scenarios implemented and reproducible          | 18 implemented, 2 elsewhere, 1 gap, 1 partly, 8 not implemented. |
| 4     | Formal model (TLA+ or equivalent), safety properties, counterexamples                 | G4   | Model and counterexamples evaluated             | Not started                                                      |
| 5     | Compromise resilience: key compromise, store failure, recovery                        | G5   | Compromise and recovery experiments completed   | Not started                                                      |
| 6     | Zero-knowledge feasibility                                                            | G6   | Feasibility evaluated, or explicitly deferred   | Not started. May be deferred.                                    |
| 7     | Independent reproduction in a clean environment                                       | G7   | Reproduction completed                          | Not started                                                      |
| 8     | Paper, with claims traced to evidence                                                 | G8   | Every claim traced to an experiment             | Not started                                                      |

## Dependencies

- Phase 3 depends on the decisions D10 (vendor adapters), D11 (ledger and checkpoint) and D12 (authority version). Without them, T04, T23 and T29 stay open.
- Phase 4 depends on the invariants in `formal-invariants.md` and on INV-7 having an independent checkpoint.
- Phase 5 depends on T24 (key rotation), which is not implemented.
- Phase 6 may be deferred without affecting the core claim.

## Consistency check (before Phase 2)

| Document                      | Consistent with                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `research-questions.md`       | Each sub-question maps to a hypothesis. Checked.                                                        |
| `research-hypotheses.md`      | Each hypothesis cites threats and properties that exist in the threat model and property list. Checked. |
| `security-properties.md`      | Each property is referenced by a hypothesis and an invariant. Checked.                                  |
| `threat-model.md`             | Each scenario cites a property. The counts match the table. Checked.                                    |
| `formal-invariants.md`        | Each invariant cites a property. Checked.                                                               |
| `experimental-methodology.md` | Metrics use denominators defined per metric. Checked.                                                   |
| `architecture.md`             | Each component cites existing code paths. Checked against the repository on 14 November 2026.           |

## Open decisions that block later phases

- **D10:** vendor adapter coverage. Blocks T29 completion.
- **D11:** ledger connection and checkpoint. Blocks T23 and H3.
- **D12:** authority version. Blocks T04.
- **Plan item P-3:** defined behaviour for a policy change after approval. Used in T07 (implemented as deny).
- **New decision needed:** whether T24 (key rotation) and T30 (revocation latency) are in scope for Phase 3 or Phase 5.

## Gate G1 review questions

1. Are the 30 scenarios the right set? Each is defined in `threat-model.md`.
2. Is the frozen-core state acceptable as the starting point, given D9?
3. Is the research separated from the production claims in the way intended?
4. Are H1 to H6 falsifiable as written?
