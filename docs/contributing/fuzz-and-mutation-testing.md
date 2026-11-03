# Fuzz and mutation testing

## Fuzz tests

Files named `*.fuzz.test.ts`, and `request-fuzz.integration.test.ts` in `packages/api`, use [fast-check](https://fast-check.dev) to send damaged and arbitrary input to the request boundary, policy loading and evaluation, the offline verifier and approval parsing. They run with every `npm test`. A failure prints a minimal counterexample; add it as an exact test next to the fix.

## Mutation testing

`npm run mutation -- <package>` runs [Stryker](https://stryker-mutator.io) on one or more packages, for example `npm run mutation -- envelope-verifier approval`. Run `npm run build` first, on Node 24. The command refuses an older Node: there the ML-DSA-65 tests skip themselves and the crypto score would be wrong.

Stryker makes small deliberate changes to the package's `src` (a `<=` turned into `<`, a condition forced to `true`, a call removed), one at a time, and runs that package's tests against each. The mutation score is the share of those changes the tests catch. It says more about the tests than a test count or line coverage does.

The command prints a score per package and writes `reports/mutation/<package>.html` and `.json`. Those reports are not committed. Open the HTML report to see each change the tests missed. The run is slow, because every change runs the package's whole test suite, so it is not part of `npm test` or CI.

[docs/MUTATION-TESTING.md](../MUTATION-TESTING.md) has the scores for the five security-critical packages, what the surviving changes showed, and what was done about them. `stryker.config.mjs` explains why the command runner is used rather than Stryker's Vitest plugin.
