# Verification audit register: parmana-core

- Repository: pavancharak/parmana-core
- Commit reviewed: d1d63c6 (main)
- Review date: 2026-11-11
- Scope: all 79 claims in `docs/internal/CLAIMS.md`, all 152 gaps in `docs/internal/VERIFICATION-GAPS.md`

## Files

- `register.xlsx`: one row per claim and per gap, with serial, claim or gap text reference, evidence checked, current status, audit status, date, and notes. Sheets: Summary, Claims, Gaps, Method.
- `claims/`: one file per claim, with the exact claim text, cited evidence (EXISTS or MISSING), and full-run test results.
- `gaps/`: one file per gap, with the exact entry text, cited evidence, status, and the code-check finding.

## Test results

- TypeScript (Vitest): 403 test files, 0 failed. 3894 tests passed, 0 failed, 1 pending. Run with a local PostgreSQL 16 test database, migrations applied, and ALLOW_LIVE_SUPABASE=1. The database is throwaway and local, not a live project. Without a database, 106 tests are skipped.
- Python SDK (pytest, requirements-dev.txt, Node 24 on PATH): 193 passed, 0 errors. Without Node 24 on PATH, 19 live-server tests error because the native module was built for another Node version.

## Limitations

- This is an internal review, not an independent audit.
- Most claims and most closed gaps have had their evidence checked (paths and tests), but their behaviour has not been re-read.
- Production state (deployed configuration, live database migrations, live keys) cannot be verified from source.
- `parmana-connect` and the separately published verifier are outside the reviewed repository.
- Commit `66c1e50` cited in G-158 is not in the reviewed clone.

## How to read this folder

1. Start with `register.xlsx`. The Summary sheet gives the totals. The Claims and Gaps sheets have one row per item.
2. For detail on one item, open its file: `claims/claim-<number>.md` or `gaps/G-<number>.md`. Each file has the exact text from the project's document, the evidence checked, and the code-check result.
3. `STALE-DOCUMENTS.md` lists statements in the project's own documents that the code or another document contradicts, with the replacement wording. It is the list of corrections the project needs to make.

## Status terms

- **Evidence present; cited tests pass** (claims): cited files exist and the cited test files passed in the run described above.
- **Evidence reference missing** (claims): at least one cited file does not exist at d1d63c6. See `STALE-DOCUMENTS.md`.
- **CONFIRMED, CONSISTENT, FIXED, CONFIRMED OPEN** (gaps): a code check was done on the gap's cited code.
- **PARTLY CHANGED, CHANGED IN CODE, CONTRADICTED BY CODE** (gaps): the code differs from the entry's text. See the file and `STALE-DOCUMENTS.md`.
- **CLAIMED CLOSED (mechanical check)** (gaps): only paths and tests were checked. Behaviour has not been re-read.
- **NOT VERIFIABLE, NOT IN CORE** (gaps): needs production state or the parmana-connect repository.

## Sign-off

Reviewer: ____________________ Role: ____________________ Date: ____________
