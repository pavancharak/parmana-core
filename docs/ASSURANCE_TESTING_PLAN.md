# Parmana Verification and Assurance Plan

**Draft v0.1, 14 November 2026. Proposed plan, not yet approved.**
**Owner (all phases):** Pavan Charak
**Verified against the repository at commit `4a29854` on 14 November 2026. Section 11 records the check of the Verification and Assurance Program proposal and the changes it suggests.**

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
- `fast-check` (`^4.10.2`) is a root dependency. It is already imported by property or fuzz tests in `packages/crypto` (`canonical-serializer.property.test.ts`, `offline-verifier.fuzz.test.ts`), `packages/policy` (`policy.fuzz.test.ts`), `packages/approval` (`approval.fuzz.test.ts`) and `packages/api` (`request-fuzz.integration.test.ts`).
- `packages/crypto/tests/unit/canonical-serializer-rfc8785.test.ts` exists. Its coverage of the RFC 8785 reference vectors has not been reviewed.
- Chain-head tests exist for `CallerAuditChainVerifier` (`packages/crypto/tests/unit/caller-audit-chain-verifier.test.ts`), and `proof-audit/tests` includes audit-tamper tests. The gap in the chain-head check is still open (Section 2, mutation baseline).
- CI probe workflows run on a schedule or on pull requests: `bypass-probe.yml` (every 6 hours), `kill-switch-probe.yml` (every 15 minutes), `policy-log-drift.yml` (daily) and `outage-drill.yml` (on pull requests). None is referenced in the phase work yet. What they test has not been reviewed.

Whether the attack examples run as gated tests in CI has not been confirmed. Phase 3 converts them into gated tests.

**Not yet in place:** a cross-verification suite, concurrency tests against real storage, a fault-injection harness, and the assurance standard document. Property and fuzz tests exist for some packages (listed above) but not yet as a complete suite for canonical JSON, hashing and signature verification.

## 3. Corrections to earlier drafts

- **Mutation testing is no longer "already running."** The crypto campaign has finished. Survivor classification is the open work.
- **Package names.** Use the repository's real paths under `packages/`: `crypto`, `envelope-verifier`, `policy`, `approval`, `execution-gateway`, `execution-control`, `runtime`, `replay`, `storage`, `api`, `capability-registry`, `connector-sdk` and `shared`. The npm scope is `@parmana/`, for example `@parmana/crypto` and `@parmana/envelope-verifier`. Check npm names before citing them externally.
- **The independent verifier question.** `packages/envelope-verifier` exists and is named `@parmana/envelope-verifier`. An earlier draft referred to a package `@parmana/verifier`. No such name appears in this repository, and whether one is published has not been checked. The open question is whether the verifier shares code with the signer, because a shared implementation means a shared defect could go unnoticed.
- **Example code is illustrative.** Property tests must be written against the real function signatures.
- **The "Unauthorized Execution Challenge" is built from the attack examples**, not designed from scratch.
- **fast-check.** Already a root dependency (`^4.10.2`) and in use in five test files (Section 2). Decision 9.2 is therefore whether to keep it as the standard, not whether to add it.
- **Packages without a directory.** The Verification and Assurance Program proposal names `governance`, `execution`, `bundle`, `server` and `audit-db`, and the `@parmanasystems/` scope. None of these exists in this repository. Section 11 gives the nearest real packages.

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

## 11. Review of the Verification and Assurance Program proposal

This section records a check of the proposal "Parmana Verification and Assurance Program" against the repository at commit `4a29854` (14 November 2026). It is a record, not a change of policy. Score policy (Section 8), phase exit criteria (Section 5) and acceptance principles (Section 7) are unchanged. The proposal's changes to those are listed in 11.4 for owner decision.

### 11.1 Claims checked

| Claim in proposal | Result | Evidence |
| --- | --- | --- |
| Mutation testing is "already running" | Out of date. The crypto run is complete. | Section 2; results log entry 2026-11-14 |
| Packages are `@parmanasystems/crypto`, `verifier`, `governance`, `execution`, `bundle`, `server`, `audit-db` | Incorrect. Names are `@parmana/*`. Six of the seven have no directory under that name. | `packages/*/package.json` |
| `@parmana/verifier` is the independent verifier | Incorrect name. The package is `@parmana/envelope-verifier`. | `packages/envelope-verifier/package.json` |
| fast-check should be added | Already a dependency and in use. | Root `package.json`; Section 2 |
| Property-based tests for canonical JSON and signatures are needed | Partly in place. A canonical-serializer property test and an offline-verifier fuzz test exist. | Section 2 |
| RFC 8785 vectors are needed | A test file exists. Vector coverage not reviewed. | `canonical-serializer-rfc8785.test.ts` |
| Fuzzing of parsers and inputs is needed | Fuzz tests exist for policy, approval, api and crypto. Coverage not reviewed. | Section 2 |
| Chain-head check is uncovered | Gap confirmed by the mutation run and still open. Tests reference `CallerAuditChainVerifier`, but whether any covers the chain-head check has not been confirmed. | Section 2; results log open item 1 |
| Semgrep, OWASP ZAP, Socket and OSS-Fuzz are recommended | Not in CI. Semgrep and ZAP do not appear anywhere in the repository. OSS-Fuzz appears only in this plan. Socket appears only in a handbook page. | Repository search |
| Probe-style tests for bypass and kill switch | Workflows exist. Their scope is not reviewed. | Section 2 |
| Concurrency, fault injection and load are needed | Confirmed. Phase 4 covers them. | Section 5, Phase 4 |
| Reproducibility is needed | Confirmed. Phase 5 covers it. | Section 5, Phase 5 |

### 11.2 Mapping the 12 categories to the plan

| Category in proposal | Where it sits in this plan | Gap |
| --- | --- | --- |
| 1. Mutation | Phase 1 | Survivor classification |
| 2. Property-based | Phase 1, item 3 | Complete suite not yet written |
| 3. Fuzz | Phase 3, item 2 | None yet beyond existing fuzz tests |
| 4. Cryptographic verification | Phase 1, items 4–5 | Cross-verification suite |
| 5. Authorization boundary | Phase 2, item 1; Section 6 | Automation |
| 6. Adversarial security | Phase 3, items 1 and 3 | API, static and dependency scans |
| 7. Integration | Not in plan | Gap. Proposed in 11.4. |
| 8. End-to-end | Not in plan | Gap. Proposed in 11.4. |
| 9. Concurrency | Phase 4, item 1 | Real storage tests |
| 10. Fault injection | Phase 2, item 3; Phase 4, item 2 | Harness |
| 11. Performance and load | Phase 4, item 3 | None yet |
| 12. Reproducibility | Phase 5, item 1 | None yet |

Integration and end-to-end testing are the only categories without a home in the plan. They are not adopted here.

### 11.3 Items not in the plan that the proposal raises

- **Fail-closed cases beyond Phase 2 item 3:** credential lookup failure, incomplete execution context, partial execution, whether a failed request can be retried safely, and whether a failure to persist evidence can turn a denied or unverified operation into a success.
- **Concurrency cases beyond Phase 4, item 1:** credential revocation during execution, policy updates during authorization, and duplicate evidence submissions.
- **Credential scope and tenant isolation:** whether one tenant's agent can reach another tenant's authority.
- **Supply-chain checks:** build provenance and package provenance, beyond the SBOM in Phase 5.

### 11.4 Changes proposed for owner decision

These are not adopted. Each needs a decision from Pavan Charak, as rule 5 of `CLAUDE.md` requires for changes to the plan's policy, exit criteria and principles.

1. Add the integration and end-to-end categories to the plan, with a phase or a gate.
2. Add the fail-closed, concurrency, credential-scope, tenant-isolation and supply-chain items in 11.3 to the matrices in Phases 2, 4 and 5.
3. Use "Unauthorized Execution Challenge" (already named in Section 3) as the name of the Phase 3 attack suite, with the scenarios from the proposal as its starting list.
4. Decide the policy for a policy change after approval (Section 6, Section 9 item 3). The proposal does not resolve this.
5. Decide whether the proposal's "Phase 1 first" ordering stands. It matches this plan.

The proposal's package mapping for the rest of the work, with its order of priority, is not adopted until the names are corrected as in Section 3.

### 11.5 Proposed engineering standard

The proposed Assurance Testing Standard (PARMANA-ATS-001) is saved at [ASSURANCE_TESTING_STANDARD.md](ASSURANCE_TESTING_STANDARD.md) and marked not adopted. Its factual claims were checked against the repository, and the corrections are in its Appendix A. Adoption is decision 9.1 in Section 9. Its invariant list (ATS-001 to ATS-012) differs from Section 7 of this plan, and the owner needs to decide which list governs.

### 11.6 Formal assurance: DeepMind `code-verification` (research reference, proposed)

Checked on 14 November 2026 against the public repository (`google-deepmind/code-verification`) through its README and linked documents. The repository is not in this session's GitHub scope, so nothing was read through the GitHub tools.

**Verified**

| Claim | Result |
| --- | --- |
| Lean 4 formalizations of Signal `libsignal` security proofs | Verified |
| Two arguments: symbolic (Dolev–Yao) and computational (game-based) | Verified |
| Security claim for compiled AArch64 machine code | Verified, with a narrower scope. The README says "two AI-generated proofs of security" for a CLI harness "with hooked cryptographic primitives". |
| Toolchain: Lean 4.34.0, Rust 1.98.1, LLVM `ld.lld` 22.1.8, Zig 0.16.0 | Verified |
| Full build: several hours, about 15–34 GiB peak RAM | Verified |
| Lean Comparator: checks statement match, allowed axioms (`propext`, `Quot.sound`, `Classical.choice`) and replay in a fresh kernel | Verified. Linux only, because it uses Landlock sandboxing. |
| Non-vacuity | Partly verified. The term appears in the deviation register (DEV-PQ3, "proved non-vacuity on reachable/honest states"). Its general use as a principle is not confirmed. |
| Bug injection examples: dropped post-quantum ratchet key, leaked authentication key, retained rotated-out keys, skipped message authentication | **Not verified.** The cited page does not contain these. It documents two upstream bugs (removal of `EdwardsPoint::is_torsion_free`, and an SPQR chain key read without commitment) and synthetic mutants it does not list. Do not cite the four examples as DeepMind's. |

**Omitted from the proposal, and relevant to Parmana**

- The proofs cover one pinned ELF built with a specific toolchain and linker script. Other builds are not covered (DEV-M7).
- Cryptographic primitives are hooked, meaning trusted models, not verified as machine code. This includes SHA-256, AES-256-CBC, X25519, the Ed25519 curve core and Kyber1024 (DEV-E8, DEV-PQ1).
- **Every PQXDH result is classical.** "No post-quantum or HNDL security is claimed" (DEV-PQ19). Parmana's post-quantum signing (ML-DSA, in `packages/crypto/src/support/MlDsaSupport.ts` and `providers/signature/Dilithium3SignatureProvider.ts`) must not be described with stronger claims than the code and tests support.
- Fixed memory layout, a process per CLI call, an allocator that never frees, and public test identity keys (DEV-M6, DEV-E6, DEV-M10, DEV-M11).
- The project is "not an official Google product" and is provided "AS IS".

**Parmana corrections to the proposal**

- The package table uses names that do not exist (`verifier`, `governance`, `execution`, `bundle`, `audit-db`, `server`). Use the mapping in the Assurance Testing Standard, Section 3.
- The repository contains no Lean, TLA+ or Alloy files. No formal specification of the authority invariant exists yet.
- The authority invariant `Executed(a) ⇒ Authorized(a)` is a proposed property. The predicates `CorrectAgent`, `CorrectScope`, `ValidCredential`, `ValidPolicy` and `ApprovedActionMatches` have no code definitions yet. Each needs one before it can be stated or tested.
- The image in the proposal is linked from an `images.openai.com` address and labelled as the DeepMind logo. It was not verified and was not used.

**Proposals for owner decision (not adopted)**

1. Write a plain-language specification of the authority invariant and its predicates before any prover is chosen. This is the first step in the proposal and is consistent with Section 6 of the plan.
2. Add a non-vacuity requirement: every deny test has a paired allow test on the same path. This would extend Section 4.4 of the Standard.
3. Build a bug-injection harness that pairs each injected defect with a named detection. Stryker mutators can be used for the code-level part. The proposal's expected-detection table is a proposal and has not been checked against code.
4. Decide whether a formal proof effort is in scope. The proposal's first target, one payment workflow, would need its own scope and owner.
5. Decide whether the research publication described in the proposal is a goal.
