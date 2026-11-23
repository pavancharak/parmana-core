# Assurance execution plan

**Status:** Working plan. It turns [ASSURANCE_TESTING_PLAN.md](../ASSURANCE_TESTING_PLAN.md) and decision D25 into numbered steps. It does not change the plan's phases, exit criteria or score policy. Those change only by owner decision.
**Owner:** Pavan Charak.
**Written:** 2026-11-22, on branch `claude/laughing-meitner-cqaxvi`.
**Mapping of challenges:** [CHALLENGE_MAPPING.md](CHALLENGE_MAPPING.md).

## 1. Rules that apply to every step

1. Each step has a result. Record only outputs that were actually produced. A step not run is recorded as "not run", with the reason.
2. Each run is recorded in [ASSURANCE_RESULTS.md](../ASSURANCE_RESULTS.md) as a new dated entry, using `testing/templates/assurance-results-entry.md`. Earlier entries are not rewritten. Corrections are dated notes.
3. Survivor classifications are recorded separately from mutation scores.
4. A change to a frozen cryptographic file follows [FROZEN_CORE.md](FROZEN_CORE.md) in full. Owner review, CODEOWNERS approval, and manifest regeneration in the same reviewed diff.
5. Tests for a challenge are written only when its full description is in the repository (D25, item 2). Until then the challenge is a blocked step (section 9).
6. Commits are signed off, and signed where the repository key is configured. Pushes go to `claude/laughing-meitner-cqaxvi`. A pull request is opened or updated only when the owner asks.
7. Node 24 is required for crypto tests and the mutation runner (`.nvmrc` pins 24.22.2). Run `npm run build:packages` before testing. The dist-freshness check fails without it.
8. Score thresholds are not success criteria (plan section 8). A phase is complete when its exit criteria are met, not when a number is high.

## 2. Phase order and dependencies

```
Phase 1 (crypto) ──► Phase 2 (authorization) ──► Phase 3 (adversarial) ──► Phase 4 (operational) ──► Phase 5 (release)
   │                      │
   └── frozen-core review  └── blocked: policy-change-after-approval (plan decision 3)
```

Phases run in order (D25, item 3). Steps inside a phase can run in parallel where they touch different packages.

## 3. Phase 1: cryptographic assurance

Exit criteria (from the plan): every survivor classified with rationale; chain-head check covered and its mutants re-run; equivalent mutants listed with reasons; property and vector tests run in CI.

| Step | Action                                                                                                                                                                                                                                                        | Command or file                                                                | Result to record                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------- |
| 1.1  | Complete the full crypto mutation run started on 2026-11-22. Record the commit SHA and Node version.                                                                                                                                                          | `npm run mutation -- crypto` writes `reports/mutation/crypto.json`             | Entry: counts, score, duration            |
| 1.2  | Extract every survivor from the report: file, line, mutator, source text.                                                                                                                                                                                     | Script under `scripts/` (new), reads `reports/mutation/crypto.json`            | Count per file, checked against the total |
| 1.3  | Classify each survivor as one of: missing test, insufficient assertion, equivalent, unreachable, out of scope. Write the rationale for each.                                                                                                                  | New file `docs/assurance/survivors/crypto.md`, one table per file              | Count classified, N of M                  |
| 1.4  | Confirm the chain-head survivors are zero in the full run. If not, classify them first.                                                                                                                                                                       | Check against `reports/mutation/crypto.json` for `CallerAuditChainVerifier.ts` | Chain-head status                         |
| 1.5  | For each "missing test" survivor in a non-frozen file, write a test that kills it.                                                                                                                                                                            | Test files under `packages/crypto/tests/unit/`                                 | Test names added                          |
| 1.6  | For each "missing test" survivor in a frozen file, prepare the test and the fix as a separate change, and follow FROZEN_CORE.md.                                                                                                                              | Frozen files listed in `docs/assurance/frozen-core.manifest.json`              | Owner review status                       |
| 1.7  | Re-run the mutation step on each changed file only: `STRYKER_MUTATE=<file> STRYKER_REPORT_NAME=<name> npm run mutation -- crypto`. Compare with step 1.1.                                                                                                     | `reports/mutation/<name>.json`                                                 | Before and after per file                 |
| 1.8  | Review `canonical-serializer-rfc8785.test.ts` against the RFC 8785 reference vectors. Add any missing vectors.                                                                                                                                                | `packages/crypto/tests/unit/canonical-serializer-rfc8785.test.ts`              | Vectors present, vectors added            |
| 1.9  | Extend the property suite for canonical JSON, hashing and signature verification. Build on `canonical-serializer.property.test.ts` and `offline-verifier.fuzz.test.ts`.                                                                                       | Test files in `packages/crypto/tests/`                                         | Properties and run count                  |
| 1.10 | Cross-verification: sign with production code, verify with an independently written verifier, tamper, re-check. The independent verifier language is not set in the plan. Use the existing Python package under `python/` unless the owner decides otherwise. | New test in `tests/assurance/` (new directory) and `python/tests/`             | Pass or fail, with output                 |
| 1.11 | Confirm the new tests run in CI. Check the workflow that runs `npm test`.                                                                                                                                                                                     | `.github/workflows/ci.yml`                                                     | Job name and result                       |
| 1.12 | Record the phase 1 status change in the results table.                                                                                                                                                                                                        | `docs/ASSURANCE_RESULTS.md`, phase table                                       | Old and new status                        |

**Blocking:** nothing in phase 1 is blocked by an owner decision, apart from frozen-file review (step 1.6).

## 4. Phase 2: authorization assurance

Exit criteria (plan): every matrix row has an automated test; each fail-closed case shows that no execution occurred and the failure was recorded; each deny case has a paired allow case; integration and end-to-end tests run in CI.

| Step | Action                                                                                                                                                                                                                                                                                                                        | Where                                                                                     | Result to record                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 2.0  | Write the plain-language specification of `Executed(a) ⇒ Authorized(a)`. Define the predicates: correct agent, correct scope, valid credential, valid policy, approved action matches. No prover is involved (D4).                                                                                                            | New file `docs/assurance/AUTHORITY_INVARIANT.md`                                          | Predicates listed; each mapped to a code location or marked "no code yet" |
| 2.1  | Automate the boundary matrix (plan section 6), one test file per scenario group: authorization decision, signature and identity, operations and gateway. Each deny row has a paired allow row on the same path.                                                                                                               | `packages/policy/tests/`, `packages/approval/tests/`, `packages/execution-gateway/tests/` | One row per test; pass or fail                                            |
| 2.2  | Replay, revocation, cached credentials, and policy changes after approval. The "policy changed after approval" row is blocked (section 9).                                                                                                                                                                                    | Same packages as 2.1                                                                      | Per scenario                                                              |
| 2.3  | Fail-closed matrix: policy unavailable, database unavailable, signature verifier unavailable, trust root unavailable, ledger write failure, timeout, incomplete context, credential lookup failure. Include partial execution: execution must not begin before authorization completes, and a later failure must be recorded. | `packages/execution-gateway/`, `packages/storage/`                                        | Each case: executed or not, and whether the failure was recorded          |
| 2.4  | Credential scope and tenant isolation: one agent cannot use another agent's credential, and one tenant cannot reach another tenant's authority (ATS-006, ATS-007).                                                                                                                                                            | `packages/api/tests/`, `packages/execution-control/tests/`                                | Per case                                                                  |
| 2.5  | Integration harness for the package interactions: governance to verifier, governance to execution, execution to audit storage, server to core.                                                                                                                                                                                | New `tests/integration/` directory                                                        | Interactions covered                                                      |
| 2.6  | One end-to-end payment test, from request to recorded evidence, asserting that authority is preserved.                                                                                                                                                                                                                        | `tests/integration/`                                                                      | Pass or fail                                                              |
| 2.7  | Challenge work for this phase: for each challenge marked "Surface" in the mapping under policy, approval, execution or api, write its invariant test (for example forged request, twin parameters, key ID selection, shadow admin). Update the mapping status from "Surface" to "Covered" only when the test runs and passes. | Tests as in 2.1 to 2.4                                                                    | Mapping rows updated, each with the test name                             |

**Blocking:** the "policy changed after approval" row (step 2.2) waits for the owner's decision on defined behaviour (plan decision 3).

## 5. Phase 3: adversarial assurance

Exit criteria (plan): each attack example runs in CI and asserts refusal; fuzzing runs without an accepted malformed input that should have been refused.

| Step | Action                                                                                                                                                                      | Where                                                                     | Result to record                                          |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| 3.1  | Locate attack examples 35 to 46 and 78. They are not in `examples/scenarios/`. Search `evaluations/`, `tests/` and `proof-audit/` before concluding they are missing.       | Search output                                                             | Location, or "not found"                                  |
| 3.2  | Convert each located example into a CI test that asserts refusal.                                                                                                           | Their existing location, or `tests/adversarial/` if none                  | Pass or fail per example                                  |
| 3.3  | Fuzz the parsers for canonical JSON, envelopes, policy bundles and signal input. Build on the existing `*.fuzz.test.ts` files.                                              | `packages/crypto`, `packages/policy`, `packages/approval`, `packages/api` | Iterations run; any accepted malformed input is a finding |
| 3.4  | Static analysis. CodeQL is already in `.github/workflows/codeql.yml`. Semgrep is not in the repository.                                                                     | `codeql.yml`; Semgrep is an owner decision (section 9)                    | CodeQL result                                             |
| 3.5  | Dependency scan. `dependency-review.yml` exists. Confirm it fails on a known vulnerable version.                                                                            | `.github/workflows/dependency-review.yml`                                 | Result                                                    |
| 3.6  | API security scan of `packages/api`. OWASP ZAP is not in the repository. It needs an owner decision (section 9).                                                            | Decision first                                                            | Scan result or "not run"                                  |
| 3.7  | Challenge work for this phase: the "Surface" items under api and parsers (line break news, trusted upload, batch of guesses, verbose failure). Each gets an invariant test. | `packages/api/tests/`                                                     | Test names; mapping updated                               |

## 6. Phase 4: operational assurance

Exit criteria (plan): concurrent spend tests never exceed the granted limit across repeated runs; the fault matrix passes with fail-closed behaviour; the concurrency cases pass against real storage.

| Step | Action                                                                                                                                                         | Where                                   | Result to record                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------- |
| 4.1  | Stand up Postgres for tests. `docker-compose.yml` defines a `postgres` service. Record the image and version used.                                             | `docker-compose.yml`                    | Version, command                    |
| 4.2  | Concurrency test against real storage: two simultaneous requests of 7,000 against a limit of 10,000 (plan example). Repeat across runs.                        | `packages/storage/tests/` (new)         | Runs repeated; limit never exceeded |
| 4.3  | Fault injection into the database, the policy service and the ledger write. Build a small harness.                                                             | `tests/fault/` (new)                    | Fault matrix results                |
| 4.4  | Concurrency cases: credential revocation during execution, policy update during authorization, duplicate evidence submission (ATS-007, ATS-008).               | `tests/fault/`                          | Per case                            |
| 4.5  | Load test on the enforcement path. The tool is not chosen in the plan. Record the choice as part of the step.                                                  | `tests/load/` (new)                     | Latency and error rates             |
| 4.6  | Schedule the concurrency and fault suites as a scheduled gate (plan section 8). Set the schedule from measured run time. The run time is recorded in step 4.2. | New workflow under `.github/workflows/` | Schedule set                        |

## 7. Phase 5: release assurance

Exit criteria (plan): a release can be rebuilt and its assurance report regenerated from the commit SHA; the supply-chain gate passes.

| Step | Action                                                                                                                                                                                     | Where                                  | Result to record                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ------------------------------- |
| 5.1  | Reproducible build check: build twice from the same SHA and compare.                                                                                                                       | `.github/workflows/release.yml`        | Hashes match, or the diff       |
| 5.2  | SBOM for each release. `release.yml` already references SBOM generation. Confirm what it produces.                                                                                         | `.github/workflows/release.yml`        | Artifact name, format           |
| 5.3  | Supply-chain gate: dependency scan, lockfile consistency, build provenance, release signatures (ATS-012).                                                                                  | `release.yml`, `dependency-review.yml` | Gate result                     |
| 5.4  | Assurance report per release, using `testing/templates/assurance-run-report.json`. Records the commit SHA, mutation score per package, the invariant table, and failures with resolutions. | `docs/assurance/reports/` (new)        | Report regenerated from the SHA |

## 8. Challenge workstream (across all phases)

This runs alongside the phases. Each challenge in [CHALLENGE_MAPPING.md](CHALLENGE_MAPPING.md) moves through these states:

| State             | Meaning                                  | Action                                                                                                   |
| ----------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Needs description | Title only                               | Obtain the full description. No test until then.                                                         |
| Not applicable    | No component in this repository          | Record the reason. No test.                                                                              |
| Deployment        | Checked as repository configuration only | Add a configuration check if one is meaningful. The runtime control stays the deployer's responsibility. |
| Surface           | Component exists, no targeted test       | Write an invariant test in the phase that owns the package (steps 2.7, 3.7).                             |
| Covered           | Targeted test exists and passes          | Record the test name in the mapping.                                                                     |

## 9. Blocked steps and owner decisions

| Blocked step                                  | Waiting for                                               |
| --------------------------------------------- | --------------------------------------------------------- |
| 2.2, "policy changed after approval"          | Owner decision on defined behaviour (plan decision 3)     |
| 1.6 and any frozen-file fix                   | Owner review under FROZEN_CORE.md                         |
| 3.4, Semgrep                                  | Owner decision: add it to CI or not                       |
| 3.6, OWASP ZAP                                | Owner decision: add it to CI or not                       |
| Challenge tests for "needs description" items | Full challenge descriptions                               |
| 4.5, load-test tool                           | Owner choice of tool (or delegate the choice to the step) |
| Commit signing for PR merges                  | Signing key configuration (see D23, item 4)               |
| 1.10, independent verifier language           | Owner decision (default: the Python package)              |

## 10. Definition of done

- Every phase's exit criteria in the plan are met, and each is recorded in `ASSURANCE_RESULTS.md`.
- Every challenge in the mapping is in a final state: Covered, Not applicable, or Deployment with its check, or blocked with the reason recorded.
- No survivor in a critical invariant is unclassified.
- Each blocked step is either resolved by an owner decision or recorded as open.

Meeting these is the evidence on which the owner may judge readiness (D25). This document does not make that judgement.
