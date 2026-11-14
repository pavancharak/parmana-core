# Open items register

**Status:** Current as of 14 November 2026. Update it when an item closes or a new one is found.
**Owner:** Pavan Charak, unless a row says otherwise.

Each row names the item, what is needed, who decides, and the document with the detail. Items marked "decision" need the owner's answer before work can start.

## 1. Decisions waiting for the owner

| ID   | Item                                                     | Needed                                                                                                                 | Detail                                                    |
| ---- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| D10  | Vendor adapter hash                                      | Choose: declared mapping per adapter (recommended), attestation, or accept the gap                                     | [OPEN_ITEMS_DESIGN.md](OPEN_ITEMS_DESIGN.md) section 1    |
| D11  | Ledger connection and anchor                             | Choose: scheduled job (recommended now), anchor as the target. Set the window. Approve listing methods on both stores. | [OPEN_ITEMS_DESIGN.md](OPEN_ITEMS_DESIGN.md) section 2    |
| D12  | Authority version (AM-04)                                | Choose: immutable grant IDs (recommended), version field, or leave as is                                               | [OPEN_ITEMS_DESIGN.md](OPEN_ITEMS_DESIGN.md) section 3    |
| P-3  | Policy change after approval: defined behaviour          | Ratify the behaviour the benchmark implements: a changed policy is denied (XM-03). Plan Section 9, item 3.             | [ASSURANCE_TESTING_PLAN.md](../ASSURANCE_TESTING_PLAN.md) |
| P-2  | fast-check as the property library                       | Confirm. It is already a dependency and in use.                                                                        | Plan Section 9, item 2                                    |
| P-4  | OSS-Fuzz                                                 | Decide whether it is worth the setup cost                                                                              | Plan Section 9, item 4                                    |
| D-PQ | PoAE research track: the benchmark's scope and any paper | Owner decides the paper's scope and claims. The specification lives in parmana-poae-benchmark.                         |

## 2. Gaps in the product

| ID           | Item                                                | Status                                                                                  | Detail                                           |
| ------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------ |
| G-A / AM-04  | Authority version binding                           | Open. The grant ID is bound; the version is not.                                        | D12                                              |
| G-L / CE-04  | Ledger reconciliation in production                 | Pure function done. No listing methods on the outcome store or trust-record repository. | D11                                              |
| G-R (vendor) | Dispatched hash for vendor adapters                 | Open. Only the HTTP connector hashes the body it sends.                                 | D10                                              |
| Anchor       | External anchor for trust records                   | Target, not started                                                                     | D11, option C                                    |
| Verifier     | Verifier that runs without Parmana's infrastructure | Target, not started                                                                     | [PERMANENT_DIRECTION.md](PERMANENT_DIRECTION.md) |
| PoAE-mut     | Mutation testing on evidence and records            | Not implemented. Stryker mutates source only.                                           | Plan Section 12                                  |
| Python       | Generated Python types for correspondence fields    | Typed `Any` by the generator's fallback                                                 | Commit `e1c186d4`                                |

## 3. Benchmark and testing

| ID                  | Item                                        | Status                                                                                                                    |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| AM-04               | Authority version test                      | Gap (see D12)                                                                                                             |
| EM-03               | Direct execution bypassing the gateway      | Covered by `tests/architecture/execution-boundary.test.ts`. Not a separate benchmark run.                                 |
| XM-01, XM-02        | Policy limit and approved vendor list       | Only the content hash is tested. A policy limit and a vendor allowlist are not.                                           |
| Repeat runs         | Benchmark results                           | One run per results entry. Repetition is not recorded. The CI gate runs the benchmark on every push, which is the repeat. |
| Vectors             | RFC 8785 reference vectors                  | Test file exists. Coverage of the vectors not reviewed.                                                                   |
| Chain head          | `CallerAuditChainVerifier` chain-head check | Tests exist; whether they cover the chain-head check is not confirmed. Plan Phase 1, item 2.                              |
| Mutation survivors  | 101 crypto survivors                        | 0 of 101 classified. Plan Phase 1, item 1.                                                                                |
| Probes              | Bypass and kill-switch probe workflows      | Exist; their coverage not reviewed.                                                                                       |
| Frozen-core vectors | Test vectors for the frozen files           | Enforcement by hash is done. Vectors for the frozen code are not reviewed.                                                |

## 4. Standard and plan

| ID        | Item                                                                     | Status                                                                             |
| --------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Std-3     | Package mappings: `bundle`, `core`, `server`, `audit-db`, `verifier-cli` | Open. `bundle` and `core` probably concepts.                                       |
| Std-A7    | Invariant-to-function mapping (standard Appendix A)                      | Not done                                                                           |
| Std-gates | Measured run times for the scheduled and release gates                   | Not recorded                                                                       |
| Plan-5    | Reproducible builds, SBOM, release report (plan Phase 5)                 | Not started                                                                        |
| Plan-2    | Authorization boundary matrix automation (plan Phase 2)                  | Partly done through the benchmark. Remaining rows not reviewed against the matrix. |

## 5. Governance and review

| ID              | Item                                                                         | Status                                                                                  |
| --------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Protect         | Branch protection on `main` requiring the code-owner review for frozen paths | Owner action in repository settings. Not verified from here.                            |
| PR-633          | CI on PR #633                                                                | Merged into `main` as `0c1773d4`. Required checks passed on the last head before merge. |
| PR-633-merge    | Merge of PR #633 into `main`                                                 | Done (`0c1773d4`).                                                                      |
| Challenge       | ChallengeRecord (RFC-0022) for the signature-encoding correction             | Reviewer to decide                                                                      |
| Verifier-review | Independent review of the verifier                                           | Not started                                                                             |

## 6. Closed in this work (for reference)

- D1 to D9, D13: decided.
- Frozen-core list (D8): confirmed and enforced by `tests/assurance/frozen-core.test.ts`.
- CI gate for the benchmark: in place through `npm test`.
- CE-02 signature malleability: fixed (D9).
- AM-02, AM-03, RT-04, XM-03, XM-04, CE-01, CE-04: in the benchmark runner.
