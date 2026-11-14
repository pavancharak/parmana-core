# Scenario definitions

`scenarios.json` is the machine-readable form of the 30 scenarios in [`../specification/threat-model.md`](../specification/threat-model.md). The two must agree. A test (`tests/assurance/poae/scenarios.test.ts`) checks that:

- there are exactly 30 scenarios with unique IDs T01 to T30;
- each status is in the vocabulary;
- each `implemented` scenario maps to a benchmark ID that appears in the runner;
- each `elsewhere` scenario names a file that exists;
- each `gap` or `partial` scenario names what blocks it.

Change the threat model and this file together.
