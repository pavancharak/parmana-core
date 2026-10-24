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

| Area                    | Criterion                                                     | Answer              | Evidence                                                                           |
| ----------------------- | ------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| Basics                  | description_good, interact                                    | Met                 | `README.md`, `CONTRIBUTING.md`, Issues                                             |
| Basics                  | contribution, contribution_requirements                       | Met                 | `CONTRIBUTING.md` (tests, full check)                                              |
| Basics                  | floss_license, floss_license_osi                              | Met                 | `LICENSE` (Apache 2.0)                                                             |
| Basics                  | english                                                       | Met                 | Documentation and Issues in English                                                |
| Basics                  | maintained                                                    | Owner's judgement   | Recent commits; Scorecard Maintained is 0                                          |
| Basics                  | repo_interim                                                  | Met                 | Merged pull requests between releases                                              |
| Change control          | version_unique, version_semver, version_tags                  | Met                 | Tags `server-v1.0.1`, `sdk-v1.6.1`                                                 |
| Change control          | release_notes                                                 | Met                 | Release notes on GitHub Releases                                                   |
| Change control          | release_notes_vulns                                           | Open                | Depends on whether a CVE exists for the certificate issue fixed in `server-v1.0.1` |
| Reporting               | report_tracker, report_archive                                | Met                 | Public Issues                                                                      |
| Reporting               | report_responses, enhancement_responses                       | Open                | No issues or enhancement requests yet                                              |
| Vulnerability reporting | vulnerability_report_process, vulnerability_report_private    | Met                 | `SECURITY.md`; private vulnerability reporting enabled                             |
| Vulnerability reporting | vulnerability_report_response                                 | N/A                 | No reports in the last 6 months                                                    |
| Quality                 | build, build_common_tools, build_floss_tools                  | Met                 | `package.json`, `Dockerfile`                                                       |
| Quality                 | test, test_invocation, test_most, test_continuous_integration | Met                 | `npm test`; coverage 82.6% branches, 87.4% statements; `ci.yml`                    |
| Quality                 | test_policy, tests_are_added, tests_documented_added          | Met                 | `CONTRIBUTING.md`; PR #59 added tests                                              |
| Quality                 | warnings, warnings_fixed, warnings_strict                     | Met                 | ESLint (0 warnings); TypeScript `strict`                                           |
| Security                | crypto_published, crypto_call, crypto_floss                   | Met                 | Node `node:crypto` provider; Ed25519, ML-DSA-65                                    |
| Security                | crypto_keylength, crypto_weaknesses, crypto_working           | Met                 | `CryptoAlgorithms.ts`; no broken algorithms found in source                        |
| Security                | crypto_pfs                                                    | N/A                 | No key agreement in the project's own code                                         |
| Security                | crypto_password_storage                                       | N/A                 | Callers use API keys, stored as SHA-256 hashes                                     |
| Security                | crypto_random                                                 | Met                 | `node:crypto` random sources                                                       |
| Security                | delivery_unsigned                                             | Met                 | Downloads over HTTPS only                                                          |
| Security                | vulnerabilities_fixed_60_days                                 | Open                | See section 4                                                                      |
| Security                | know_secure_design, know_common_errors                        | Owner's attestation | `THREAT-MODEL.md`                                                                  |

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
2. `release_notes_vulns`: check for a CVE for the certificate issue in `server-v1.0.1`.
3. `report_responses` and `enhancement_responses`: answer after the first reports and requests have been handled.
4. Best Practices badge: point at project 15846 once the owner confirms it.
5. Contributor-agreement and collaborator-agreement rules.
6. History rewrite for the deleted notes (section 5).
7. Branch protection on `main` (Scorecard Branch-Protection).
