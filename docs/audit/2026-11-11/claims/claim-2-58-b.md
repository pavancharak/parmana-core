# 2.58 Signing Keys Are Loaded From a Secret Manager at Startup, Not From an Environment Variable (Scoped, 2026-11-07)

Source: CLAIMS.md (commit d1d63c6), lines 1522-1532.

## Exact claim text

## 2.58 Signing Keys Are Loaded From a Secret Manager at Startup, Not From an Environment Variable (Scoped, 2026-11-07)

**Claim.** When `PARMANA_KEY_MATERIAL_SECRET` is set, the server reads its signing keys at startup from one AWS Secrets Manager secret, using the platform's own identity. The environment holds a reference to the secret, not the key. The server writes any missing key file and never overwrites one that exists. It refuses to start the reference path unless `PARMANA_SECRETS_PROVIDER` is `aws-secrets-manager`.

**Scope.** Tested with a fake secrets provider (`packages/api/tests/unit/bootstrap/load-key-material-secrets-manager.test.ts`). Not yet run against AWS Secrets Manager. Production still reads its keys from `PARMANA_KEY_MATERIAL_JSON` until the move on 10 November 2026, so this claim does not yet hold for production. The Vercel identity that reads the secret is not yet verified. See `docs/internal/runbooks/SECRETS-MANAGER-KEYS.md` and G-161.

**Evidence.**

- `packages/api/src/bootstrap/loadKeyMaterialFromSecretsManager.ts`
- `packages/api/src/bootstrap/assertSigningKeyMaterialConfigured.ts` (`writeKeyMaterialJson`)


## Cited evidence paths

- `docs/internal/runbooks/SECRETS-MANAGER-KEYS.md`: EXISTS
- `packages/api/src/bootstrap/assertSigningKeyMaterialConfigured.ts`: EXISTS
- `packages/api/src/bootstrap/loadKeyMaterialFromSecretsManager.ts`: EXISTS
- `packages/api/tests/unit/bootstrap/load-key-material-secrets-manager.test.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/unit/bootstrap/load-key-material-secrets-manager.test.ts` | passed | 5 | 5 | 0 |
