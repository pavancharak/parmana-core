# Contributing to Parmana

Thank you for helping. Parmana decides whether an automated action may run, and records the evidence for that decision. Correctness, determinism and verifiable evidence come before convenience, so every change is reviewed carefully. This guide takes you from a fresh clone to an accepted pull request.

## Before you start

- For anything larger than a small fix, open an issue or a discussion first, so the design is agreed before the code is written. Questions and feedback belong in [GitHub Discussions](https://github.com/pavancharak/parmana-core/discussions) or in an issue.
- Report security issues privately, as described in [SECURITY.md](SECURITY.md). Do not open a public issue for them.
- Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- The project is licensed under the Apache License 2.0 ([LICENSE](LICENSE)).

## Set up

1. Install **Node.js 24**. On Node 22 the build passes but tests fail: the `distrustCompromisedRoots` tests expect Node's bundled root certificates, and the `re2` native module built for Node 22 does not load under Node 24. If you switch Node versions after `npm ci`, run `npm rebuild re2`.
2. Run `npm ci`. Its `prepare` step points Git at the hooks in `scripts/git-hooks`.
3. Install [gitleaks](https://github.com/gitleaks/gitleaks#installing) or Docker. The pre-commit hook scans staged files for secrets with one of them, and refuses the commit if neither is available. Do not skip it with `--no-verify` unless you have reviewed the staged files yourself.
4. For the database tests, start the local Postgres service and apply the migrations:

   ```bash
   docker compose up -d postgres
   docker compose run --rm migrate
   ```

   [docs/runbooks/LOCAL-DEVELOPMENT.md](docs/runbooks/LOCAL-DEVELOPMENT.md) describes the environment in full. The Supabase suites skip unless you have Supabase credentials.

5. Check the set-up with `npm run build` and `npm test`. The full suite takes several minutes.

## Finding work

- Issues labelled `good first issue` are the best place to start.
- Open work by area is listed in [docs/REMAINING-WORK.md](docs/REMAINING-WORK.md).
- Comment on the issue to say you are taking it, so two people do not work on the same change.

## Making a change

1. **Branch from an up-to-date `main`.** Name the branch for its purpose, for example `fix/policy-refusal-message`. Nothing is pushed to `main` directly.
2. **Add tests with the change.** A bug fix adds a test that fails without the fix. New behaviour gets tests, including the refusal paths.
3. **Run the full check.** The pre-commit hook runs gitleaks, typecheck, lint, format, every test, the build and the runnable examples. CI runs the same. If the hook reports stale build output, run `npm run build` and commit again.
4. **Commit with a sign-off and a GPG signature.** See [Commit requirements](#commit-requirements).
5. **Open a pull request** and fill in the template, which asks what changed and why.
6. **Review.** A second reviewer approves the pull request. Security-critical code gets an in-depth review; [docs/contributing/REVIEWING.md](docs/contributing/REVIEWING.md) is the reviewer's brief.

## Commit requirements

There are two separate requirements. Both are needed.

- **Sign-off (DCO).** Every commit carries a `Signed-off-by` line, certifying the [Developer Certificate of Origin](https://developercertificate.org). Add it with `git commit -s`.
- **GPG signature.** `main` accepts only signed commits. [docs/runbooks/SIGNING-COMMITS.md](docs/runbooks/SIGNING-COMMITS.md) explains how to set up a signing key.

A pull request whose commits lack either requirement is not merged until they are fixed.

## Records to update in the same pull request

- [docs/CLAIMS.md](docs/CLAIMS.md) when what Parmana can claim changes. A claim is written in the present tense only when code and tests back it.
- [docs/VERIFICATION-GAPS.md](docs/VERIFICATION-GAPS.md) when a gap is found or closed.
- [docs/REMAINING-WORK.md](docs/REMAINING-WORK.md) when open work changes.
- An ADR in [docs/adr/](docs/adr/) when an architectural decision is made or reversed.
- The published docs in [docs/site/](docs/site/) when behaviour a reader relies on changes, and the changelog ([docs/site/changelog.mdx](docs/site/changelog.mdx)).

## Principles a change must keep

- The policy decides. Nothing executes without an approved decision.
- Fail closed. Missing configuration, a failed check or an unavailable dependency refuses. It never degrades silently.
- Evidence is signed and append-only, and can be verified without trusting Parmana.
- Policy evaluation is deterministic.
- Text from requests, records, policies or connectors is shown as text. Do not assign it with `innerHTML`, `dangerouslySetInnerHTML`, `insertAdjacentHTML` or `document.write`. Use `textContent` or the framework's text binding. A test that renders a value containing markup should show it as literal text.

## Connectors

Read [docs/architecture/CONNECTOR_ISOLATION.md](docs/architecture/CONNECTOR_ISOLATION.md) and [docs/connectors/BUILDING_A_CONNECTOR.md](docs/connectors/BUILDING_A_CONNECTOR.md) before adding one. Every connector is registered through the standard path, so it gets credential isolation. A `legacyInsecure: true` registration outside a test is not acceptable.

## Maintainer guides

These cover work that most contributors will not need:

- [Python reference docs](docs/contributing/python-reference-docs.md)
- [Dependency updates](docs/contributing/dependency-updates.md)
- [TypeScript versions](docs/contributing/typescript-versions.md)
- [Fuzz and mutation testing](docs/contributing/fuzz-and-mutation-testing.md)
