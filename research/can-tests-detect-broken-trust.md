# Can Tests Detect Broken Trust?
## Evaluating Cryptographic Integrity Guarantees Through Mutation Testing in Autonomous Systems

**Research Publication — Parmana Systems**

**Research Area:** Cryptographic Integrity, Software Verification, Autonomous Systems, Deterministic Governance

**Research Status:** Experimental study in progress  
**Version:** Research Draft 0.1  
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

| Hypothesis | Expected observation |
|---|---|
| H1 | Deliberate mutations to critical cryptographic operations will expose test-suite weaknesses. |
| H2 | Mutations involving authorization boundaries and fail-closed behaviour will reveal important gaps in security assertions. |
| H3 | Surviving meaningful mutants will decrease after targeted test improvements. |
| H4 | Independent verification tests will detect evidence-tampering mutations that ordinary execution tests may miss. |
| H5 | Repeated mutation testing will provide a measurable basis for comparing test effectiveness across releases. |

These hypotheses will be evaluated against experimental results. They are not assumed to be true in advance.

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

| Property | Required guarantee |
|---|---|
| Serialization integrity | Equivalent structured inputs produce the required canonical representation. |
| Hash integrity | Hashes correspond to the intended canonical bytes. |
| Signature integrity | Invalid signatures are rejected. |
| Trust integrity | Untrusted signing keys are not accepted. |
| Authorization integrity | Actions outside declared authority are rejected. |
| Expiry integrity | Expired authorization material is rejected. |
| Chain integrity | Invalid predecessor hashes are detected. |
| Failure integrity | Verification failures cannot silently authorize execution. |

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

| ID | Mutation scenario | Expected behaviour |
|---|---|---|
| M01 | Change SHA-256 input | Integrity verification detects mismatch. |
| M02 | Remove canonicalization | Canonical representation tests fail. |
| M03 | Alter canonical JSON output | Verification detects inconsistent representation. |
| M04 | Bypass signature verification | Invalid signatures are rejected by tests. |
| M05 | Accept an untrusted key | Trust validation fails. |
| M06 | Remove expiry validation | Expired authorization is rejected. |
| M07 | Weaken authorization comparison | Out-of-scope action is rejected. |
| M08 | Ignore predecessor hash | Broken evidence chain is rejected. |
| M09 | Modify a previously recorded entry | Evidence verification detects tampering. |
| M10 | Change verification failure to acceptance | Fail-closed tests fail. |
| M11 | Remove a required policy condition | Policy integrity tests fail. |
| M12 | Change signature verification result handling | Invalid verification outcomes cannot authorize execution. |

These are semantic test scenarios. The actual generated mutants and their source locations must be recorded separately. A mutation operator does not necessarily generate every scenario in this table.

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

### 10.2 Secondary metrics

| Metric | Purpose |
|---|---|
| Mutant kill rate | Measures detected mutations. |
| Survival rate | Identifies mutations not detected by tests. |
| Equivalent mutant rate | Measures non-meaningful generated mutations. |
| Timeout rate | Identifies inconclusive executions. |
| Critical invariant coverage | Measures whether each defined integrity property has corresponding tests. |
| Regression effectiveness | Measures whether previously surviving mutants are now detected. |
| Reproducibility | Measures whether repeated experiments produce consistent outcomes. |

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

## 11. Preliminary Experimental Results

### 11.1 Initial execution

The first crypto mutation campaign was initiated on 14 November 2026.

Execution command:

`npm run mutation -- crypto`

The command invokes the package build and the TypeScript mutation runner.

The build process uses TypeScript project compilation and package distribution stamping before mutation execution.

### 11.2 Recorded execution snapshot

| Measurement | Observed value |
|---|---:|
| Source files in reported repository scope | 6,215 |
| Files selected by mutation engine | 51 |
| Generated mutants | 1,316 |
| Mutants tested at checkpoint | 315 |
| Surviving mutants at checkpoint | 62 |
| Timeouts at checkpoint | 0 |
| Mutation runners | 4 |
| Reported execution progress | 23% |

These are preliminary execution figures, not final experimental results.

The 23% figure represents reported execution progress and must not be interpreted as the mutation score.

The final number of killed, surviving, equivalent and inconclusive mutants remains to be established.

### 11.3 Interpretation

The initial campaign demonstrates that the mutation-testing infrastructure is operating against a selected portion of the cryptographic codebase.

The 62 surviving mutants at the recorded checkpoint require individual investigation.

Their survival does not automatically establish a security vulnerability.

It may indicate:

- Missing assertions.
- Untested conditions.
- Equivalent mutations.
- Behavioural differences not observed by the current test suite.

The final classification is essential before drawing conclusions.

## 12. Analysis and Expected Findings

The study will investigate whether different classes of integrity properties exhibit different levels of test effectiveness.

Particular attention will be given to three areas.

**A. Cryptographic correctness**

Whether the tests detect changes to hashing, serialization and signature verification.

**B. Authorization correctness**

Whether the tests detect weakened conditions that permit actions outside declared authority.

**C. Evidence correctness**

Whether the tests detect changes that undermine the integrity or independent verification of recorded execution evidence.

The research will also investigate whether improvements to the test suite produce measurable reductions in meaningful surviving mutants.

No improvement will be claimed until the post-intervention experiment is complete.

## 13. Limitations

Mutation testing has important limitations.

First, the generated mutations represent only a subset of possible implementation defects.

Second, surviving mutants do not necessarily indicate exploitable vulnerabilities.

Third, killed mutants do not establish that the underlying security property is universally satisfied.

Fourth, mutation scores can be distorted by equivalent mutants, mutation operator selection and test configuration.

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

The research therefore treats mutation testing as an experimental method for evaluating test adequacy, not as a substitute for formal security proofs.

Ultimately, the objective is to move from testing whether autonomous systems work to measuring whether their critical integrity guarantees can withstand deliberate attempts to break them.

---

**Research affiliation:** Parmana Systems  
**Research status:** Experimental validation in progress  
**Results status:** Preliminary. Final quantitative conclusions pending completion and classification of the mutation campaign.

**Primary research repository:** Parmana Systems core implementation.

**Proposed next publication:** From Test Adequacy to Execution Assurance: Connecting Mutation Testing, Formal Specifications and Independently Verifiable Evidence.
