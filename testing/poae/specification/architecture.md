# PoAE architecture

**Status:** Phase 1 draft. Describes the research architecture and maps each component to the existing repository. It is not a claim that every component exists in production.

## Seven components

| #   | Component                    | Role                                                     | Existing code (repository path)                                                                                                                    | Status                                                                    |
| --- | ---------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Authority registry           | Declared authority, policy versions, signing identities  | `packages/policy`, grant registry in `packages/shared`                                                                                             | Grants and policy hash exist. Version not bound.                          |
| 2   | Intent evaluation            | Canonical representation of a requested action           | `packages/shared` (`ExecutableContent`), `packages/crypto` (`ExecutableContentHasher`)                                                             | Exists                                                                    |
| 3   | Deterministic authorization  | Policy evaluation and decision                           | `packages/policy`, `packages/approval`, `packages/runtime`                                                                                         | Exists                                                                    |
| 4   | Controlled execution         | Execution constrained by authorization                   | `packages/execution-gateway` (`ExecutionGateway`), `packages/execution-control`                                                                    | Exists. Gateway is the only path (architecture test).                     |
| 5   | Evidence capture             | Signed records, hash-linked trust record, receipts       | `packages/shared` (`ExecutionTrustRecord`, `Receipt`), `packages/crypto`                                                                           | Exists. Correspondence record added. External checkpoint not implemented. |
| 6   | Independent verification     | Signatures, correspondence, completeness                 | `packages/crypto` (`verifyExecutionTrustRecordOffline`, `checkTrustRecordCorrespondenceOffline`), `packages/shared` (`reconcileExecutionEvidence`) | Offline checks exist. Completeness not connected to a ledger.             |
| 7   | Research and assurance layer | Formal verification, adversarial tests, privacy research | `tests/assurance/`, `testing/poae/`                                                                                                                | Benchmark runner (18 tests). Formal and privacy work not started.         |

## Package names

The master plan refers to `@parmanasystems/*` packages. Those names do not exist in this repository. The npm scope is `@parmana/`, and the directories are the names used above. The mapping for the plan's names is in the Assurance Testing Standard, section 3.

## Constraint

The frozen cryptographic core (decision D8) is not changed to fit the research. New research code wraps the existing interfaces. The core's state and its change process are in `docs/assurance/FROZEN_CORE.md`.

## Where the research code goes

Phase 1 documents stay in `testing/poae/specification/`. Benchmark code stays in `tests/assurance/poae/`. Moving research code into a separate repository (`parmana-poae-benchmark`) is a later decision, and needs the owner's approval. This session cannot create or access that repository.
