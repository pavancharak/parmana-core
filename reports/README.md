# Reports

This folder is the index for everything Parmana publishes about its own testing, evaluation and security. Start here if you want to see the evidence behind a claim.

## Test results

- **Live CI runs:** every push runs the full build, lint, typecheck and test suite. The results for each run are on the [CI workflow page](https://github.com/pavancharak/parmana-core/actions/workflows/ci.yml).
- **Mutation testing:** [how often the tests catch deliberate bugs in the security packages](../docs/MUTATION-TESTING.md).
- **Evaluation scenarios:** [the 16 attack scenarios and whether each was blocked](../EVALUATION.md), with the scenario data in [evaluations/scenarios.json](../evaluations/scenarios.json).

## Security

- **Threat model:** [what Parmana protects, from whom, and what stays exposed](../THREAT-MODEL.md).
- **Security challenge:** [what counts as breaking Parmana on a local copy](../SECURITY-CHALLENGE.md).
- **Verification gaps:** [a dated log of what was found missing or wrong, how severe it was, and when it was closed](../docs/VERIFICATION-GAPS.md).
- **Incidents and defects:** [security and release incidents and their resolutions](../04-INCIDENTS-LOG.md).
- **Technical claims:** [every claim, the code and tests that prove it, and the claims Parmana does not make](../docs/CLAIMS.md).
- **Reporting a vulnerability:** do not open a public issue. Follow [SECURITY.md](../SECURITY.md).

## Governance

- **Policy approval log:** [the hash-chained log of policy change approvals, and how to verify it](../governance/README.md).

## Reproduce the results yourself

On Node.js 24 or later, from a clone of the repository:

```bash
npm ci
npm run build
npm test
npm run evaluate
```

`npm run evaluate` runs the attack scenarios and reports whether each was blocked. Nothing needs credentials or network access.

## Adding a report

A new report goes in this folder with its date in the file name. It is added only after review, so that open findings are not published before they are fixed.
