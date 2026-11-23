# Changelog

This file records user-visible changes by version. Entries before this file
existed are in the git history.

## [Unreleased]

- Local mode is now explicit. Replay-nonce storage, execution intents, signing
  readiness and caller-auth disabling relax only when `PARMANA_LOCAL_MODE=true`
  and `NODE_ENV` is exactly `test` or `development`. `NODE_ENV` alone no longer
  relaxes any check, and the flag under any other `NODE_ENV` stops startup.
- The built-in `test-fixture` connector identity is trusted only in local mode.
- Gateway attestations carry `expiresAt` (60 seconds from issue). The verifier
  refuses an attestation at or after that instant.

## [4.1.1]

- Added the Production Readiness Gate: a strict, fail-closed release gate
  (`production-readiness/`, `.github/workflows/production-readiness.yml`).
- Documented `PARMANA_DATABASE_CA_FILE` in `.env.example`.
