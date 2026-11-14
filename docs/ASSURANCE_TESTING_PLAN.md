# Parmana Verification and Assurance Plan

**Draft v0.1, 14 November 2026. Proposed plan, not yet approved.**
**Owner (all phases):** Pavan Charak

## 1. Purpose

Parmana makes four promises. Each needs a testing strategy that can be challenged independently:

| Promise                          | Meaning                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------- |
| Authority is explicit            | The business's limits are declared, versioned and tied to the actions they cover. |
| Authorization is deterministic   | The same input and policy always give the same decision.                          |
| Execution stays within authority | An action cannot exceed the authority that was granted.                           |
| Evidence is verifiable           | A third party can check the record without trusting the system that produced it.  |

Fail-closed behaviour applies to all four: when a check cannot be completed, the action is refused.

## 2. Baseline

**Mutation testing (crypto).** The campaign on 14 November 2026 is complete: 1,215 of 1,316 mutants caught (92.3% Stryker score), 101 survived. Survivors are not yet classified. One gap is already confirmed: the chain-head check in `CallerAuditChainVerifier.ts` is not covered by tests.

**Earlier mutation runs (5 October 2026).** Recorded in `docs/internal/testing/MUTATION-TESTING.md` across five packages. The re-run scores were envelope-verifier 94.0%, approval 93.9%, policy 96.0%, execution-gateway 83.6% and crypto 85.0%. Those runs used different mutant sets, so they are not directly comparable.

**Existing assets to build on.** The repository already contains:

- `THREAT-MODEL.md`, `SECURITY-CHALLENGE.md` and `EVALUATION.md`.
- `evaluations/`, `proof-audit/`, `stryker.config.mjs`, `vitest.config.ts` and `tests/architecture/`.
- Attack examples that demonstrate refusal: 35 replay, 36 parameter tampering, 37–39 action, target and policy substitution, 40 signature forgery, 41 expired authorization, 42 nonce reuse, 43 stolen authorization, 44 direct API bypass, 45 connector bypass, 46 TOCTOU protection, and 78 duplicate transaction race.

Whether the attack examples run as gated tests in CI has not been confirmed. Phase 3 converts them into gated tests.

**Not yet in place:** property-based tests, a cross-verification suite, concurrency tests against real storage, a fault-injection harness, and the assurance standard document.

## 3. Corrections to earlier drafts

- **Mutation testing is no longer "already running."** The crypto campaign has finished. Survivor classification is the open work.
- **Package names.** Use the repository's real paths under `packages/`: `crypto`, `envelope-verifier`, `policy`, `approval`, `execution-gateway`, `execution-control`, `runtime`, `replay`, `storage`, `api`, `capability-registry`, `connector-sdk` and `shared`. Check npm names before citing them externally.
- **The independent verifier question.** `packages/envelope-verifier` and the published `@parmana/verifier` already exist. The open question is whether the verifier shares code with the signer, because a shared implementation means a shared defect could go unnoticed.
- **Example code is illustrative.** Property tests must be written against the real function signatures.
- **The "Unauthorized Execution Challenge" is built from the attack examples**, not designed from scratch.
- **fast-check.** Check whether it is already a dependency before adding it.

## 4. Guarantees mapped to controls

| Promise                          | Test categories                                  | Primary packages                                    | Evidence produced                       |
| -------------------------------- | ------------------------------------------------ | --------------------------------------------------- | --------------------------------------- |
| Authority is explicit            | Policy validation, authoring-time refusal        | `policy`                                            | Validator test results                  |
| Authorization is deterministic   | Property-based, reproducibility                  | `policy`, `approval`, `execution-control`           | Same-input, same-output report          |
| Execution stays within authority | Boundary, adversarial, concurrency               | `execution-gateway`, `execution-control`, `storage` | Attack-suite results per release        |
| Evidence is verifiable           | Mutation, cross-verification, fuzzing, tampering | `crypto`, `envelope-verifier`, `replay`             | Survivor classification, vector results |
| Fail-closed                      | Fault injection                                  | `execution-gateway`, `storage`, `api`               | Fault-matrix results                    |

## 5. Phases

Each phase has exit criteria. No phase is complete until its criteria are met. **Owner for every phase: Pavan Charak.**

### Phase 1: Cryptographic assurance

**Work**

1. Classify all 101 crypto survivors as missing test, insufficient assertion, equivalent, unreachable or out of scope. Record the rationale for each.
2. Cover the chain-head check in `CallerAuditChainVerifier.ts`. Write the tests first, then re-run the mutants for that file.
3. Add property-based tests for canonical JSON, hashing and signature verification.
4. Add RFC 8785 test vectors for canonicalization.
5. Add a cross-verification test: sign with the production code, verify with an independently written verifier, then tamper and re-check.

**Exit criteria**

- Every survivor has a classification and rationale.
- The chain-head check is covered and its mutants are re-run.
- Equivalent mutants are listed with reasons.
- Property and vector tests run in CI.

### Phase 2: Authorization assurance

**Work**

1. Automate the authorization boundary matrix (Section 6) in `policy`, `approval` and `execution-gateway`.
2. Test replay, revocation, cached credentials, and policy changes after an approval has been granted.
3. Add a fail-closed matrix: policy unavailable, database unavailable, signature verifier unavailable, trust root unavailable, ledger write failure, timeout, incomplete context.

**Exit criteria**

- Every matrix row has an automated test.
- Each fail-closed case shows that no execution occurred and that the failure was recorded.

### Phase 3: Adversarial assurance

**Work**

1. Convert examples 35–46 and 78 into CI tests that assert refusal.
2. Fuzz the parsers for canonical JSON, envelopes, policy bundles and signal input.
3. Run an API security scan against `packages/api`, a static analysis pass, and a dependency scan.

**Exit criteria**

- Each attack example runs in CI and asserts refusal.
- Fuzzing has run without an accepted malformed input that should have been refused.

### Phase 4: Operational assurance

**Work**

1. Test concurrency against real storage, not just in-memory functions. Scenario: two simultaneous ₹7,000 requests against a ₹10,000 limit.
2. Inject faults into the database, the policy service and the ledger write.
3. Run load tests on the enforcement path.

**Exit criteria**

- Concurrent spend tests never exceed the granted limit across repeated runs.
- The fault matrix passes with fail-closed behaviour.

### Phase 5: Release assurance

**Work**

1. Verify reproducible builds.
2. Generate an SBOM for each release.
3. Produce an assurance report per release, recording the commit SHA, the mutation score for each package, the invariant table, and the failures and how each was resolved.

**Exit criteria**

- A release can be rebuilt and its assurance report regenerated from the commit SHA.

## 6. Authorization boundary matrix

| Scenario                                   | Expected result                          |
| ------------------------------------------ | ---------------------------------------- |
| Authorized payment                         | Allow                                    |
| Payment above limit                        | Deny                                     |
| Unauthorized vendor                        | Deny                                     |
| Expired authority                          | Deny                                     |
| Revoked credential                         | Deny                                     |
| Missing policy                             | Deny                                     |
| Invalid signature                          | Deny                                     |
| Changed agent identity                     | Deny                                     |
| Unauthorized operation                     | Deny                                     |
| Policy verification unavailable            | Deny                                     |
| Agent changes its own authority            | Deny                                     |
| Credential reused by another agent         | Deny                                     |
| Replayed credential                        | Deny                                     |
| Policy changed after approval              | Defined behaviour, documented and tested |
| Revoked credential used from a cached copy | Deny                                     |
| Direct API call bypassing the gateway      | Deny                                     |

The "policy changed after approval" row needs a decision before it can be tested. The behaviour must be defined in the policy specification first.

## 7. Acceptance principles

These are proposed requirements, not validated claims.

| Principle       | Requirement                                         |
| --------------- | --------------------------------------------------- |
| Determinism     | Identical inputs produce identical defined outputs. |
| Authorization   | No unauthorized execution.                          |
| Integrity       | Tampering is detected.                              |
| Verification    | Invalid evidence is rejected.                       |
| Isolation       | One agent cannot exceed another agent's authority.  |
| Concurrency     | Simultaneous requests cannot bypass limits.         |
| Fail-closed     | A verification failure cannot become an approval.   |
| Reproducibility | Release testing can be repeated independently.      |

## 8. Gates

**Pull request gate.** Existing jobs (build-and-test, DCO, verified-commits, CodeQL, dependency-review, verify-policy-approvals) plus the property, boundary and attack-example suites added in Phases 1–3.

**Scheduled gate.** Per-package mutation runs, plus the concurrency and fault-injection suites. The schedule should be set by measured run time.

**Release gate.** Full suite, reproducible-build check, SBOM and the assurance report.

**Score policy.** No aggregate mutation threshold defines success. Critical invariants require every survivor to be classified and, where meaningful, tested. A high aggregate score cannot offset one untested authorization bypass.

## 9. Decisions needed

1. Should `docs/ASSURANCE_TESTING_STANDARD.md` be adopted as the repository standard?
2. Should fast-check be added as a dependency?
3. What is the defined behaviour for a policy change after approval?
4. Is OSS-Fuzz worth the setup cost for this repository? It is optional, and adapting it is not trivial.

## 10. Limits

This plan does not establish security. It defines how to test whether the guarantees hold. A passing suite shows that the tests were not defeated by the scenarios they cover, not that the system is secure. Independent review and adversarial testing remain necessary.
