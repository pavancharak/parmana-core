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

## Sign-off

Reviewer: ____________________  Role: ____________________  Date: ____________
