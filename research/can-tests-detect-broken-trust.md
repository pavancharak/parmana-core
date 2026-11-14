# Can Tests Detect Broken Trust?

## Evaluating Cryptographic Integrity Guarantees Through Mutation Testing in Autonomous Systems

**Research Publication — Parmana Systems**

**Research Area:** Cryptographic Integrity, Software Verification, Autonomous Systems, Deterministic Governance

**Research Status:** Crypto mutation campaign complete; survivor classification in progress  
**Version:** Research Draft 0.2  
**Date:** 14 November 2026

---

## Abstract

Autonomous systems increasingly make decisions and execute operations with limited human intervention. Their reliability depends not only on the correctness of their implementation but also on the integrity of the mechanisms that authorize, execute, record and verify those operations.

Cryptographic integrity mechanisms are frequently validated through conventional software testing. However, passing tests do not necessarily establish that a test suite can detect meaningful violations of the properties it is intended to protect.

This research investigates whether mutation testing can provide measurable evidence of the effectiveness of cryptographic integrity tests in Parmana, a deterministic authority and execution integrity system.

We introduce an experimental methodology in which deliberate mutations are introduced into cryptographic implementation components. The resulting implementations are tested against the existing test suite to determine whether the mutations are detected, survive testing or produce inconclusive execution outcomes.

The study focuses on deterministic serialization, cryptographic hashing, digital signatures, policy verification, trust boundaries, hash-chain integrity and fail-closed execution behaviour.

The research proposes a measurable framework for evaluating test effectiveness through mutation scores, surviving mutant classification, invariant coverage and regression testing.

The central hypothesis is that conventional test success is insufficient evidence of integrity assurance unless the test suite can detect deliberate violations of the guarantees it is designed to protect.

**Keywords:** Mutation Testing, Cryptographic Integrity, Autonomous Systems, Deterministic Authorization, Software Verification, Hash Chains, Digital Signatures, Test Adequacy.

---

## 1. Introduction

Software systems traditionally establish confidence through testing.

A test suite executes defined scenarios and evaluates whether the implementation produces expected outcomes.

However, a passing test suite does not necessarily establish that the system would detect an implementation defect that violates a critical security property.

This distinction becomes particularly important in autonomous systems.

An autonomous system may receive a request, evaluate its authorization, execute an operation and generate evidence of that operation.

If any of these stages fails silently, the system may produce an outcome that appears valid while violating the underlying authorization or integrity requirements.

For example:

- A signature verification function may accept an invalid signature.
- A canonical serialization mechanism may produce inconsistent representations.
- An authorization check may fail to enforce a declared limit.
- An evidence chain may accept a record with an incorrect predecessor hash.
- A verification failure may accidentally permit execution.

Conventional tests may not detect these failures if their assertions do not adequately exercise the relevant conditions.

Mutation testing offers a way to investigate this problem.

Instead of asking whether the implementation passes its tests, mutation testing deliberately modifies the implementation and asks whether the tests detect the resulting behavioural differences.

This research applies that approach to Parmana's cryptographic integrity infrastructure.

## 2. Research Problem

The research addresses the gap between passing software tests and demonstrating that those tests adequately protect declared integrity properties.

The central problem is:

**How can we measure whether a cryptographic integrity test suite detects deliberate violations of the properties it is intended to enforce?**

Three distinct questions emerge:

1. Are the required integrity properties explicitly defined?
2. Does the implementation enforce those properties?
3. Can the test suite detect deliberate implementation changes that violate those properties?

This research primarily investigates the third question, while using the first two to define and classify the experiments.

## 3. Research Objectives

The study has six objectives.

1. Identify the critical cryptographic integrity invariants in Parmana.
2. Generate deliberate mutations against implementation components.
3. Evaluate whether existing tests detect those mutations.
4. Identify surviving mutations and classify their significance.
5. Strengthen tests to address meaningful gaps.
6. Establish a repeatable methodology for measuring cryptographic test effectiveness.

The intended outcome is a reproducible experimental framework that can be applied to other integrity-sensitive autonomous systems.

## 4. Research Questions

**RQ1:** How effectively does mutation testing identify weaknesses in cryptographic integrity test suites?

**RQ2:** Which cryptographic integrity properties are most vulnerable to surviving mutations?

**RQ3:** Do conventional passing tests adequately detect deliberate violations of authorization and verification conditions?

**RQ4:** Can systematic mutation testing improve the detection of failures involving deterministic serialization, signatures, hashing and evidence-chain verification?

**RQ5:** Can the same methodology provide a repeatable measurement of test effectiveness across successive software releases?

## 5. Research Hypotheses

| Hypothesis | Expected observation                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| H1         | Deliberate mutations to critical cryptographic operations will expose test-suite weaknesses.                              |
| H2         | Mutations involving authorization boundaries and fail-closed behaviour will reveal important gaps in security assertions. |
| H3         | Surviving meaningful mutants will decrease after targeted test improvements.                                              |
| H4         | Independent verification tests will detect evidence-tampering mutations that ordinary execution tests may miss.           |
| H5         | Repeated mutation testing will provide a measurable basis for comparing test effectiveness across releases.               |

These hypotheses will be evaluated against experimental results. They are not assumed to be true in advance. Section 12 states what the current data does and does not show for each.

## 6. System Under Study

The experimental subject is Parmana's deterministic integrity infrastructure.

The system establishes a relationship between declared authority, authorization decisions, execution and verifiable evidence.

The relevant cryptographic and integrity mechanisms include:

- Canonical JSON serialization.
- RFC 8785 canonicalization.
- SHA-256 hashing.
- Cryptographic signing and signature verification.
- Trust-root key validation.
- Policy integrity and verification.
- Append-only evidence records.
- Hash-chain integrity.
- Fail-closed verification behaviour.

The experiment concentrates on the cryptographic implementation and its associated test suite.

The wider business authorization architecture provides the context for interpreting the significance of the tested properties.

## 7. Threat Model

### 7.1 Threat assumptions

The experiment assumes that an implementation can contain deliberate or accidental modifications that weaken an integrity guarantee.

The mutations simulate implementation defects rather than a specific external attacker.

Examples include:

- Removing a cryptographic verification condition.
- Changing a hash input.
- Weakening a comparison.
- Bypassing a validation branch.
- Accepting invalid or expired credentials.
- Ignoring an evidence-chain inconsistency.
- Changing a failure response into an acceptance response.

### 7.2 Protected properties

The following properties define the experimental security boundary.

| Property                | Required guarantee                                                          |
| ----------------------- | --------------------------------------------------------------------------- |
| Serialization integrity | Equivalent structured inputs produce the required canonical representation. |
| Hash integrity          | Hashes correspond to the intended canonical bytes.                          |
| Signature integrity     | Invalid signatures are rejected.                                            |
| Trust integrity         | Untrusted signing keys are not accepted.                                    |
| Authorization integrity | Actions outside declared authority are rejected.                            |
| Expiry integrity        | Expired authorization material is rejected.                                 |
| Chain integrity         | Invalid predecessor hashes are detected.                                    |
| Failure integrity       | Verification failures cannot silently authorize execution.                  |

### 7.3 Out-of-scope threats

This study does not claim to evaluate:

- Hardware compromise.
- Private-key extraction.
- Side-channel attacks.
- Cryptographic algorithm weaknesses.
- Compiler correctness.
- Operating-system compromise.
- Distributed consensus failures.
- All possible adversarial behaviour of autonomous AI agents.

These require separate experimental and formal verification methods.

Mutation testing evaluates the effectiveness of the test suite against the mutations generated. It does not establish comprehensive security.

## 8. Experimental Methodology

### 8.1 Research design

The study uses controlled software mutation experiments.

The baseline implementation is first built and tested.

A mutation engine then introduces controlled modifications into selected source files.

Each mutated implementation is evaluated against the existing test suite.

The outcome is classified according to whether the mutation is detected, survives testing, times out or produces an inconclusive result.

### 8.2 Experimental workflow

**Phase 1: Establish baseline**

- Build the relevant packages.
- Execute the existing test suite.
- Record baseline test results.
- Identify the selected cryptographic source files.

**Phase 2: Generate mutations**

Generate mutations involving operators such as:

- Conditional boundary changes.
- Boolean condition inversion.
- Comparison operator replacement.
- Return-value changes.
- Arithmetic changes.
- Statement removal.
- Validation bypasses.

The mutation engine determines which operators are applicable to the selected source code.

**Phase 3: Execute tests**

Run the test suite against each mutated implementation.

Record:

- Mutants generated.
- Mutants tested.
- Mutants killed.
- Mutants survived.
- Mutants timed out.
- Mutants classified as equivalent.
- Infrastructure and execution errors.

**Phase 4: Classify surviving mutants**

Every surviving mutant is investigated to determine whether it represents:

1. A missing test.
2. An insufficient assertion.
3. An equivalent mutation.
4. An unreachable execution path.
5. A mutation outside the intended security invariant.
6. An actual weakness in the implementation or its test coverage.

**Phase 5: Improve tests**

Add targeted tests for meaningful surviving mutations.

**Phase 6: Repeat the experiment**

Execute the same mutation campaign against the improved test suite.

Compare the results with the original baseline.

### 8.3 Experimental controls

To support reproducibility:

- Preserve the baseline source revision.
- Record the runtime and dependency versions.
- Use the same mutation configuration across comparison runs.
- Record the mutation operator and affected source location.
- Preserve test output and mutation reports.
- Separate test failures from infrastructure failures.
- Document excluded and equivalent mutants.

The experiment must avoid changing the baseline implementation and test configuration simultaneously.

## 9. Experimental Test Matrix

The following matrix defines the initial test campaign.

| ID  | Mutation scenario                             | Expected behaviour                                        |
| --- | --------------------------------------------- | --------------------------------------------------------- |
| M01 | Change SHA-256 input                          | Integrity verification detects mismatch.                  |
| M02 | Remove canonicalization                       | Canonical representation tests fail.                      |
| M03 | Alter canonical JSON output                   | Verification detects inconsistent representation.         |
| M04 | Bypass signature verification                 | Invalid signatures are rejected by tests.                 |
| M05 | Accept an untrusted key                       | Trust validation fails.                                   |
| M06 | Remove expiry validation                      | Expired authorization is rejected.                        |
| M07 | Weaken authorization comparison               | Out-of-scope action is rejected.                          |
| M08 | Ignore predecessor hash                       | Broken evidence chain is rejected.                        |
| M09 | Modify a previously recorded entry            | Evidence verification detects tampering.                  |
| M10 | Change verification failure to acceptance     | Fail-closed tests fail.                                   |
| M11 | Remove a required policy condition            | Policy integrity tests fail.                              |
| M12 | Change signature verification result handling | Invalid verification outcomes cannot authorize execution. |

These are semantic test scenarios. The actual generated mutants and their source locations must be recorded separately. A mutation operator does not necessarily generate every scenario in this table. The campaign reported in Section 11 was not organised around these scenarios, so Section 11 does not show which of M01–M12 the generated mutants covered.

## 10. Measurement Framework

### 10.1 Primary metric: Mutation score

The principal measurement is the mutation score.

\[
MS = \frac{K}{G-E}\times100
\]

Where:

- \(K\) = killed mutants.
- \(G\) = generated mutants included in the final campaign.
- \(E\) = equivalent mutants.

A mutant is killed when the test suite detects the behavioural difference introduced by that mutation.

Equivalent mutants are mutations that do not change the observable behaviour relevant to the experiment.

The Stryker score reported in Section 11 counts caught mutants (killed plus timed out) over all generated mutants. Equivalent mutants have not yet been separated out for the final campaign, so Section 11 does not report the MS value defined above.

### 10.2 Secondary metrics

| Metric                      | Purpose                                                                   |
| --------------------------- | ------------------------------------------------------------------------- |
| Mutant kill rate            | Measures detected mutations.                                              |
| Survival rate               | Identifies mutations not detected by tests.                               |
| Equivalent mutant rate      | Measures non-meaningful generated mutations.                              |
| Timeout rate                | Identifies inconclusive executions.                                       |
| Critical invariant coverage | Measures whether each defined integrity property has corresponding tests. |
| Regression effectiveness    | Measures whether previously surviving mutants are now detected.           |
| Reproducibility             | Measures whether repeated experiments produce consistent outcomes.        |

### 10.3 Invariant-level measurement

An aggregate mutation score can hide important weaknesses.

For example, a test suite may detect most serialization mutations while failing to detect an authorization bypass.

Therefore, results must also be reported by integrity invariant.

Each critical invariant should have:

- A defined requirement.
- One or more corresponding tests.
- Relevant generated mutations.
- Detection outcomes.
- Surviving mutation explanations.

A high aggregate mutation score must not compensate for an undetected critical authorization or evidence-integrity violation.

## 11. Experimental Results

### 11.1 Campaign history

Two crypto mutation campaigns have been run.

**Campaign A (5 October 2026).** A first run and a re-run covered five security-critical packages, including `crypto`. The first crypto run was on Node 22, where the ML-DSA-65 and hybrid signature tests skip themselves, so every mutant in those paths counted as missed. Its score was 65.4% (662 of 1,012). After that run, tests were added for the surviving mutants, and the re-run on Node 24 scored 85.0% (886 of 1,042). The mutant count changed between runs because the fixes added code. This run was not a controlled before-and-after measurement on a fixed mutant set.

**Campaign B (14 November 2026).** A full run on the crypto package only, on Node 24.18, after the signing-key configuration change (PR #613) and a build fix. The initial test run passed before any mutant was tested. This is the campaign reported below.

### 11.2 Final crypto campaign

Execution command:

`npm run mutation -- crypto`

| Measurement                                 | Observed value |
| ------------------------------------------- | -------------: |
| Mutants generated                           |          1,316 |
| Killed by tests                             |          1,185 |
| Timed out (counted as caught)               |             30 |
| Survived                                    |            101 |
| Caught (killed plus timed out)              |          1,215 |
| Stryker mutation score (caught / generated) |          92.3% |
| Runtime                                     |     Node 24.18 |
| Duration                                    |     92 minutes |

The 92.3% figure is the Stryker score. It is not yet the MS value defined in Section 10.1, because equivalent mutants have not been classified for this campaign.

### 11.3 Survivors by file

The campaign report lists nine files. Survivors in those files, lowest score first:

| File                          | Score | Survived |
| ----------------------------- | ----: | -------: |
| `KeyGeneration.ts`            | 73.1% |       25 |
| `CallerAuditChainVerifier.ts` | 63.8% |       21 |
| `AuthorizationSigner.ts`      | 67.7% |       21 |
| `KeyBootstrap.ts`             | 64.3% |        5 |
| `CryptoBootstrap.ts`          | 61.1% |        7 |
| `ExecutionIntentCrypto.ts`    | 66.7% |        3 |
| `CryptoError.ts`              | 33.3% |        2 |
| `KeyProvider.ts`              |  100% |        0 |
| `KmsSigner.ts`                |  100% |        0 |

These nine files account for 84 of the 101 survivors. The remaining 17 survivors are in files not itemised in the current report. They have not been reviewed for this draft.

### 11.4 What the survivors show so far

These observations come from the file-level summary only. No survivor has yet been classified as a missing test, an insufficient assertion or an equivalent mutation.

- **Chain-head check is not covered.** In `CallerAuditChainVerifier.ts`, changing or removing the check that the chain ends at the anchored head was not caught. A truncated audit chain could pass that check. This bears directly on the chain-integrity property in Section 7.2. Tests for this check come first, before any other work on this file.
- **Signing-key code is covered.** `KeyProvider.ts`, which holds the current signing-key lookup, and `KmsSigner.ts` have no survivors.
- **Optional-field and key-generation conditions are not fully covered.** Changes to conditions on optional fields in `AuthorizationSigner.ts`, and to the principal, capability and hash rules in `KeyGeneration.ts`, were not caught. Each survivor still needs classifying as a missing test or an equivalent change.
- **Bootstrap and error text.** Guards in `CryptoBootstrap.ts` and `KeyBootstrap.ts`, and the message in `CryptoError.ts`, were not all checked.

### 11.5 Interpretation

The campaign shows that the mutation-testing infrastructure runs end to end against the full crypto package. Its results identify at least one specific integrity check, the chain-head check, that the current tests do not enforce.

The survivors do not by themselves establish a security vulnerability. Each may be a missing assertion, an untested condition, an equivalent mutation, or a behaviour outside the intended invariant. The final classification is essential before drawing conclusions.

## 12. Analysis and Expected Findings

The study will investigate whether different classes of integrity properties exhibit different levels of test effectiveness.

Particular attention will be given to three areas.

**A. Cryptographic correctness**

Whether the tests detect changes to hashing, serialization and signature verification. The campaign's surviving mutants include conditions in key generation and optional signed fields, which are still to be classified.

**B. Authorization correctness**

Whether the tests detect weakened conditions that permit actions outside declared authority. The crypto campaign did not cover the authorization logic in the policy or approval packages, so this area is not yet addressed by Campaign B.

**C. Evidence correctness**

Whether the tests detect changes that undermine the integrity or independent verification of recorded execution evidence. The chain-head survivor in `CallerAuditChainVerifier.ts` is the first concrete result in this area.

**Status of the hypotheses in Section 5:**

- **H1** is partly supported. Campaign A's fix for an unchained-Execution case and the chain-head survivor in Campaign B both show that mutation testing exposed gaps that ordinary tests had missed.
- **H2** is not yet evaluated. The authorization-boundary mutants were covered in other packages, not in this campaign.
- **H3** is not tested. Campaign A's improvement from 65.4% to 85.0% was observed on a different configuration and mutant set, so it is not a controlled comparison. A controlled test requires re-running the same mutants after targeted fixes.
- **H4** is not yet evaluated.
- **H5** is not yet evaluated. Two campaigns have been run, but on different configurations and mutant counts.

The research will also investigate whether improvements to the test suite produce measurable reductions in meaningful surviving mutants. No improvement will be claimed until the post-intervention experiment is complete.

## 13. Limitations

Mutation testing has important limitations.

First, the generated mutations represent only a subset of possible implementation defects.

Second, surviving mutants do not necessarily indicate exploitable vulnerabilities.

Third, killed mutants do not establish that the underlying security property is universally satisfied.

Fourth, mutation scores can be distorted by equivalent mutants, mutation operator selection and test configuration. The 92.3% figure is affected by the first two: equivalent mutants are not yet removed, and the runtime configuration (Node version, skipped tests) changed between campaigns.

Fifth, the file-level results cover 84 of 101 survivors. Conclusions about the remaining 17 cannot be drawn yet.

Finally, a test suite can detect implementation deviations while the underlying specification itself remains incorrect.

The last limitation is particularly important for autonomous systems.

A system may correctly enforce an incomplete or incorrect authorization specification.

Mutation testing must therefore complement, rather than replace, specification review, formal verification, independent security review and adversarial testing.

## 14. Reproducibility and Research Artifacts

The final publication should include the following artifacts:

1. Baseline source revision.
2. Mutation engine configuration.
3. Selected source file inventory.
4. Generated mutation report.
5. Test execution logs.
6. Surviving mutant classifications.
7. Regression tests added.
8. Final mutation report.
9. Comparison of baseline and improved results.
10. Reproducible execution instructions.

The Campaign B reports are written by the run to `reports/mutation/crypto.html` and `crypto.json`. Those files are gitignored and are not part of the repository. Archiving them with the publication is still to be done.

These artifacts will allow independent researchers to inspect the experimental methodology and challenge its conclusions.

## 15. Research Contributions

This research aims to make four contributions.

**Contribution 1: Integrity-oriented mutation testing**

A methodology for evaluating whether software tests detect deliberate violations of cryptographic integrity properties.

**Contribution 2: Invariant-level assessment**

A measurement approach that evaluates critical integrity guarantees individually rather than relying exclusively on an aggregate mutation score.

**Contribution 3: Evidence-oriented validation**

An experimental framework for testing whether authorization and execution evidence remains verifiable under deliberate implementation changes.

**Contribution 4: Repeatable evaluation**

A methodology that can be repeated across software versions to assess changes in test effectiveness.

## 16. Conclusion

As autonomous systems become capable of executing increasingly consequential operations, establishing confidence in their integrity mechanisms becomes essential.

Conventional software testing establishes whether an implementation behaves as expected under selected scenarios.

Mutation testing adds another dimension: whether the tests can detect deliberate changes that violate the expected behaviour.

This study investigates that distinction through Parmana's cryptographic integrity infrastructure.

The central proposition is that trust cannot be established merely by demonstrating that tests pass. It requires evidence that the tests are capable of detecting meaningful violations of the guarantees they are designed to protect.

The crypto campaign shows this concretely. A 92.3% score still leaves 101 survivors, and at least one of them is in a check that protects chain integrity.

The research therefore treats mutation testing as an experimental method for evaluating test adequacy, not as a substitute for formal security proofs.

Ultimately, the objective is to move from testing whether autonomous systems work to measuring whether their critical integrity guarantees can withstand deliberate attempts to break them.

---

**Research affiliation:** Parmana Systems  
**Research status:** Crypto campaign complete; survivor classification in progress  
**Results status:** The crypto campaign of 14 November 2026 is complete (92.3% Stryker score, 1,215 of 1,316 caught, 101 survivors). Classification of survivors, equivalent-mutant removal, the remaining 17 survivors, and the invariant-level analysis are pending. No hypothesis in Section 5 is closed.

**Primary research repository:** Parmana Systems core implementation.

**Proposed next publication:** From Test Adequacy to Execution Assurance: Connecting Mutation Testing, Formal Specifications and Independently Verifiable Evidence.
