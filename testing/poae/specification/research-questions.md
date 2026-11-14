# Research questions

**Status:** Phase 1 draft, 14 November 2026. Subject to review at gate G1.
**Programme:** Proof of Authorized Execution (PoAE). See [architecture.md](architecture.md) and [research-roadmap.md](research-roadmap.md).

## Central question

How can an organization independently establish that an autonomous system executed an action within explicitly declared business authority, when components of its infrastructure may be compromised?

## Sub-questions

| ID  | Question                                                                                                                               | Objective |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RQ1 | How can business authority be represented so that a machine can check it deterministically?                                            | R1        |
| RQ2 | Can a fixed authorization function give the same decision for the same input and policy, and refuse every defined unauthorized action? | R2        |
| RQ3 | Can the action that executes be shown to match the action that was authorized?                                                         | R3        |
| RQ4 | Can execution evidence be made tamper-evident and complete, so that removal is detectable?                                             | R4        |
| RQ5 | Can an independent verifier, without trusting the operator, check all of the above under adversarial conditions?                       | R5        |

## Out of scope for Phase 1

- Whether the real-world event occurred. Evidence shows what was recorded and signed, not what happened outside the system.
- Confidentiality of transaction data (RQ-ZK, a later extension; see the roadmap).
- Production hardening of the Parmana services.

## Acceptance for this document

- Each sub-question maps to at least one hypothesis in [research-hypotheses.md](research-hypotheses.md).
- Each objective R1 to R5 maps to at least one property in [security-properties.md](security-properties.md).
