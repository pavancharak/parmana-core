# Research hypotheses

**Status:** Phase 1 draft. Each hypothesis states the outcome that would falsify it.

## H1: Deterministic authorization rejects defined unauthorized actions

- **Claim:** For every unauthorized action in the threat model that the authorization function is responsible for, the function returns deny, and the same input and policy always give the same decision.
- **Falsified by:** one unauthorized action that is approved, or one input and policy that gives two different decisions.
- **Threats:** T01 to T08, T10, T18.
- **Properties:** P1, P4.

## H2: Action binding detects changes between authorization and execution

- **Claim:** Any change to the action between authorization and dispatch is detected by the correspondence check.
- **Falsified by:** a dispatched action that differs from the authorized action and passes the check.
- **Threats:** T20, T21, T28, T29.
- **Properties:** P2.
- **Limit:** the connector-level hash covers only the HTTP connector. This hypothesis is tested only for that path until the vendor adapter decision (D10) is made.

## H3: Independent checkpoints detect evidence deletion and ledger truncation

- **Claim:** A completed execution whose evidence is removed, or a ledger cut short, is detected by reconciliation against an independent sequence.
- **Falsified by:** a removed record or truncated ledger that reconciliation reports as passed.
- **Threats:** T22, T23.
- **Properties:** P7.
- **Limit:** reconciliation is not yet connected to the stored ledger, and no external checkpoint exists. This hypothesis cannot be tested end to end until D11 is decided.

## H4: Revocation prevents later unauthorized execution

- **Claim:** After a grant or key is revoked, no new execution is released under it, within the defined propagation window.
- **Falsified by:** a release under a revoked grant or key after the window closes.
- **Threats:** T03, T24, T30.
- **Properties:** P6.
- **Limit:** key revocation and propagation latency are not implemented.

## H5: Formal modelling finds unsafe transitions that conventional tests miss

- **Claim:** A model of the protocol's state transitions, checked exhaustively within bounds, finds at least one unsafe transition or confirms none exists within those bounds.
- **Falsified by:** the model confirms no unsafe transition, and no conventional test would have found one either. (That result would show the model adds nothing, which is also a finding.)
- **Properties:** P1 to P7.
- **Status:** Phase 4. Not started.

## H6: Privacy-preserving proofs reduce disclosure without losing verification

- **Claim:** A proof of policy compliance verifies with no transaction detail disclosed, and rejects any non-compliant input.
- **Falsified by:** a non-compliant input that verifies, or a proof that discloses a value it was meant to hide.
- **Status:** Phase 7. Feasibility only, may be deferred.

## Baselines

- **Baseline A:** application-level authorization and application logs.
- **Baseline B:** authorization with signed execution records, without correspondence or completeness checks.
- **Baseline C:** the PoAE architecture, with deterministic enforcement and independent verification.

Each hypothesis is measured against Baseline C, and against A or B where the comparison is meaningful. A hypothesis that only holds for C with no baseline comparison is not claimed as a benefit.
