# 3.24 Policy Approval Scan and Governance UI Fail Closed (Scoped, 2026-10-15)

Source: CLAIMS.md (commit d1d63c6), lines 2027-2046.

## Exact claim text

## 3.24 Policy Approval Scan and Governance UI Fail Closed (Scoped, 2026-10-15)

**Claim.** Two gates that decide whether a deployment or a human-facing tool can be trusted now fail closed instead of passing silently:

1. The full policy approval scan (`scripts/verify-policy-changes-approved.ts --full-scan`) reports failure when the policies directory cannot be read, and when it finds no policy files to check. A read error is no longer treated as an empty directory, so a scan can no longer pass having checked nothing.
2. The governance UI refuses an API base URL that would send its bearer key in clear text. `https://` is required. `http://` is accepted only for `localhost`, `127.0.0.1` and `[::1]` and only outside `NODE_ENV=production`. A URL that embeds credentials is refused.

**Evidence.**

- scripts/verify-policy-changes-approved.ts: `findAllPolicyFiles` no longer swallows `readdir` errors; `main` exits 1 when a full scan finds zero policy files.
- scripts/tests/verify-policy-full-scan.test.ts: lists policy files; rejects a missing policies directory.
- packages/governance-ui/src/config.ts: `assertSafeApiBaseUrl()`, called from `loadGovernanceUiConfig()`.
- packages/governance-ui/tests/unit/config.test.ts: https accepted; loopback http accepted outside production and refused in production; remote http refused; embedded credentials refused; non-URL refused.

**Limits.**

- The scan checks the files it can list. A policy file that is present, readable and not approved is still caught by the content-hash comparison, which this change does not alter.
- The governance UI check validates the URL's shape only. It does not check which host the URL names. Choosing the right API host remains an operator decision.
- Status: fixed on local branch `fix/policy-scan-and-governance-url` (commit `a8ac2961`). Not yet pushed or merged. See G-96 and G-97 in `docs/internal/VERIFICATION-GAPS.md`.

## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

No cited test file.
