# Contributing to Parmana

## External contributions

This repository is proprietary and source-available for evaluation only (see
[LICENSE](LICENSE)). Pull requests from outside Parmana Systems are not accepted without a
prior written contributor agreement, and will be closed. Questions, feedback and bug reports
are welcome in [GitHub Discussions](https://github.com/pavancharak/parmana/discussions), by email
at [founder@parmanasystems.com](mailto:founder@parmanasystems.com) or as a GitHub issue. Report security issues privately, as described in [SECURITY.md](SECURITY.md).
Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

The rest of this file is the process for people working on Parmana under such an agreement.
A second reviewer approves pull requests and reviews the security-critical code once in depth;
[docs/REVIEWING.md](docs/REVIEWING.md) is their brief.

Parmana authorizes and evidences what automated systems do, so correctness, determinism and
verifiable evidence come before convenience.

## How a change is made

1. **Its own branch from `main`**, and a pull request. Nothing is pushed to `main` directly.
2. **Tests with the change.** A bug fix adds a test that fails without it; new behavior adds
   tests for it, including the refusal paths.
3. **The full check passes.** The pre commit hook runs gitleaks, typecheck, lint, format, every
   test, the build and the runnable examples; CI runs the same. If it reports stale build
   output, run `npm run build` and commit again.
4. **The records are updated in the same pull request**:
   - [docs/CLAIMS.md](docs/CLAIMS.md) when what Parmana can claim changes. A claim is written
     in the present tense only when code and tests back it.
   - [docs/VERIFICATION-GAPS.md](docs/VERIFICATION-GAPS.md) when a gap is found or closed.
   - [docs/REMAINING-WORK.md](docs/REMAINING-WORK.md) when open work changes.
   - An ADR in [docs/adr/](docs/adr/) when an architectural decision is made or reversed.
   - The published docs in [docs/site/](docs/site/) when behavior a reader relies on changes,
     and the changelog (`docs/site/changelog.mdx`).

## Dependency updates

Dependabot opens grouped pull requests every week for npm, Python, the Dockerfile and GitHub
Actions (`.github/dependabot.yml`). Treat each one as a change like any other:

- **Merge only when every check is green and the diff matches the title.** A minor and patch
  group must not change a major version (INC-12 in `04-INCIDENTS-LOG.md`).
- **Major versions are upgraded by hand.** Dependabot ignores majors of `typescript`, `vitest`,
  `@vitest/*`, `express` and `@types/node`. Upgrade one at a time, in every workspace at once,
  in its own pull request with the full check passing.
- **`python/requirements-dev.txt` is generated, never edited.** It is the hash-pinned install
  set CI uses. After changing `python/pyproject.toml`, or to pick up new versions, regenerate it
  with the command in its header (add `--upgrade` for new versions). Dependabot ignores
  `docspec` and `docstring-parser`, which `pydoc-markdown` pins.
- **`package-lock.json` is regenerated with `npm install`,** including when resolving a merge
  conflict in it.

## TypeScript versions

Two TypeScript versions are installed, each for what it can do
([ADR-0015](docs/adr/ADR-0015-TypeScript-7-Compiler-With-TypeScript-6-For-Tools.md)):

| Package                             | Version | Used for                                                            |
| ----------------------------------- | ------- | ------------------------------------------------------------------- |
| `typescript7` (`npm:typescript@^7`) | 7       | Every build and typecheck: the npm scripts, CI, Docker and Vercel   |
| `typescript`                        | 6       | Tools that need the compiler API: ESLint, TypeDoc, two repo scripts |

- Build and typecheck with the npm scripts: `npm run build`, `npm run typecheck`. They call
  TypeScript 7 (`node node_modules/typescript7/bin/tsc`).
- A bare `tsc` or `npx tsc` runs TypeScript 6. The code compiles under both, but CI checks with 7,
  so 7 is the one that must pass.
- Code that imports the compiler API keeps `import ts from "typescript"`. TypeScript 7 has no
  such API.
- TypeScript majors are upgraded by hand; Dependabot ignores them. ADR-0015 lists the steps to
  finish the move to 7 once `typescript-eslint` and `typedoc` support it.

## Fuzz tests

Files named `*.fuzz.test.ts`, and `request-fuzz.integration.test.ts` in `packages/api`, use
[fast-check](https://fast-check.dev) to send damaged and arbitrary input to the request boundary,
policy loading and evaluation, the offline verifier and approval parsing. They run with every
`npm test`. A failure prints a minimal counterexample; add it as an exact test next to the fix.

## Mutation testing

`npm run mutation -- <package>` runs [Stryker](https://stryker-mutator.io) on one or more
packages, for example `npm run mutation -- envelope-verifier approval`. Run `npm run build`
first, on Node 24 (the command refuses an older Node: there the ML-DSA-65 tests skip themselves
and the crypto score would be wrong). Stryker makes small deliberate changes to the package's `src` (a `<=` turned into `<`, a
condition forced to `true`, a call removed), one at a time, and runs that package's tests against
each. The mutation score is the share of those changes the tests catch: it says more about the
tests than a test count or line coverage does.

The command prints a score per package and writes `reports/mutation/<package>.html` and `.json`
(not committed). Open the HTML report to see each change the tests missed. It is slow, because
every change runs the package's whole test suite, so it is not part of `npm test` or CI.

[docs/MUTATION-TESTING.md](docs/MUTATION-TESTING.md) has the scores for the five
security-critical packages, what the surviving changes showed, and what was done about them.
`stryker.config.mjs` explains why the command runner is used rather than Stryker's Vitest plugin.

## Principles a change must keep

- The policy decides; nothing executes without an approved decision.
- Fail closed: missing configuration, a failed check or an unavailable dependency refuses,
  never degrades silently.
- Evidence is signed and append only, and can be verified without trusting Parmana.
- Policy evaluation is deterministic.

## Connectors

Read [docs/architecture/CONNECTOR_ISOLATION.md](docs/architecture/CONNECTOR_ISOLATION.md) and
[docs/connectors/BUILDING_A_CONNECTOR.md](docs/connectors/BUILDING_A_CONNECTOR.md) before
adding one. Every connector is registered through the standard path so it gets credential
isolation; a `legacyInsecure: true` registration outside a test is not acceptable.

## Security issues

Report them privately, as described in [SECURITY.md](SECURITY.md), not in a public issue.
