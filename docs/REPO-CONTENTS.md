# What this repository contains

This is the private repository for the Parmana product. It holds everything: the core service, policies, connectors, SDKs, operational documents, and the patent and claims material. Keep it private.

## Should contain

- `packages/`, `scripts/`, `supabase/`, `policies/`, `openapi/`, `docs/`, `examples/`, `tests/`, and the CI workflows under `.github/`.
- Operational and governance records: `DECISIONS.md`, `docs/REMAINING-WORK.md`, `docs/CLAIMS.md`, and the mapping documents.
- Example and template files with placeholder values, such as `.env.example`.
- Test fixtures that are clearly fake (for example `fake_key_...`).

## Must not contain

- `.env` files, private keys (`.pem`, `.key`), token values, database URLs with passwords, or production records.
- Real credentials in any file, including tests and documentation.
- Anything that must become public: the verifier is published from its own repository, so do not copy core code into it.

## Before every update

1. Run `git status` and review every new file with `git diff --stat`.
2. Run `npm run check`.
3. Search the changes for real secrets: private key headers, `DATABASE_URL` values with passwords, and cloud access keys.
4. Confirm the repository is still private on GitHub (Settings → General → Danger Zone).
