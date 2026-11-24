# Changelog

This file records user-visible changes by version. Entries before this file
existed are in the git history.

## [Unreleased]

- Refusal Records are no longer lost when their write fails. The refusal's
  inputs are saved to a durable outbox (`refusal_record_outbox`), and a timer
  writes the record later (`PARMANA_REFUSAL_OUTBOX_SECONDS`, default 30). A
  refusal still takes effect whether or not its record is written at the time.
  The one remaining gap: if the database itself is unreachable when a refusal
  happens, neither the record nor the outbox entry can be written. That case is
  logged as `refusal_record_outbox_enqueue_failed`.

- Local mode is now explicit. Replay-nonce storage, execution intents, signing
  readiness and caller-auth disabling relax only when `PARMANA_LOCAL_MODE=true`
  and `NODE_ENV` is exactly `test` or `development`. `NODE_ENV` alone no longer
  relaxes any check, and the flag under any other `NODE_ENV` stops startup.
- The built-in `test-fixture` connector identity is trusted only in local mode.
- External connector identities are trusted only by the authenticator scoped to
  the identity of their own active registration. The identity form alone is no
  longer trusted, and `ExternalConnectorAwareRegistry.get()` returns built-in
  connectors only, so a revoked external connector is reachable only through the
  active-registration check.
- Gateway attestations carry `expiresAt` (60 seconds from issue). The verifier
  refuses an attestation at or after that instant.

## [4.1.1]

- Added the Production Readiness Gate: a strict, fail-closed release gate
  (`production-readiness/`, `.github/workflows/production-readiness.yml`).
- Documented `PARMANA_DATABASE_CA_FILE` in `.env.example`.
