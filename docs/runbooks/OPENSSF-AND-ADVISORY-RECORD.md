# OpenSSF, licensing and dependency advisory record

Status as of 2026-10-24. This records what was changed in the 2026-10-24
work, what each OpenSSF Best Practices answer rests on, what is still open,
and why. It replaces nothing; `docs/CURRENT-STATE.md` remains the reference
for what is built.

## 1. Licence

- The repository is licensed under the Apache License 2.0 (`LICENSE`,
  `NOTICE`). Previously it was proprietary and evaluation-only.
  Merged in [#69](https://github.com/pavancharak/parmana-core/pull/69).
- Public and internal documentation that described the old licence was
  updated in [#70](https://github.com/pavancharak/parmana-core/pull/70).
- Not changed, and still to decide by the owner:
  - The contributor-agreement rule in `CONTRIBUTING.md` (pull requests from
    outside are not accepted without a prior written agreement).
  - The collaborator-agreement rule in `docs/REVIEWING.md`.
  - The `"license": "SEE LICENSE IN LICENSE"` field in package manifests.
    It resolves to Apache 2.0 but could name `Apache-2.0` explicitly.

## 2. OpenSSF Scorecard and CI

- Scorecard, CodeQL and dependency-review workflows were added in
  [#71](https://github.com/pavancharak/parmana-core/pull/71). They were
  copied unchanged from the `parmana` repository, which already runs them.
- Scorecard publishes a score for `parmana-core` (7 at 2026-10-24, checked
  through the Scorecard API). Before this change the API returned 404.
- Lowest Scorecard checks at the time: Code-Review 0, Maintained 0,
  CII-Best-Practices 0, Branch-Protection 3, Vulnerabilities 3, SAST 7.
  Branch protection needs a repository setting; code review and
  maintenance need people.
- README badges for CI and Scorecard point at `parmana-core`
  ([#72](https://github.com/pavancharak/parmana-core/pull/72)).
- The Best Practices badge still points at project 15230, which belongs to
  the `parmana` registration. The `parmana-core` registration is project
  15846 as shown on its registration page; the badge is not yet updated.

## 3. OpenSSF Best Practices answers (`parmana-core`, project 15846)

Answers were chosen from evidence in the repository. The justification text
for each is in the registration form.

| Area                    | Criterion                                                     | Answer              | Evidence                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Basics                  | description_good, interact                                    | Met                 | `README.md`, `CONTRIBUTING.md`, Issues                                                                                                          |
| Basics                  | contribution, contribution_requirements                       | Met                 | `CONTRIBUTING.md` (tests, full check)                                                                                                           |
| Basics                  | floss_license, floss_license_osi                              | Met                 | `LICENSE` (Apache 2.0)                                                                                                                          |
| Basics                  | english                                                       | Met                 | Documentation and Issues in English                                                                                                             |
| Basics                  | maintained                                                    | Owner's judgement   | Recent commits; Scorecard Maintained is 0                                                                                                       |
| Basics                  | repo_interim                                                  | Met                 | Merged pull requests between releases                                                                                                           |
| Change control          | version_unique, version_semver, version_tags                  | Met                 | Tags `server-v1.0.1`, `sdk-v1.6.1`                                                                                                              |
| Change control          | release_notes                                                 | Met                 | Release notes on GitHub Releases                                                                                                                |
| Change control          | release_notes_vulns                                           | N/A                 | Web search on 2026-10-24 found no CVE for the eMudhra certificate issue fixed in `server-v1.0.1`. The search does not prove that no CVE exists. |
| Reporting               | report_tracker, report_archive                                | Met                 | Public Issues                                                                                                                                   |
| Reporting               | report_responses, enhancement_responses                       | Open                | No issues or enhancement requests yet                                                                                                           |
| Vulnerability reporting | vulnerability_report_process, vulnerability_report_private    | Met                 | `SECURITY.md`; private vulnerability reporting enabled                                                                                          |
| Vulnerability reporting | vulnerability_report_response                                 | N/A                 | No reports in the last 6 months                                                                                                                 |
| Quality                 | build, build_common_tools, build_floss_tools                  | Met                 | `package.json`, `Dockerfile`                                                                                                                    |
| Quality                 | test, test_invocation, test_most, test_continuous_integration | Met                 | `npm test`; coverage 82.6% branches, 87.4% statements; `ci.yml`                                                                                 |
| Quality                 | test_policy, tests_are_added, tests_documented_added          | Met                 | `CONTRIBUTING.md`; PR #59 added tests                                                                                                           |
| Quality                 | warnings, warnings_fixed, warnings_strict                     | Met                 | ESLint (0 warnings); TypeScript `strict`                                                                                                        |
| Security                | crypto_published, crypto_call, crypto_floss                   | Met                 | Node `node:crypto` provider; Ed25519, ML-DSA-65                                                                                                 |
| Security                | crypto_keylength, crypto_weaknesses, crypto_working           | Met                 | `CryptoAlgorithms.ts`; no broken algorithms found in source                                                                                     |
| Security                | crypto_pfs                                                    | N/A                 | No key agreement in the project's own code                                                                                                      |
| Security                | crypto_password_storage                                       | N/A                 | Callers use API keys, stored as SHA-256 hashes                                                                                                  |
| Security                | crypto_random                                                 | Met                 | `node:crypto` random sources                                                                                                                    |
| Security                | delivery_unsigned                                             | Met                 | Downloads over HTTPS only                                                                                                                       |
| Security                | vulnerabilities_fixed_60_days                                 | Open                | See section 4                                                                                                                                   |
| Security                | know_secure_design, know_common_errors                        | Owner's attestation | `THREAT-MODEL.md`                                                                                                                               |

## 3a. Node.js and the eMudhra certificate issue

- The official Node.js security release of 2026-10-21 lists
  "ca-cert (eMudhra Intermediate CA Compromise)" as a dependency update on
  the 22.x, 24.x and 26.x lines
  (https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).
- The 24.22.1 changelog records "update root certificates to NSS 3.131.1"
  (https://github.com/nodejs/node/blob/v24.22.1/doc/changelogs/CHANGELOG_V24.md).
- Neither official source says which roots are removed. The downloaded
  24.22.1 binary still bundles `emSign Root CA - G1`, which the server
  removes at startup (`packages/api/src/bootstrap/distrustCompromisedRoots.ts`).
- Unresolved: whether the bundled root store of the official binaries no
  longer contains the other three listed roots. Check the binary, not
  secondary reports.

## 4. Dependency advisories

Source: `npm audit` on the lockfile, 2026-10-24.

- Fixed in [#73](https://github.com/pavancharak/parmana-core/pull/73) with
  `npm audit fix` (no `--force`): three moderate advisories and the high
  `body-parser` advisory GHSA-27r3-jxmh-p828.
- Still open, five high:
  - `zod` (GHSA-mrhx-c7xc-m3w5): affects versions below 4.6.6. Pinned to
    4.1.11 by `@vercel/cli-config`. Forcing a newer version with an npm
    override produced an invalid tree and was reverted. The fix needs a
    Vercel release that depends on a fixed zod.
  - `@vercel/cli-config`, `@vercel/connect`, `@vercel/oidc`,
    `@vercel/oidc-aws-credentials-provider`: npm reports no affected version
    range, and its suggested fix is a downgrade, so the match is probably
    unreliable. Updating within the current majors did not change the audit.
- `@vercel/connect` and `@vercel/oidc-aws-credentials-provider` are runtime
  dependencies of `packages/api`; `@vercel/oidc-aws-credentials-provider` is
  also a runtime dependency of `packages/crypto`.
- A web search on 2026-10-24 did not find GHSA-mrhx-c7xc-m3w5, so its
  publication date is still unknown.
- Publication dates of these advisories could not be read from the
  environment used for this record, so the 60-day criterion cannot be
  answered from here. To settle it, check each advisory's published date on
  GitHub's advisory database. If any is older than 60 days and unpatched,
  the answer is "Unmet" until a fixed version is in use.

## 5. Git history

- The two internal working notes `examples/razorpay-agent-studio/CONTEXT.md`
  and `PROGRESS.md` were removed from the tree in
  [#67](https://github.com/pavancharak/parmana-core/pull/67). They still
  exist in earlier commits of `main`.
- A copy of `main` with those files removed from every commit was prepared
  with `git filter-repo`. Pushing it was refused by the permission system,
  so `main` still has the old history. Other branches also still contain the
  files.
- Rewriting `main` changes every commit hash and breaks existing links to
  commits. It needs an explicit decision by the owner.

## 6. Open items

1. Advisory dates for section 4, then the answer to `vulnerabilities_fixed_60_days`.
2. `release_notes_vulns`: closed as N/A on the web search above. The owner should confirm on the eMudhra disclosure or a CVE database before relying on it.
3. `report_responses` and `enhancement_responses`: answer after the first reports and requests have been handled.
4. Best Practices badge: the URL `bestpractices.dev/projects/15846` redirects (HTTP 302), so the project exists. The owner should confirm it is `parmana-core` before the badge is changed.
5. Contributor-agreement and collaborator-agreement rules.
6. History rewrite for the deleted notes (section 5).
7. Branch protection on `main` (Scorecard Branch-Protection).

## 7. Code-scanning alert disposition

Status as of 2026-10-24, after PRs #75, #76, #78 and #79. The alert numbers
are those shown on the repository's Code scanning page for `main`.

### Closed by code changes

| Alert    | Finding                                                          | Closed by                                                                                                                             |
| -------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| #11, #12 | Incomplete string escaping in the Python SDK reference generator | [#76](https://github.com/pavancharak/parmana-core/pull/76) (escaper moved to `scripts/python-sdk-reference/escapeMdx.ts`, with tests) |
| #13      | Regular expression injection in policy patterns                  | [#79](https://github.com/pavancharak/parmana-core/pull/79) (policy patterns evaluated with RE2, which runs in linear time)            |
| #15      | Missing CSRF middleware in the governance UI                     | [#78](https://github.com/pavancharak/parmana-core/pull/78) (csrf-csrf token on every state-changing form; CodeQL recognises it)       |

### Dismissed on GitHub (owner action, reasons below)

| Alert  | Finding                                                                 | Dismissal reason to paste                                                                                                                          |
| ------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| #10    | Weak hash in `python/tests/test_live_server_integration.py`             | False positive. The test fixture hashes a random 256-bit API key, not a password. It must match the production hash.                               |
| #16    | Password hash in `packages/api/src/auth/hashApiKey.ts`                  | False positive. Hashes a random 256-bit API key, not a password. A fast hash is appropriate for high-entropy keys.                                 |
| #17    | Password hash in `scripts/generate-fly-secrets.mjs`                     | False positive. Hashes a random 256-bit API key, not a password. The same hash as production.                                                      |
| #14    | Missing rate limiting in `examples/04-verified-execution/run.ts`        | Won't fix. Example code only (`examples/`), not production.                                                                                        |
| #2, #3 | Pinned dependencies: SLSA generator reusable workflows at `v2.1.0`      | Won't fix. The SLSA generator must be referenced by version tag; provenance is verified by tag. Pinning to a commit hash would break verification. |
| #4     | Pinned dependencies: `npm install --package-lock-only` in `release.yml` | Won't fix for now. The SBOM step resolves dependencies at release time. Pinning needs a release dry run, tracked as an open item below.            |

### Repository settings

| Alert | Finding           | Status                                                                                                                                                                                                                                   |
| ----- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1    | Branch-Protection | Ruleset `main-protection` created and active on `main`: pull request required, status checks `build-and-test` and `verify-policy-approvals`, force pushes and deletions blocked, 0 required approvals. Closes on the next Scorecard run. |

### Needs work that is not a setting

| Alert | Finding            | What is needed                                                                                                                                                                                                    |
| ----- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #5    | SAST               | CodeQL already runs on pull requests and pushes. Scorecard should update on its next run.                                                                                                                         |
| #6    | Vulnerabilities    | Open advisories in `@vercel/connect`, `@vercel/oidc-aws-credentials-provider`, `@vercel/cli-config`, `@vercel/oidc` and `zod`. The `zod` fix needs a Vercel release that depends on a fixed `zod`. See section 4. |
| #7    | Code-Review        | A second person who reviews pull requests. Require one approval on `main-protection` once there is one.                                                                                                           |
| #8    | Maintained         | Commits in the last 90 days exist. Should update on the next Scorecard run.                                                                                                                                       |
| #9    | CII-Best-Practices | Register `parmana-core` at bestpractices.dev (project 15846 is shown on its registration page) and complete the criteria. Section 3 lists the answers.                                                            |

## 8. Open items, with owners

1. **Dismiss the alerts in section 7** using the reasons above. Owner: repository admin.
2. **Verify the ruleset** `main-protection` shows as enforced on the rules page. Owner: repository admin.
3. **Advisory dates** for section 4. Owner: security reviewer.
4. **Upstream Vercel release** that fixes `zod` and the `@vercel/*` packages. Owner: whoever maintains the deployment tooling.
5. **Docker build** with `re2` in the slim runtime stage (PR #79). Owner: whoever builds the release image.
6. **Release dry run** to pin the `npm install` in `release.yml` (alert #4). Owner: release maintainer.
7. **Second reviewer** for pull requests, then require one approval on `main-protection` (alert #7).
8. **Best Practices registration** for `parmana-core` (alert #9). Owner: project owner.
9. **Git history rewrite** to remove the deleted working notes (section 5). Owner: project owner, with a decision on rewriting `main`.
10. **Agreement rules** in `CONTRIBUTING.md` and `docs/REVIEWING.md`. Owner: project owner.

## 9. Alert status after the Scorecard run of 2026-10-24 06:30 UTC

Scorecard score: 7.7 (from 7.6 before PR #81 merged).

| Check              | Score     | Alert | Decision                                                                                                                     |
| ------------------ | --------- | ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| Branch-Protection  | 5 (was 3) | #1    | Keep open to reach 10 with a second reviewer. Or dismiss as "Won't fix": single maintainer; releases are tags, not branches. |
| SAST               | 9         | #5    | Expected to close on the next run. Nothing to do.                                                                            |
| Vulnerabilities    | 9         | #6    | Keep open. Open advisories in `@vercel/*` and `zod` need upstream fixes (section 4).                                         |
| Code-Review        | 0         | #7    | Keep open. Needs a second reviewer on pull requests.                                                                         |
| Maintained         | 0         | #8    | Keep open. Cause not confirmed; check before relying on it.                                                                  |
| CII-Best-Practices | 2         | #9    | Keep open. Finish the criteria for project 15846.                                                                            |

Rules we follow:

- Dismiss only what the project has decided to accept, with the reason written in the alert.
- Keep open anything that describes a real gap until it is closed. Dismissing hides the gap but does not change the score.
- Review this table after each Scorecard run.
