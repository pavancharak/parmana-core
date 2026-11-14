# Proof of Authorized Execution (PoAE)

**Status:** Phase 1 (research specification) in review. No benchmark result here is final.
**Owner:** Pavan Charak.

## Why this exists

Autonomous systems act on behalf of a business. Today we usually know what they did only from their own logs, their credentials, or the word of the team that runs them. If that infrastructure is compromised, those sources can be wrong or missing, and nobody outside can tell.

PoAE asks one question: can an organization show, independently, that an autonomous action stayed within the authority the business declared, even when parts of its infrastructure are compromised?

This folder is where that question is researched in this repository. It sits next to Parmana's assurance testing, which tests the product. PoAE tests the claim the product makes: that authority is enforced and that the evidence can be checked by someone who does not trust the operator.

## What we will do

We will work through eight phases. Each phase ends at a gate, and the next phase starts only after the gate is passed.

| Phase | Work                                                                         | Output                                                  |
| ----- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1     | Specify the research: questions, hypotheses, properties, threats, invariants | [`specification/`](specification/README.md) (in review) |
| 2     | Document and prepare the 30 adversarial scenarios                            | Scenario definitions and fixtures                       |
| 3     | Implement the scenarios against the existing Parmana interfaces              | Benchmark results, with failures reported               |
| 4     | Model the protocol formally and check its invariants                         | Formal model and counterexamples                        |
| 5     | Test compromised keys, stores and recovery                                   | Resilience results                                      |
| 6     | Study zero-knowledge proofs (may be deferred)                                | Feasibility report                                      |
| 7     | Reproduce the results in a clean environment                                 | Reproduction package                                    |
| 8     | Write the paper, with every claim traced to evidence                         | Paper draft                                             |

The full plan, with gates and dependencies, is in [`specification/research-roadmap.md`](specification/research-roadmap.md).

**What we will not claim.** PoAE will not show that a real-world event happened. It will show what was recorded, signed and checked. Each claim will say which assumption it depends on, and which of these it does not establish: integrity, authenticity, authority, execution, or completeness.

## How we will do it

1. **Build on what exists.** The gateway, the signed trust record, the offline verifier and the reconciliation function are already in the repository. We wrap them. We do not change the frozen cryptographic core ([`docs/assurance/FROZEN_CORE.md`](../../docs/assurance/FROZEN_CORE.md)) to make the research work.
2. **Write the claims down first.** Each hypothesis states the result that would falsify it. A result that cannot falsify a claim is not a result.
3. **Report failures.** A scenario that fails, or cannot run, is reported as such. It is never counted as passed to improve a number.
4. **Measure reproducibly.** Each result records the commit, the environment, the number of trials and the raw data. Latency is reported as percentiles, with uncertainty.
5. **Compare against baselines.** A claim that PoAE adds something is tested against an ordinary application-level baseline and a signed-log baseline.
6. **Keep the coverage honest.** [`docs/assurance/COVERAGE_REGISTER.md`](../../docs/assurance/COVERAGE_REGISTER.md) says what is and is not covered. The research uses the same register.

## Where things are

| Path                                                         | Contents                                          |
| ------------------------------------------------------------ | ------------------------------------------------- |
| [`specification/`](specification/README.md)                  | Phase 1 research specification                    |
| [`benchmark-spec.md`](benchmark-spec.md)                     | The 20-test subset currently run, with results    |
| [`../../tests/assurance/poae/`](../../tests/assurance/poae/) | The runner that executes the implemented tests    |
| [`../../docs/assurance/`](../../docs/assurance/)             | Coverage, open items, decisions, frozen-core rule |

## Current status

- 18 of the 30 scenarios are implemented and pass. Two more are covered by existing tests, one is a known gap, one is partly covered, and eight are not yet implemented.
- Open decisions that block later phases are listed in [`docs/assurance/OPEN_ITEMS.md`](../../docs/assurance/OPEN_ITEMS.md).
- The research will move to a separate repository (`parmana-poae-benchmark`) only if the owner approves it. This folder is the home until then.

## Next step

Gate G1: the owner reviews the Phase 1 specification. The four review questions are at the end of [`specification/research-roadmap.md`](specification/research-roadmap.md). Phase 2 does not start until G1 is passed.
