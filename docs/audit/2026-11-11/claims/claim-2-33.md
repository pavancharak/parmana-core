# 2.33 Authorization Envelope Bound Into the Trust Record's Own Signature

Source: CLAIMS.md (commit d1d63c6), lines 1140-1164.

## Exact claim text

## 2.33 Authorization Envelope Bound Into the Trust Record's Own Signature

**What this closes.** A full-codebase deep read (Sep 7, 2026) found that `ExecutionTrustRecord` carried no record of the `SignedExecutionAuthorization` the Execution Gateway actually accepted for that transaction. A loaded trust record could prove its own `transaction`/`overrides`/`executions` hadn't been tampered with, but could not independently prove which nonce was consumed, which expiry was checked, or which `businessTransactionHash`/`policyContentHash`/`signalsHash` the authorization itself was signed under — an auditor had to trust that a matching authorization existed somewhere else, not verify it from the trust record alone.

**What was added.** `ExecutionTrustRecord` (`packages/shared/src/domain/execution-trust-record.ts`) gained an optional `authorization?: SignedExecutionAuthorization` field, captured from `RuntimeContext.authorization` by `BusinessTrustRecordBuilder.build()` (`packages/runtime/src/BusinessTrustRecordBuilder.ts`) and included in `VerificationCrypto.canonicalRecord()` (`packages/crypto/src/VerificationCrypto.ts`) alongside `transaction`/`overrides`/`executions` — so it is covered by the same `trustRecordHash`/`signature` (and, under `CRYPTO_MODE=hybrid`, the same `signatures[]`) as everything else already hashed there, not a separate, independently-checked attachment.

**Backward compatibility, and why no special-case verification branch was needed.** `CanonicalSerializer` (`packages/crypto/src/CanonicalSerializer.ts`) normalizes to a plain object and serializes via `JSON.stringify`, which drops any key whose value is `undefined` regardless of whether that key was present during normalization. A trust record built before this field existed — or any record for a transaction that never reached execution, e.g. a policy rejection — has `authorization === undefined`, which therefore serializes byte-identically to a record built with no `authorization` key at all. `VerificationCrypto.hash()`/`.sign()`/`.verify()`/`.verifySignature()` needed no code change beyond `canonicalRecord()` itself: every existing trust record's stored `trustRecordHash`/`signature` verifies unchanged, and a new record with a real `authorization` gets it covered by the hash/signature automatically, with no "if present" branch anywhere in the verification path.

**A related, independently-discovered defect fixed in the same pass.** While verifying the Supabase storage round-trip for this field, found that the hybrid-signature fields (`ExecutionTrustRecord.schemaVersion`/`.signatures`, from an earlier "Hybrid Signature Support" milestone) had never been given a Supabase column at all — a `CRYPTO_MODE=hybrid` trust record silently lost its second signature on every read from Supabase, degrading hybrid verification to single-signature for anything reloaded from durable storage, since the record was constructed. Not previously known or documented. Fixed in the same migration as `authorization_json`: see Evidence.

Evidence

- `packages/shared/src/domain/execution-trust-record.ts` (`authorization?: SignedExecutionAuthorization` field)
- `packages/runtime/src/BusinessTrustRecordBuilder.ts` (captures `context.authorization` into the draft, conditionally, to satisfy `exactOptionalPropertyTypes`)
- `packages/crypto/src/VerificationCrypto.ts` (`canonicalRecord()` includes `authorization`)
- `supabase/migrations/20260907120000_add_authorization_and_hybrid_signatures_to_execution_trust_records.sql` (`authorization_json`, `schema_version`, `signatures_json` columns, all nullable)
- `packages/storage/src/postgres/PostgresExecutionTrustRecordRepository.ts` (`create()`/`findByTransactionId()` persist and retrieve all three)
- `packages/crypto/tests/unit/verification-crypto-authorization.test.ts` (4 cases: verifies with authorization absent; verifies with it present, hash differs from the same record without it; fails closed on a tampered authorization; a record built with the literal pre-fix draft shape hashes identically to one built with `authorization: undefined`)
- `packages/runtime/tests/unit/business-trust-record-builder.test.ts` (2 cases: captures a present authorization onto the built record; leaves the key genuinely absent, not `undefined`, when RuntimeContext has none)
- `packages/storage/tests/unit/postgres-execution-trust-record-repository.test.ts` (2 new cases: full round-trip of `authorization`/`schemaVersion`/`signatures` against a fake `pg.Pool`; a legacy row with none of the three persisted returns them as genuinely absent)
- `python/parmana/models/trust_record.py` regenerated to match (`npm run check:python-models` clean)
- Full repo `npx tsc -b`, `npx eslint . --ext .ts`, and `npx vitest run` all clean: 1514 passed, 38 pre-existing skips, 0 failed. Commit `6303801`

---

## Cited evidence paths

- `packages/crypto/src/CanonicalSerializer.ts`: EXISTS
- `packages/crypto/src/VerificationCrypto.ts`: EXISTS
- `packages/crypto/tests/unit/verification-crypto-authorization.test.ts`: EXISTS
- `packages/runtime/src/BusinessTrustRecordBuilder.ts`: EXISTS
- `packages/runtime/tests/unit/business-trust-record-builder.test.ts`: EXISTS
- `packages/shared/src/domain/execution-trust-record.ts`: EXISTS
- `packages/storage/src/postgres/PostgresExecutionTrustRecordRepository.ts`: EXISTS
- `packages/storage/tests/unit/postgres-execution-trust-record-repository.test.ts`: EXISTS
- `python/parmana/models/trust_record.py`: EXISTS
- `supabase/migrations/20260907120000_add_authorization_and_hybrid_signatures_to_execution_trust_records.sql`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                                                        | Status | Tests | Passed | Skipped |
| -------------------------------------------------------------------------------- | ------ | ----- | ------ | ------- |
| `packages/crypto/tests/unit/verification-crypto-authorization.test.ts`           | passed | 4     | 4      | 0       |
| `packages/runtime/tests/unit/business-trust-record-builder.test.ts`              | passed | 2     | 2      | 0       |
| `packages/storage/tests/unit/postgres-execution-trust-record-repository.test.ts` | passed | 6     | 6      | 0       |
