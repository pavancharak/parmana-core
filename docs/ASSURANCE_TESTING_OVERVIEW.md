# Assurance testing: overview

**Status:** Draft v0.1, 14 November 2026. Owner: Pavan Charak.

This document explains the assurance testing plan: why it exists, how it works, what it can establish, and what it cannot. The plan itself is in [ASSURANCE_TESTING_PLAN.md](ASSURANCE_TESTING_PLAN.md). Results are recorded in [ASSURANCE_RESULTS.md](ASSURANCE_RESULTS.md).

## 1. Why

Parmana's product claims are about what cannot happen. It claims that an agent cannot spend beyond its authority, that a tampered record is detected, and that a failed check does not turn into an approval.

A normal test suite checks behaviour the authors thought of. It can pass while the mechanism behind a claim is broken, if none of its tests exercise the broken part. A green build therefore says little about whether a claim that depends on "cannot happen" still holds.

The plan asks a sharper question for each claim: would our tests notice if the mechanism that enforces it were broken? Mutation testing answers that for code. The rest of the plan extends the same question to inputs, to authority, to concurrency, to failure, and to evidence.

## 2. What the plan covers

The plan is built from four promises:

| Promise                          | Meaning                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------ |
| Authority is explicit            | Business limits are declared, versioned and tied to the actions they cover.    |
| Authorization is deterministic   | The same input and policy give the same decision.                              |
| Execution stays within authority | An action cannot exceed the authority granted.                                 |
| Evidence is verifiable           | A third party can check a record without trusting the system that produced it. |

Fail-closed behaviour applies to all four. When a check cannot be completed, the action is refused.

Each promise maps to test categories and packages in Section 4 of the plan.

## 3. How it works

### 3.1 Phases

The work runs in five phases. Each has exit criteria, and a phase is not complete until they are met.

1. **Cryptographic assurance.** Classify the mutation survivors, cover the gaps they reveal, add property tests and RFC 8785 vectors, and cross-verify signatures with an independent verifier.
2. **Authorization assurance.** Automate the boundary matrix, cover replay, revocation and fail-closed cases.
3. **Adversarial assurance.** Turn the existing attack examples into CI tests, fuzz the parsers, and run API and dependency scans.
4. **Operational assurance.** Test concurrency against real storage, inject faults, and run load tests.
5. **Release assurance.** Check reproducible builds, generate SBOMs, and produce an assurance report for each release.

### 3.2 Gates

- **Pull request:** existing CI jobs plus the property, boundary and attack-example suites as they are added.
- **Scheduled:** per-package mutation runs and the concurrency and fault suites. The schedule will be set from measured run times.
- **Release:** full suite, reproducibility check, SBOM and assurance report.

### 3.3 Recording results

Each run is appended to [ASSURANCE_RESULTS.md](ASSURANCE_RESULTS.md) with:

- the command and runtime,
- the commit tested,
- the results as measured,
- how many survivors have been classified,
- open items.

Earlier entries are not rewritten. Corrections are added as dated notes.

[CLAUDE.md](../CLAUDE.md) tells Claude Code sessions in this repository to follow these rules. Sessions may run the checks, record only results they observed, and submit changes through a pull request.

### 3.4 Score policy

No aggregate mutation score defines success. A high score can hide one untested authorization bypass, so critical invariants need every survivor classified and, where meaningful, tested.

## 4. What passing establishes

A passing result, for a given commit and a given suite, shows the following and no more:

- The tests in the suite detected the mutants they were run against. A caught mutant means at least one test failed when that change was made.
- A property test held for the inputs it generated.
- A boundary or attack case was refused in the configuration it was run in.
- A concurrency test did not exceed the limit in the runs performed.
- A release could be rebuilt from its commit, if the reproducibility check passed.

Each of these is tied to a specific commit, configuration and suite. A change to any of them needs a new run.

## 5. What it does not guarantee

- **That the system is secure.** Mutation testing measures whether the tests catch deliberate changes. It does not show that every vulnerability has been found.
- **That a caught mutant is a meaningful defect.** Some mutants are equivalent: they change nothing observable. Equivalent mutants are reported separately and should not count as caught or missed.
- **That a survivor is a vulnerability.** A survivor may be a missing test, a weak assertion, an equivalent change, or behaviour outside the intended invariant. Each needs classification.
- **That the specification is correct.** The tests check the code against the specification. If the specification allows an unauthorized action, the tests can pass.
- **That the attack examples cover all attacks.** Examples 35–46 and 78 cover the scenarios their authors chose. They are not a complete list.
- **Coverage of unlisted code.** The 2026 crypto run reported per-file results for 84 of 101 survivors. The other 17 are not yet reviewed.
- **Coverage of other packages.** The 14 November campaign covered the crypto package only. Authorization logic in `policy`, `approval` and `execution-gateway` is not covered by that campaign.
- **Hardware, key extraction, side channels, compiler correctness, operating-system compromise, and adversarial AI agents beyond the scenarios in the plan.** These are out of scope and need separate methods.
- **Performance under production load.** Phase 4 tests the enforcement path under load, but the load profile is not yet defined.
- **Independence of the verifier.** Until the cross-verification in Phase 1 is done, the verifier may share code with the signer, so a shared defect could go unnoticed.

## 6. Current state

| Area                                             | State                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| Crypto mutation campaign (14 Nov 2026)           | Complete: 92.3% Stryker score, 1,215 of 1,316 caught, 101 survived |
| Survivor classification                          | 0 of 101 classified                                                |
| Chain-head check (`CallerAuditChainVerifier.ts`) | Not covered by tests                                               |
| Property-based tests                             | Not started                                                        |
| RFC 8785 vectors                                 | Not started                                                        |
| Cross-verification                               | Not started                                                        |
| Authorization boundary matrix                    | Not automated                                                      |
| Attack examples as CI tests                      | Not confirmed                                                      |
| Fuzzing                                          | Not started                                                        |
| Concurrency and fault injection                  | Not started                                                        |
| Reproducibility check                            | Not started                                                        |

## 7. Open decisions

1. Adopt `docs/ASSURANCE_TESTING_STANDARD.md` as the repository standard?
2. Add fast-check as a dependency?
3. What happens to a credential after its policy changes but before it is used?
4. Is OSS-Fuzz worth the setup cost?
5. What load profile should Phase 4 use?

## 8. Summary

The plan asks, for each Parmana claim, whether the tests would notice if the mechanism behind it failed. It records the answers as results tied to commits, and it states plainly what the answers do not cover. A passing suite is evidence about the scenarios it tests. It is not a proof of security.
