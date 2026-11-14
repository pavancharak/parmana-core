# Parmana Verification and Assurance Plan

**Version 1.0 (consolidated), 14 November 2026.**
**Owner (all phases):** Pavan Charak
**Decisions applied:** D1 to D5 in [ASSURANCE_DECISIONS.md](ASSURANCE_DECISIONS.md), recorded 14 November 2026.
**Verified against the repository at commit `4a29854`.** Section 11 records the review of the earlier proposals.
**Standard:** [ASSURANCE_TESTING_STANDARD.md](ASSURANCE_TESTING_STANDARD.md) (PARMANA-ATS-001), adopted as D1.

## 1. Purpose

Parmana makes four promises. Each needs a testing strategy that can be challenged independently:

| Promise                          | Meaning                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------- |
| Authority is explicit            | The business's limits are declared, versioned and tied to the actions they cover. |
| Authorization is deterministic   | The same input and policy always give the same decision.                          |
| Execution stays within authority | An action cannot exceed the authority that was granted.                           |
| Evidence is verifiable           | A third party can check the record without trusting the system that produced it.  |

Fail-closed behaviour applies to all four: when a check cannot be completed, the action is refused.

The invariants that testing must protect are ATS-001 to ATS-012 in the standard (Section 7 below).

## 2. Baseline

**Mutation testing (crypto).** The campaign on 14 November 2026 is complete: 1,215 of 1,316 mutants caught (92.3% Stryker score), 101 survived. Survivors are not yet classified. One gap is confirmed: the chain-head check in `CallerAuditChainVerifier.ts` is not covered by tests.

**Earlier mutation runs (5 October 2026).** Recorded in `docs/internal/testing/MUTATION-TESTING.md` across five packages. The re-run scores were envelope-verifier 94.0%, approval 93.9%, policy 96.0%, execution-gateway 83.6% and crypto 85.0%. Those runs used different mutant sets, so they are not directly comparable.

**Existing assets to build on:**

- `THREAT-MODEL.md`, `SECURITY-CHALLENGE.md` and `EVALUATION.md`.
- `evaluations/`, `proof-audit/`, `stryker.config.mjs`, `vitest.config.ts` and `tests/architecture/`.
- Attack examples that demonstrate refusal: 35 replay, 36 parameter tampering, 37–39 action, target and policy substitution, 40 signature forgery, 41 expired authorization, 42 nonce reuse, 43 stolen authorization, 44 direct API bypass, 45 connector bypass, 46 TOCTOU protection, and 78 duplicate transaction race. Whether they run as gated tests in CI has not been confirmed.
- `fast-check` (`^4.10.2`) is a root dependency. It is already used by property or fuzz tests in `packages/crypto` (`canonical-serializer.property.test.ts`, `offline-verifier.fuzz.test.ts`), `packages/policy` (`policy.fuzz.test.ts`), `packages/approval` (`approval.fuzz.test.ts`) and `packages/api` (`request-fuzz.integration.test.ts`).
- `packages/crypto/tests/unit/canonical-serializer-rfc8785.test.ts` exists. Its coverage of the RFC 8785 reference vectors has not been reviewed.
- Chain-head tests exist for `CallerAuditChainVerifier` (`packages/crypto/tests/unit/caller-audit-chain-verifier.test.ts`), and `proof-audit/tests` includes audit-tamper tests. Whether any of them covers the chain-head check is not confirmed.
- CI probe workflows: `bypass-probe.yml` (every 6 hours), `kill-switch-probe.yml` (every 15 minutes), `policy-log-drift.yml` (daily) and `outage-drill.yml` (on pull requests). What they test has not been reviewed.

**Not yet in place:** a cross-verification suite, concurrency tests against real storage, a fault-injection harness, and a complete property suite for canonical JSON, hashing and signature verification.

## 3. Package names

Use the repository's real paths under `packages/`: `crypto`, `envelope-verifier`, `policy`, `approval`, `execution-gateway`, `execution-control`, `runtime`, `replay`, `storage`, `api`, `capability-registry`, `connector-sdk`, `shared`, `cli`, `execution-system` and `governance-ui`. The npm scope is `@parmana/`, for example `@parmana/crypto` and `@parmana/envelope-verifier`. Check npm names before citing them externally.

Names used in the standard that have no directory of their own:

| Name in the standard | Status                                                  |
| -------------------- | ------------------------------------------------------- |
| verifier             | `packages/envelope-verifier`                            |
| governance           | `policy` and `approval` (candidate)                     |
| execution            | `execution-gateway` and `execution-control` (candidate) |
| server               | `packages/api` (plausible, not confirmed)               |
| audit-db             | `packages/storage` (not confirmed)                      |
| verifier-cli         | `packages/cli` (not confirmed)                          |
| bundle, core         | Not packages. Probably concepts. Owner to decide.       |

The mapping status is recorded in standard Section 3 and Appendix A.

## 4. Guarantees mapped to controls

| Promise                          | Test categories                                  | Primary packages                                    | Evidence produced                       |
| -------------------------------- | ------------------------------------------------ | --------------------------------------------------- | --------------------------------------- |
| Authority is explicit            | Policy validation, authoring-time refusal        | `policy`                                            | Validator test results                  |
| Authorization is deterministic   | Property-based, reproducibility                  | `policy`, `approval`, `execution-control`           | Same-input, same-output report          |
| Execution stays within authority | Boundary, adversarial, concurrency, integration  | `execution-gateway`, `execution-control`, `storage` | Attack-suite results per release        |
| Evidence is verifiable           | Mutation, cross-verification, fuzzing, tampering | `crypto`, `envelope-verifier`, `replay`             | Survivor classification, vector results |
| Fail-closed                      | Fault injection                                  | `execution-gateway`, `storage`, `api`               | Fault-matrix results                    |

## 5. Phases

Each phase has work and exit criteria. No phase is complete until its criteria are met. **Owner for every phase: Pavan Charak.**

Work items marked **[D3]** were added by decision D3 in `ASSURANCE_DECISIONS.md`. Work items marked **[D4]** or **[D5]** follow from those decisions.

### Phase 1: Cryptographic assurance

**Work**

1. Classify all 101 crypto survivors as missing test, insufficient assertion, equivalent, unreachable or out of scope. Record the rationale for each.
2. Cover the chain-head check in `CallerAuditChainVerifier.ts`. Write the tests first, then re-run the mutants for that file.
3. Complete the property-based suite for canonical JSON, hashing and signature verification. Build on the existing property and fuzz tests.
4. Review the RFC 8785 test file and add any missing reference vectors.
5. Add a cross-verification test: sign with the production code, verify with an independently written verifier, then tamper and re-check.

**Exit criteria**

- Every survivor has a classification and rationale.
- The chain-head check is covered and its mutants are re-run.
- Equivalent mutants are listed with reasons.
- Property and vector tests run in CI.

### Phase 2: Authorization assurance

**Work**

0. **[D4]** Write a one-page plain-language specification of the authority invariant, `Executed(a) ⇒ Authorized(a)`. Define the predicates it relies on: correct agent, correct scope, valid credential, valid policy and approved action matches. This comes before any formal tool is considered.
1. Automate the authorization boundary matrix (Section 6) in `policy`, `approval` and `execution-gateway`. **[D4]** Each deny case has a paired allow case on the same execution path.
2. Test replay, revocation, cached credentials, and policy changes after an approval has been granted.
3. Add a fail-closed matrix: policy unavailable, database unavailable, signature verifier unavailable, trust root unavailable, ledger write failure, timeout, incomplete context, credential lookup failure. **[D3]** Include partial execution: execution must not begin before authorization is complete, and a failure partway through must be recorded.
4. **[D3]** Credential scope and tenant isolation: one agent cannot use another agent's credential, and one tenant's agent cannot reach another tenant's authority (ATS-006, ATS-007).
5. **[D3]** Integration tests for package interactions: Governance → Verifier, Governance → Execution, Execution → Audit storage, and Server → Core (Section 4.9 of the standard).
6. **[D3]** One end-to-end test of the payment workflow, from request to recorded evidence, asserting that authority is preserved.

**Exit criteria**

- Every matrix row has an automated test.
- Each fail-closed case shows that no execution occurred and that the failure was recorded.
- Each deny case in the boundary suites has a paired allow case.
- The integration and end-to-end tests run in CI.

### Phase 3: Adversarial assurance

**Work**

1. Convert examples 35–46 and 78 into CI tests that assert refusal.
2. Fuzz the parsers for canonical JSON, envelopes, policy bundles and signal input.
3. Run an API security scan against `packages/api`, a static analysis pass, and a dependency scan.
4. Name the attack suite "Unauthorized Execution Challenge", using the scenarios in the proposal as its starting list (Section 11.4).

**Exit criteria**

- Each attack example runs in CI and asserts refusal.
- Fuzzing has run without an accepted malformed input that should have been refused.

### Phase 4: Operational assurance

**Work**

1. Test concurrency against real storage, not just in-memory functions. Scenario: two simultaneous ₹7,000 requests against a ₹10,000 limit.
2. Inject faults into the database, the policy service and the ledger write.
3. Run load tests on the enforcement path.
4. **[D3]** Concurrency cases: credential revocation during execution, policy updates during authorization, and duplicate evidence submissions (ATS-007, ATS-008).

**Exit criteria**

- Concurrent spend tests never exceed the granted limit across repeated runs.
- The fault matrix passes with fail-closed behaviour.
- The concurrency cases in item 4 pass against real storage.

### Phase 5: Release assurance

**Work**

1. Verify reproducible builds.
2. Generate an SBOM for each release.
3. **[D3]** Supply-chain gate: dependency scan, lockfile consistency, build provenance and release signatures (ATS-012).
4. Produce an assurance report per release, recording the commit SHA, the mutation score for each package, the invariant table, and the failures and how each was resolved.

**Exit criteria**

- A release can be rebuilt and its assurance report regenerated from the commit SHA.
- The supply-chain gate passes for the release.

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

Every Deny row has a paired Allow case on the same path (**[D4]**). The "policy changed after approval" row cannot be tested until its behaviour is defined (Section 9, item 3).

## 7. Acceptance principles

These are the engineering invariants of the standard (ATS-001 to ATS-012). **Decided 14 November 2026 (D2):** ATS-001 to ATS-012 governs.

| Principle       | ATS ID  | Requirement                                                |
| --------------- | ------- | ---------------------------------------------------------- |
| Determinism     | ATS-001 | Identical inputs produce identical defined outputs.        |
| Authorization   | ATS-002 | No unauthorized execution.                                 |
| Integrity       | ATS-003 | Tampering is detected.                                     |
| Verification    | ATS-004 | Invalid evidence is rejected.                              |
| Trust           | ATS-005 | Untrusted keys cannot establish valid authorization.       |
| Isolation       | ATS-006 | One agent cannot exceed another agent's authority.         |
| Revocation      | ATS-007 | Revoked authority cannot authorize new execution.          |
| Concurrency     | ATS-008 | Simultaneous requests cannot bypass limits.                |
| Fail-closed     | ATS-009 | A verification failure cannot become an approval.          |
| Evidence        | ATS-010 | Execution evidence corresponds to the actual decision.     |
| Reproducibility | ATS-011 | Release testing can be repeated independently.             |
| Supply chain    | ATS-012 | Published artifacts correspond to validated source builds. |

## 8. Gates

**Pull request gate.** Existing jobs (build-and-test, DCO, verified-commits, CodeQL, dependency-review, verify-policy-approvals) plus the property, boundary, integration and attack-example suites as they are added in Phases 1–3.

**Scheduled gate.** Per-package mutation runs, plus the concurrency and fault-injection suites. The schedule should be set by measured run time, which has not yet been recorded.

**Release gate.** Full suite, reproducible-build check, SBOM, supply-chain gate and the assurance report.

**Score policy.** No aggregate mutation threshold defines success. Critical invariants require every survivor to be classified and, where meaningful, tested. A high aggregate score cannot offset one untested authorization bypass.

## 9. Decisions

| #   | Question                                                          | Status                                                                         |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Adopt `ASSURANCE_TESTING_STANDARD.md` as the repository standard? | **Decided (D1): adopted.** Candidate package mappings remain open (Section 3). |
| 2   | Keep fast-check as the property-testing library?                  | Open. It is already a dependency and in use. Recommended: keep.                |
| 3   | What is the defined behaviour for a policy change after approval? | **Open.** Needed before the matching row in Section 6 can be tested.           |
| 4   | Is OSS-Fuzz worth the setup cost?                                 | Open. Optional, and adapting it is not trivial.                                |
| 5   | Are formal proofs in scope?                                       | **Decided (D5): revisit after Phase 2.** Not in scope now.                     |

Other decisions that are recorded: the invariant list (D2), the scope of added categories (D3), and the plain-language specification and paired tests (D4).

## 10. Limits

This plan does not establish security. It defines how to test whether the guarantees hold. A passing suite shows that the tests were not defeated by the scenarios they cover, not that the system is secure. Independent review and adversarial testing remain necessary.

## 11. Review record

This section records the checks made on the earlier proposals. It is a record, not a change of policy.

### 11.1 Claims checked (Verification and Assurance Program proposal)

| Claim in proposal                                                                                                  | Result                                                                                                                                          | Evidence                                  |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Mutation testing is "already running"                                                                              | Out of date. The crypto run is complete.                                                                                                        | Section 2; results log entry 2026-11-14   |
| Packages are `@parmanasystems/*` (`crypto`, `verifier`, `governance`, `execution`, `bundle`, `server`, `audit-db`) | Incorrect. Names are `@parmana/*`. Six of the seven have no directory under that name.                                                          | `packages/*/package.json`                 |
| `@parmana/verifier` is the independent verifier                                                                    | Incorrect name. The package is `@parmana/envelope-verifier`.                                                                                    | `packages/envelope-verifier/package.json` |
| fast-check should be added                                                                                         | Already a dependency and in use.                                                                                                                | Root `package.json`; Section 2            |
| Property-based tests for canonical JSON and signatures are needed                                                  | Partly in place.                                                                                                                                | Section 2                                 |
| RFC 8785 vectors are needed                                                                                        | A test file exists. Vector coverage not reviewed.                                                                                               | `canonical-serializer-rfc8785.test.ts`    |
| Fuzzing of parsers and inputs is needed                                                                            | Fuzz tests exist for policy, approval, api and crypto. Coverage not reviewed.                                                                   | Section 2                                 |
| Chain-head check is uncovered                                                                                      | Gap confirmed by the mutation run and still open.                                                                                               | Section 2; results log open item 1        |
| Semgrep, OWASP ZAP, Socket and OSS-Fuzz are recommended                                                            | Not in CI. Semgrep and ZAP do not appear anywhere in the repository. OSS-Fuzz appears only in the plan. Socket appears only in a handbook page. | Repository search                         |
| Probe-style tests for bypass and kill switch                                                                       | Workflows exist. Their scope is not reviewed.                                                                                                   | Section 2                                 |
| Concurrency, fault injection and load are needed                                                                   | Confirmed. Phase 4 covers them.                                                                                                                 | Section 5, Phase 4                        |
| Reproducibility is needed                                                                                          | Confirmed. Phase 5 covers it.                                                                                                                   | Section 5, Phase 5                        |

### 11.2 Mapping the 12 categories to the plan

| Category                      | Where it sits in this plan       | Gap                                 |
| ----------------------------- | -------------------------------- | ----------------------------------- |
| 1. Mutation                   | Phase 1                          | Survivor classification             |
| 2. Property-based             | Phase 1, item 3                  | Complete suite not yet written      |
| 3. Fuzz                       | Phase 3, item 2                  | None yet beyond existing fuzz tests |
| 4. Cryptographic verification | Phase 1, items 4–5               | Cross-verification suite            |
| 5. Authorization boundary     | Phase 2, item 1; Section 6       | Automation                          |
| 6. Adversarial security       | Phase 3, items 1 and 3           | API, static and dependency scans    |
| 7. Integration                | Phase 2, item 5 **[D3]**         | Harness not yet built               |
| 8. End-to-end                 | Phase 2, item 6 **[D3]**         | One payment test                    |
| 9. Concurrency                | Phase 4, items 1 and 4           | Real storage tests                  |
| 10. Fault injection           | Phase 2, item 3; Phase 4, item 2 | Harness                             |
| 11. Performance and load      | Phase 4, item 3                  | None yet                            |
| 12. Reproducibility           | Phase 5, item 1                  | None yet                            |

### 11.3 Items the proposal raised

- **Fail-closed cases:** added to Phase 2, item 3 **[D3]**.
- **Concurrency cases:** added to Phase 4, item 4 **[D3]**.
- **Credential scope and tenant isolation:** added to Phase 2, item 4 **[D3]**.
- **Supply-chain checks:** added to Phase 5, item 3 **[D3]**.

### 11.4 Changes proposed, and their decisions

These were decided as recorded in [ASSURANCE_DECISIONS.md](ASSURANCE_DECISIONS.md), D3 and D5.

1. Integration and end-to-end categories: added, with the scope in D3.
2. Fail-closed, concurrency, credential-scope, tenant-isolation and supply-chain items: added to Phases 2, 4 and 5.
3. "Unauthorized Execution Challenge" as the name of the Phase 3 attack suite: adopted.
4. Policy change after approval: **still open** (Section 9, item 3).
5. "Phase 1 first" ordering: kept.

### 11.5 Engineering standard

The Assurance Testing Standard (PARMANA-ATS-001) is at [ASSURANCE_TESTING_STANDARD.md](ASSURANCE_TESTING_STANDARD.md). It is adopted (D1). Its factual claims were checked against the repository, and the corrections are in its Appendix A.

### 11.6 Formal assurance: DeepMind `code-verification` (research reference)

Checked on 14 November 2026 against the public repository (`google-deepmind/code-verification`) through its README and linked documents. The repository is not in this session's GitHub scope, so nothing was read through the GitHub tools.

**Verified:**

- Lean 4 formalizations of Signal `libsignal` security proofs, with symbolic (Dolev–Yao) and computational (game-based) arguments.
- The machine-code claim is narrower than the proposal's wording. The README says "two AI-generated proofs of security" for a CLI harness "with hooked cryptographic primitives".
- Toolchain: Lean 4.34.0, Rust 1.98.1, LLVM `ld.lld` 22.1.8, Zig 0.16.0. Full build: several hours, about 15–34 GiB peak RAM.
- Lean Comparator checks statement match, allowed axioms (`propext`, `Quot.sound`, `Classical.choice`) and replay in a fresh kernel. Linux only, because it uses Landlock sandboxing.
- "Non-vacuity" appears in the deviation register (DEV-PQ3, "proved non-vacuity on reachable/honest states"). Its use as a general principle is not confirmed.

**Not verified:** the bug-injection examples in the proposal (dropped post-quantum ratchet key, leaked authentication key, retained rotated-out keys, skipped message authentication). The cited page does not contain them. It documents two upstream bugs (removal of `EdwardsPoint::is_torsion_free`, and an SPQR chain key read without commitment) and synthetic mutants it does not list. Do not cite the four examples as DeepMind's.

**Omitted from the proposal, and relevant to Parmana:**

- The proofs cover one pinned ELF built with a specific toolchain and linker script. Other builds are not covered (DEV-M7).
- Cryptographic primitives are hooked, meaning trusted models, not verified as machine code. This includes SHA-256, AES-256-CBC, X25519, the Ed25519 curve core and Kyber1024 (DEV-E8, DEV-PQ1).
- Every PQXDH result is classical. No post-quantum or HNDL security is claimed (DEV-PQ19). Parmana's ML-DSA signing (`packages/crypto/src/support/MlDsaSupport.ts`, `providers/signature/Dilithium3SignatureProvider.ts`) must not be described with stronger claims than the code and tests support.
- Fixed memory layout, a process per CLI call, an allocator that never frees, and public test identity keys (DEV-M6, DEV-E6, DEV-M10, DEV-M11).
- The project is "not an official Google product" and is provided "AS IS".

**Parmana corrections to the proposal:**

- The package table uses names that do not exist. Use the mapping in Section 3.
- The repository contains no Lean, TLA+ or Alloy files.
- The predicates in `Executed(a) ⇒ Authorized(a)` have no code definitions yet. Phase 2, item 0 covers them **[D4]**.
- The image in the proposal is linked from an `images.openai.com` address and labelled as the DeepMind logo. It was not verified and was not used.

**Decided:** a plain-language specification before any prover (D4); formal proofs revisited after Phase 2, not in scope now (D5). Still open, not decided: the bug-injection harness and the research publication.

## 12. Review record: PoAE formal security specification v0.1 (proposed)

Checked on 14 November 2026 against commit `4a29854` and the working tree of `claude/lucid-sagan-1gs4xj`. The proposal is research direction and has not been adopted. Nothing below changes the score policy, the phase exit criteria or the acceptance principles.

### 12.1 Claims checked

| Claim in proposal                                                                                        | Result                                                                                                                                                                                             | Evidence                                   |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Packages `@parmanasystems/governance`, `execution`, `crypto`, `bundle`, `verifier`, `audit-db`, `server` | Incorrect names, as in earlier proposals. `crypto` exists. Others need the mapping in the standard, Section 3.                                                                                     | `packages/*/package.json`                  |
| Authorization binds policy bundle hash                                                                   | Not found. No source file matches `policyBundleHash`, `bundleHash` or `policyHash`.                                                                                                                | Repository search of `packages/*/src`      |
| Authorization binds authority identifier and version                                                     | Not found. No source file matches `authorityVersion` or `grantVersion`.                                                                                                                            | Repository search                          |
| Nonce or replay protection value                                                                         | Present. The term appears in 62 source files. Whether it is bound to the authorization is not yet confirmed.                                                                                       | Repository search                          |
| Authorization timestamp and expiry                                                                       | Present. The terms appear in 63 source files.                                                                                                                                                      | Repository search                          |
| Canonical action hash                                                                                    | Partly present. Action or intent hash terms appear in 19 source files.                                                                                                                             | Repository search                          |
| Unique transaction identifier                                                                            | Partly present. Transaction id terms appear in 7 source files.                                                                                                                                     | Repository search                          |
| Execution receipt carrying the executed action hash                                                      | Not found. No receipt term in `execution-gateway` or `execution-control`.                                                                                                                          | Repository search                          |
| Frozen cryptographic integrity core, which must not be modified                                          | No document defines a frozen core. The word appears only in one test file, `packages/crypto/tests/unit/crypto-verifiers.exact.test.ts`. The rule needs an owner decision and a written definition. | Repository search                          |
| Attack examples 35–46 and 78 run in CI                                                                   | Not confirmed. No CI reference found. Same open item as Section 2.                                                                                                                                 | Repository search of `.github` and `tests` |
| Mutation testing on evidence and records                                                                 | Not implemented. Stryker mutates source code only. An artifact-level harness does not exist yet.                                                                                                   | `stryker.config.mjs`; Section 4.1          |
| Crypto tests for policy change, execution intent and verification authorization                          | Present: `policy-change-crypto.test.ts`, `execution-intent-crypto.test.ts`, `verification-crypto-authorization.test.ts`. Coverage of T03 and T07 not reviewed.                                     | Repository file list                       |

### 12.1a Correction (14 November 2026)

Two items in 12.1 were wrong. A later search found the following.

- **Policy binding exists.** The authorization carries `policyContentHash`, and the gateway checks it against the live policy before release. The earlier search missed it because it looked for `policyHash`. XM-03 is therefore testable now.
- **Authority identifier exists.** The authorization carries `authorityGrant.grantId`. Only the version is missing.

Also, a signed Receipt already exists, and so does a connector evidence hash. The gap is an exact comparison between the authorized content hash and the dispatched content hash. The connector hash is computed over a redacted summary, so it can't be compared exactly. See the execution receipt design (moved to parmana-poae-benchmark).

### 12.2 Consequences for the plan

- POAE-03 (execution correspondence) cannot be tested until an execution receipt binding the executed action hash exists. That is a product gap, not only a testing gap.
- POAE-02 and T03 (policy change after authorization) need the policy-hash binding. This is the same open decision as Section 9, item 3.
- T10 (evidence removed from the ledger, detected by independent reconciliation) has no reconciliation component in the repository yet. Two candidate sources exist: the policy-log drift workflow and the caller audit chain. Neither has been reviewed for this purpose.
- The proposal's "frozen core" rule cannot be enforced until it is defined in writing.

### 12.3 Decisions (items 1 to 3 decided 14 November 2026, see D6 to D8)

1. Decided (D6): a separate research track, sharing the Phase 2 authorization tests.
2. Define the "frozen cryptographic integrity core" in writing, with the files it covers, before it is relied on.
3. Is a new execution receipt in scope? It is a product change and needs its own decision.
4. Approve the `parmana-poae-benchmark` structure only after items 1 to 3 are decided. Its experiments map to the existing phases, not new ones.
5. The 20-test benchmark: the category counts sum to 20, and the success criteria are targets only. Results must be reported as measured, including false rejections.

### 12.4 Scope of the research claim

The proposal correctly separates integrity from authenticity. A valid hash proves integrity relative to the hashed data, not that the event occurred. A valid signature proves that a key signed, not that the key holder had authority. Any PoAE paper must state both limits.
