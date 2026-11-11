# 2.39 Execution Intents: Signed Evidence Before Release, and a Repair Path

Source: CLAIMS.md (commit d1d63c6), lines 1312-1351.

## Exact claim text

## 2.39 Execution Intents: Signed Evidence Before Release, and a Repair Path

**Claim.** Before an action is released to a connector, the runtime signs an Execution Intent and stores it. If the intent cannot be signed or stored, nothing is released, and the caller gets `503 EXECUTION_INTENT_UNAVAILABLE`. So every released action has a signed intent that was stored before the release. If the signed Execution Trust Record cannot then be produced or stored, it can be rebuilt from the execution context saved after release, with `POST /execution-intents/{businessTransactionId}/finalize`. Finalize never calls the connector. The decision is recorded in `docs/internal/adr/ADR-0012-Signed-Execution-Intent-Before-Release.md`.

**What the intent contains.**

- The intent is a separate record, in its own table (`execution_intents`). The Execution Trust Record keeps its format, and both SDK verifiers verify it unchanged.
- It signs the identifiers, the policy reference and its content hash, the signal and business transaction hashes copied from the signed authorization, the action, the target, the submitter, the granted capability and the creation time. It never signs the execution result, or the raw intent parameters.
- The signature uses the same key as the Trust Record. It can be verified with the public key alone, through `POST /execution-intents/verify` (no credential) or offline with `scripts/verify-execution-intent.ts`.
- The operational state (`PREPARED`, `RELEASED`, `FINALIZED`, `ERRORED`) is stored beside the intent and is not signed. Status updates after release are best effort. They never throw, and they log at critical severity if they fail.

**Finalize.** Finalize is idempotent and safe under concurrent calls. An existing record is returned, and nothing is rebuilt. It verifies the record and generates the receipt. Once an intent is `FINALIZED`, the saved execution context is deleted, because the Trust Record holds it. `finalize` and `GET /execution-intents/unfinalized` need a credential for a verified human. Any other caller is refused with `403 NON_HUMAN_CALLER_DENIED`.

**Enforcement.** Intents are required everywhere except when `NODE_ENV` is exactly `test` or `development`, where `EXECUTION_INTENTS_CHECK=true` turns them on. No environment variable switches them off in production. `GET /ready` reports `NOT_READY` when the table is missing.

**Scope and limits.**

- **An intent proves what was about to be released.** It does not prove that the action was released, or what its result was. An intent in `PREPARED` or `ERRORED` means the action may or may not have run. Only the connector can say which.
- **Every released action does not always get a signed Trust Record.** `EXECUTION_RECORD_INCOMPLETE` is still possible. It can be repaired when the execution context was saved (state `RELEASED`). When that save also failed (state `PREPARED`), finalize refuses with `409 EXECUTION_INTENT_RESULT_NOT_RECORDED`, and the outcome has to be established from the connector by hand.
- **An operator can close an intent by hand** with `POST /execution-intents/{businessTransactionId}/resolve`, after reconciling it at the connector (G-54). The record of this is an attributed statement of what the operator found (`NOT_EXECUTED` or `EXECUTED`), with a required note. It is not signed, is not tamper evident, and does not create a Trust Record. It never calls a connector, and it refuses a `RELEASED` intent (finalize applies to those), a `FINALIZED` intent, and any transaction that already has a Trust Record.
- **SDK methods.** The TypeScript and Python SDKs have methods for the intent routes (G-55). The Python SDK includes an offline intent verifier. Check the SDK changelog for the version that includes each method.
- **Earlier transactions.** Transactions created before this change have no intent, and their behaviour is unchanged.
- **Migration first.** Deploying this version without the migration `supabase/migrations/20260921120000_add_execution_intents.sql` makes every execution fail closed with `503 EXECUTION_INTENT_UNAVAILABLE`. That is by design, and `GET /ready` reports it first.

**Live check.** On 2026-09-21, against a production build, a real PostgreSQL, a real KMS signing key and a real agent, with a staging payment connector using fake credentials, the check ran four scenarios: a normal request, a released action whose record could not be stored and was then rebuilt by finalize, an intent that could not be stored (refused without calling the connector), and a connector failure that was closed by hand. The run passed, 37 of 37 checks. Its details are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md). Not verified: signing from a Vercel deployment, latency from Vercel, and a real payment.

**Evidence.**

- `packages/shared/src/domain/execution-intent.ts`
- `packages/crypto/src/ExecutionIntentCrypto.ts`, `ExecutionIntentCanonicalView.ts`, and `OfflineVerifier.ts` (`verifyExecutionIntentOffline`); `scripts/verify-execution-intent.ts`
- `packages/runtime/src/ExecutionIntentBuilder.ts`, `ExecutionIntentService.ts`, `ExecutionIntentFinalizer.ts`, and `RuntimeEngine.ts`
- `packages/storage/src/postgres/PostgresExecutionIntentRepository.ts`; `supabase/migrations/20260921120000_add_execution_intents.sql`
- `packages/api/src/routes/execution-intents.ts`; `packages/api/src/bootstrap/createExecutionIntents.ts`; `packages/api/src/routes/ready.ts`
- `packages/runtime/tests/unit/execution-intent.test.ts` (intent signed and stored before release; a failed store releases nothing; finalize rebuilds a verifiable record without a second release; idempotent and race safe)
- `packages/crypto/tests/unit/execution-intent-crypto.test.ts` (offline verification, tamper detection)
- `packages/api/tests/integration/execution-intents.integration.test.ts` (the routes, the authorization rules, and the repair over HTTP)
- `docs/site/concepts/execution-intents.mdx` (the operator procedure)

Dated updates and the live-check detail are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## Cited evidence paths

- `docs/internal/adr/ADR-0012-Signed-Execution-Intent-Before-Release.md`: EXISTS
- `docs/site/concepts/execution-intents.mdx`: EXISTS
- `packages/api/src/bootstrap/createExecutionIntents.ts`: EXISTS
- `packages/api/src/routes/execution-intents.ts`: EXISTS
- `packages/api/src/routes/ready.ts`: EXISTS
- `packages/api/tests/integration/execution-intents.integration.test.ts`: EXISTS
- `packages/crypto/src/ExecutionIntentCrypto.ts`: EXISTS
- `packages/crypto/tests/unit/execution-intent-crypto.test.ts`: EXISTS
- `packages/runtime/src/ExecutionIntentBuilder.ts`: EXISTS
- `packages/runtime/tests/unit/execution-intent.test.ts`: EXISTS
- `packages/shared/src/domain/execution-intent.ts`: EXISTS
- `packages/storage/src/postgres/PostgresExecutionIntentRepository.ts`: EXISTS
- `scripts/verify-execution-intent.ts`: EXISTS
- `supabase/migrations/20260921120000_add_execution_intents.sql`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                                              | Status | Tests | Passed | Skipped |
| ---------------------------------------------------------------------- | ------ | ----- | ------ | ------- |
| `packages/api/tests/integration/execution-intents.integration.test.ts` | passed | 13    | 13     | 0       |
| `packages/crypto/tests/unit/execution-intent-crypto.test.ts`           | passed | 10    | 10     | 0       |
| `packages/runtime/tests/unit/execution-intent.test.ts`                 | passed | 39    | 39     | 0       |
