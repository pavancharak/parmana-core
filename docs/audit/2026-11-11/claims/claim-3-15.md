# 3.15 SDK Dogfooding: Documented Quickstarts Now Proven to Actually Run (Scoped)

Source: CLAIMS.md (commit d1d63c6), lines 1705-1732.

## Exact claim text

## 3.15 SDK Dogfooding: Documented Quickstarts Now Proven to Actually Run (Scoped)

**Scope, precisely:** this claim covers the two documented "quickstart" example scripts — `python/examples/quickstart/run.py` and its closest TypeScript equivalent, `typescript/examples/02-execute.ts` — now being proven to actually work by an automated test, plus the real bugs found while proving that. It does **not** cover the other 11 numbered example scripts in `python/examples/`, the other 4 in `typescript/examples/`, or either SDK's full API surface; those remain unexercised by any test, same as before this pass.

Before this pass, both quickstart scripts already imported their respective SDK (`parmana` / `@parmana/sdk`) rather than raw HTTP — that part did not need rewriting. What neither had was anything that actually _ran_ them: `typescript/examples/` is explicitly excluded from `typescript/tsconfig.json`'s own `include` list, so nothing in this repository has ever built, type-checked, or executed it, and no test imported `python/examples/quickstart/run.py` either. Both were, until now, hand-written code that had never been mechanically proven to still work as the surrounding schema evolved.

**What dogfooding this found, checked directly against the current schema and each SDK's actual exported members, not assumed:**

- Every file in `typescript/examples/` (5 example scripts, 2 shared helpers) imported `@parmana/typescript-sdk` — a package name that has never existed anywhere in this repository's history, under any name this workspace has ever had (`@parmana/legacy-reference` before this session's earlier TypeScript-SDK-audit pass, `@parmana/sdk` after it). None of these files could have ever been run as committed.
- `typescript/examples/02-execute.ts` and `typescript/examples/shared/transaction.ts` referenced `AuthorityType.USER` and `BusinessTransactionStatus.RECEIVED` as if they were runtime enum members. This SDK's hand-maintained models type both fields as plain `string`/string-union types with no such runtime enum exported at all (`import * as sdk from "@parmana/sdk"; sdk.AuthorityType` is `undefined`) — both files would have thrown immediately on execution.
- `typescript/examples/04-replay.ts` called `client.replay({ businessTransactionId: "..." })`, an object, where `ParmanaClient.replay()` takes a plain `string` — would have sent a malformed request path.
- `python/examples/quickstart/run.py` passed plain Python strings (`"SERVICE"`, `"RECEIVED"`) where the real generated dataclasses (`Authority.authority_type`, `BusinessTransaction.status`) declare actual `AuthorityType`/`BusinessTransactionStatus` enum types — confirmed by `mypy`, not inferred. Harmless on the wire (a `str, Enum` member and a plain string with the same value serialize identically, so this never caused a wrong request), but a genuine type-safety defect the language's own type checker would have caught immediately had anything ever run it in that mode.

All four fixed. `typescript/examples/02-execute.ts` was additionally refactored into an exported `runExecuteExample(endpoint?)` (previously a bare top-level script with no importable entry point) and `python/examples/quickstart/run.py`'s body into an exported `run_quickstart(endpoint?)` returning the `ExecutionTrustRecord` — both changes made specifically so a test could call them, not a stylistic preference.

**Now proven, present tense, by a real running server each `npm test` / `pytest` run boots:** `typescript/test/integration/examples.integration.test.ts` imports and calls `runExecuteExample` against a real local server and asserts a signed, `APPROVED` Execution Trust Record comes back. `python/tests/test_quickstart_example.py` does the same for `run_quickstart`, additionally asserting the script's own documented printed output (README.md's "Expected output" section) still matches what it actually prints. `python/examples/quickstart/README.md`'s prerequisites and sample output, which still referenced the removed `payments:execute`/`vendor-payment` capability and its `VENDOR_PAYMENT_TOKEN` (docs/internal/VERIFICATION-GAPS.md G-27 removed it entirely, before this pass), were rewritten from a real captured run against `test:fixture-execute`, the fixture this script has actually targeted since that removal.

Evidence

- `typescript/examples/01-health.ts`, `02-execute.ts`, `03-verify.ts`, `04-replay.ts`, `05-policy-validation.ts`, `shared/client.ts`, `shared/transaction.ts` (package-name fix, all 7 files); `02-execute.ts`, `shared/transaction.ts` (enum-misuse fix); `04-replay.ts` (`client.replay()` argument fix)
- `typescript/test/integration/examples.integration.test.ts` (1 test): runs `runExecuteExample` against a real local server, asserts `trustRecordId` present, one `APPROVED` execution, `ed25519` signature
- `python/examples/quickstart/run.py` (`run_quickstart` extraction, `AuthorityType`/`BusinessTransactionStatus` enum fix); `python/examples/quickstart/README.md` (stale prerequisites/output rewritten from a real run)
- `python/tests/test_quickstart_example.py` (1 test): spawns a real local server with caller-auth disabled (matching the documented manual setup exactly, since `run_quickstart` never supplies an `api_key`), runs `run_quickstart` against it, asserts the returned record and the script's own printed output both match
- `mypy examples/quickstart/run.py` (Python): 3 errors before this pass's enum fix (2 real type mismatches plus one pre-existing, unrelated `datetime.UTC` 3.10-compatibility notice, unchanged), 1 after (only the unrelated notice remains)
- `npx tsc --noEmit` against `typescript/examples/**/*.ts` (TypeScript, checked directly — `typescript/tsconfig.json` itself does not cover this directory): clean after all fixes

---


## Cited evidence paths

- `api_key`: MISSING
- `python/examples/`: EXISTS
- `python/examples/quickstart/README.md`: EXISTS
- `python/examples/quickstart/run.py`: EXISTS
- `python/tests/test_quickstart_example.py`: EXISTS
- `typescript/examples/`: EXISTS
- `typescript/examples/01-health.ts`: EXISTS
- `typescript/examples/02-execute.ts`: EXISTS
- `typescript/examples/04-replay.ts`: EXISTS
- `typescript/examples/shared/transaction.ts`: EXISTS
- `typescript/test/integration/examples.integration.test.ts`: EXISTS
- `typescript/tsconfig.json`: EXISTS

## Test results from the full run (vitest full run, 403 files, 0 failed)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `python/tests/test_quickstart_example.py` | not-run-or-missing | 0 | 0 | 0 |
| `typescript/test/integration/examples.integration.test.ts` | passed | 3 | 3 | 0 |
