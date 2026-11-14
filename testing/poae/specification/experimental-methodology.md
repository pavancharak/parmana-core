# Experimental methodology

**Status:** Phase 1 draft.

## Environment

For every reported run, record:

- source commit hash;
- Node version (the repository pins 24.22.2), and package versions from `package-lock.json`;
- operating system and hardware;
- policy and fixture versions;
- cryptographic algorithm configuration (Ed25519, ML-DSA where used);
- test seed where randomness is used;
- number of trials and the raw measurements.

## Procedure

1. Build from the recorded commit (`npm run build:packages`).
2. Run the scenario set on that build. Record the outcome of each scenario, including refusals and failures.
3. Repeat the run at least three times on the same commit, to measure variation. Report the spread.
4. Record any scenario that cannot run, and why, as "not run". Never report it as passed.

## Metrics

Each metric has its own denominator. A metric is not computed over a different set of cases to make it look better.

| Metric                                 | Denominator                                    |
| -------------------------------------- | ---------------------------------------------- |
| Unauthorized execution acceptance rate | Unauthorized attempts                          |
| False authorization rejection rate     | Authorized attempts                            |
| Mutation detection rate                | Evidence mutations applied                     |
| Evidence completeness detection rate   | Removed or truncated ledgers applied           |
| Replay rejection rate                  | Replay attempts                                |
| Revocation propagation latency         | Revocation events                              |
| Verification latency                   | Verification calls                             |
| Execution overhead                     | Executions measured with and without the layer |

Latency is reported as median and tail percentiles (p95, p99), not only as a mean. Repeated runs give the uncertainty.

## Baselines

The same scenarios and conditions run against:

- **Baseline A:** application-level authorization and logs;
- **Baseline B:** authorization with signed execution records, without correspondence or completeness checks;
- **Baseline C:** the PoAE architecture.

A baseline is implemented before any comparison is reported. A comparison against an unimplemented baseline is not reported.

## Rules

- A missing evidence record is never counted as a passed verification because the remaining chain is valid.
- A failed gate is investigated, and the criterion is not relaxed to pass it.
- Failures and limitations are reported alongside successes.
- Results from the existing runner (`tests/assurance/poae/`) are not reused as PoAE results until they are re-run under this methodology.
