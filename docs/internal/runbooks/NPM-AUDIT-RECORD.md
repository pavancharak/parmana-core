# npm audit record and fix

What `npm audit` reported for the workspace on 2026-10-28, what changed to clear it, how it was checked, and what is still open. Read this when an npm audit run fails, when the audit gate in CI fails, or when a dependency override is changed.

**Read first:** [README.md](README.md) for the rules that apply to every runbook.

## Index

1. [Summary](#1-summary)
2. [Findings before the fix](#2-findings-before-the-fix)
3. [The change](#3-the-change)
4. [Why 6.16.1 and not 6.16.2](#4-why-6161-and-not-6162)
5. [How it was checked](#5-how-it-was-checked)
6. [Reproduce the audit](#6-reproduce-the-audit)
7. [What is still open](#7-what-is-still-open)
8. [Earlier records](#8-earlier-records)

---

## 1. Summary

- Before the fix, `npm audit` reported two moderate advisories, both for `qs` 6.7.0 to 6.16.0.
  - One reached production through `@parmana/api`, via `express`, `body-parser` and `typed-rest-client`'s dependency tree.
  - One reached development tooling through `@stryker-mutator/core`.
- The fix raises the `qs` override in `package.json` from `^6.16.0` to `^6.16.1`, then refreshes `package-lock.json`.
- After the fix, `npm audit` reports `found 0 vulnerabilities`, and `npm audit --omit=dev --audit-level=critical` passes.
- The high-severity findings listed in the earlier record (section 8) are not in the lockfile any more. This run did not reproduce them.

## 2. Findings before the fix

Output of `npm audit` on the lockfile before the change:

```text
qs  6.7.0 - 6.16.0
Severity: moderate
qs : qs.stringify with arrayFormat 'comma' throws an uncaught TypeError on
     array elements carrying a non-callable own toString (DoS)
     - https://github.com/advisories/GHSA-6pq8-jhm2-2vcw
node_modules/qs
  typed-rest-client  2.3.1 - 3.1.0
  Depends on vulnerable versions of qs
  node_modules/typed-rest-client

2 moderate severity vulnerabilities
```

| Advisory            | Package | Severity | Affected         | Patched  | Reached through                                                                                                                       |
| ------------------- | ------- | -------- | ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| GHSA-6pq8-jhm2-2vcw | `qs`    | Moderate | `6.7.0 - 6.16.0` | `6.16.1` | `express`, `body-parser`, `superagent` in `packages/api` (runtime), and `@stryker-mutator/core` via `typed-rest-client` (development) |

The advisory is a denial of service. `qs.stringify` with `arrayFormat: 'comma'` throws on array elements that have a non-callable own `toString`. Any code path in this repository that calls `qs.stringify` with that option on untrusted input is affected. The `api` package reads query strings through Express's parser. Confirm the exact reachable path before deciding that a finding is not exploitable.

## 3. The change

Two files changed.

| File                | Change                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`      | The `qs` override at the top level and the two nested overrides under `express` and `body-parser` are raised from `^6.16.0` to `^6.16.1`. |
| `package-lock.json` | Refreshed with `npm install` under Node 24. `qs` resolves to `6.16.1` wherever the overrides apply.                                       |

No source file changed. The `overrides` block is the only place the `qs` version is set.

To see the exact diff:

```bash
git diff -- package.json package-lock.json
```

## 4. Why 6.16.1 and not 6.16.2

`npm view qs time --json` on 2026-10-28 shows:

| Version  | Published  |
| -------- | ---------- |
| `6.16.1` | 2026-10-14 |
| `6.16.2` | 2026-10-27 |
| `6.17.0` | 2026-10-27 |

`6.16.1` is the first version outside the advisory range, and it has been published for two weeks. `6.16.2` and `6.17.0` were published the day before this change, so they have had no time to be checked by others. The override uses `^6.16.1`, so a later `npm install` may still pick up `6.16.2` or `6.17.0`. Re-check the advisory and the publish dates before raising the floor again.

## 5. How it was checked

Run on Node 24.22.1, which the repository requires. Node 22 was on the default path at the start of the session, so the Node 24 binary was put first on `PATH` for every step.

| Check                                                                                | Result                                                     |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `npm audit` after the change                                                         | `found 0 vulnerabilities`                                  |
| `npm audit --omit=dev --audit-level=critical`                                        | passes (the CI gate)                                       |
| `npm ls qs`                                                                          | every `qs` resolves to `6.16.1` or later                   |
| `npm run build`                                                                      | exit 0                                                     |
| `npx prettier --check package.json`                                                  | passes                                                     |
| `packages/api` tests, run from the repo root with the CI environment (see section 6) | 114 files passed, 13 skipped; 760 tests passed, 42 skipped |

The `api` tests must run from the repository root. The root `vitest.setup.ts` creates the signing key directory. Running `vitest` inside `packages/api` fails with `PARMANA_KEY_DIR is not configured` in 362 tests. That is a setup problem, not a regression from this change.

## 6. Reproduce the audit

Use the same Node version as CI (24) and the same environment the `api` tests need.

```bash
node -v
npm ci
npm audit
npm audit --omit=dev --audit-level=critical
npm run build
NODE_ENV=test PARMANA_POLICY_DIR=./policies PARMANA_STORAGE=memory \
  KEY_PROVIDER=local PRIMARY_SIGNATURE_PROVIDER=ed25519 \
  npx vitest run packages/api
```

`node -v` must print `v24.x`. If it prints `v22.x`, install Node 24 or put a Node 24 binary first on `PATH`. A native module such as `re2` built under Node 22 will fail with `ERR_DLOPEN_FAILED` under Node 24.

## 7. What is still open

- `qs` is fixed at the advisory's patched version, not at the newest one. Re-check when `6.16.2` or later has been out for two weeks.
- The `typed-rest-client` path is a development dependency of `@stryker-mutator/core`. It is fixed by the same override, but it is listed here because `npm audit` reported it separately.
- The CI audit gate blocks only critical findings (`--audit-level=critical`). A high or moderate finding does not fail the build. It is printed by the `|| true` report step in `.github/workflows/ci.yml`. Decide whether to raise the gate after the next review.
- The `api` tests were run locally, not in the GitHub Actions runner. The CI job sets the same variables, so a difference would show as a failure there.

## 8. Earlier records

- [OPENSSF-AND-ADVISORY-RECORD.md](OPENSSF-AND-ADVISORY-RECORD.md), section 4, lists five open high findings from 2026-10-24: `zod` (GHSA-mrhx-c7xc-m3w5) and four `@vercel/*` packages. In the lockfile on 2026-10-28, `zod` is pinned to `4.6.7`, which is past the patched version named there (`4.6.6`). The `@vercel/*` packages are present at their pinned versions, and `npm audit` reports no finding for them. The earlier record does not say when that changed.
- [DEPENDABOT-ALERTS.md](DEPENDABOT-ALERTS.md) covers the `certifi` and `markdown-it` alerts closed in PR #14. Those are not related to this change.
