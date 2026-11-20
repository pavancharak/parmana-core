# ADR-0016: Sign the whole Execution Trust Record under schema version 3

**Status:** Accepted on 2026-10-19 (design). Steps 1-3 implemented on `claude/parmana-repo-separation-svz6oz` (v3 behind `HYBRID_SCHEMA_VERSION`, default 2). v3 issuance gated, see "Issuance gate" below.

**Date:** Proposed 2026-10-19.

**Relates to:** the public verifier's `docs/FORMAT.md` section "Fields not covered by any signature"; `packages/crypto/src/ExecutionTrustRecordCanonicalView.ts`; `HYBRID_SCHEMA_VERSION` in `ReceiptCrypto.ts` and `VerificationCrypto.ts`.

## Context

The legacy `signature` covers seven fields, defined by `canonicalExecutionTrustRecord()`: `trustRecordId`, `businessTransactionId`, `transaction`, `authorization`, `overrides`, `executions`, and `createdAt`. Any other top-level field of a record is outside `trustRecordHash` and outside every signature. The verifier therefore reports `valid: true` for a record whose uncovered field was changed. This is documented as a known limitation.

Two constraints apply:

1. The code comment in `ExecutionTrustRecordCanonicalView.ts` says the legacy signature's content must never change, so that pre-hybrid verifiers, including the separately published verifier, keep working. Coverage must therefore be added in a new envelope, not by changing the legacy signature.
2. The hybrid envelope already exists. It signs the canonical fields plus `schemaVersion`, and the current version is 2.

## Decision (proposed)

Introduce schema version 3. A v3 record carries a hybrid `signatures` array whose message is the canonical bytes of every top-level field except the signature fields (`signature` and `signatures`), plus `schemaVersion: 3`.

- The legacy `signature` is unchanged and still covers the seven v1 fields.
- Because `schemaVersion` is inside the signed message, a v2 signature cannot be relabelled as v3.
- Canonicalization stays as defined in `docs/FORMAT.md`: sorted keys, arrays in order, UTF-8, no extra whitespace.

## Questions to decide before implementation

1. **Which fields are excluded?** Only the two signature fields, or also any field Parmana writes after signing. If any field is added after the signature is made, v3 verification breaks. Audit every write to a record that happens after `trustRecordHash` and `signature` are set.
2. **Absent versus null.** Canonicalization drops keys whose value is `undefined`. Decide whether a field that is `null` and a field that is absent must produce the same bytes, and record the decision in the format document.
3. **Old verifiers.** A pre-v3 verifier checks the legacy signature and ignores the v3 envelope, so it accepts a v3 record with weaker coverage and does not say so. Decide how that is communicated, for example through the verifier's version, a result field, or documentation.
4. **Rollout.** Decide when v2 records stop being issued, and whether the verifier must refuse a record that claims v3 but carries no v3 signature.
5. **Large messages.** Confirm whether the 4,096-byte commitment rule applies to v3 messages, which may be larger than v2 messages.

## Audit of writes after signing (question 1)

Done 2026-10-19 by reading the code. Results:

- **Signed in one step.** `BusinessTrustRecordBuilder` builds a draft with placeholder `trustRecordHash` and `signature` values, hashes it, then signs it. Any v3 canonical view must exclude both placeholder fields explicitly.
- **Attached after signing: `verifications` and `receipts`.** `appendVerification` (called by `verification-service.ts`) and `appendReceipt` (called by `receipt-service.ts`) add these arrays to the stored record after the trust record is signed. Receipts are signed separately by `ReceiptCrypto`. Verifications are outputs derived from the record. Under whole-record coverage both must be excluded, or every record that has been verified or receipted would stop verifying.
- **Executions are replaced before signing.** `replaceExecution` is called from `execution-service.ts` during the execution pipeline (`RuntimeEngine.ts`, before the trust pipeline builds and signs the record). It does not change a signed record. A test should lock this order so a later change cannot break it.
- **Overrides are not appended at runtime.** `appendOverride` has no caller in the runtime or API code, so no path changes overrides after signing.

**Recommended exclusion list for v3:** `signature`, `signatures`, `verifications`, `receipts`. Document the two excluded output fields as not covered by any signature in the verifier's format document. Receipts keep their own signature.

## Decisions recorded (2026-10-19)

1. **Excluded from the v3 signed content:** `signature`, `signatures`, `verifications`, `receipts`. Everything else at the top level is covered, including `trustRecordHash`, which is set before the v3 signature is made. The verifier's format document must state that `verifications` are not covered by any signature, and that `receipts` are covered only by their own receipt signature.
2. **Absent and `null` are different.** Keep the current canonicalization: absent keys are dropped, `null` is kept. Document this and add a test.
3. **Coverage is visible.** The verifier reports `coverage: "legacy"` or `coverage: "full"`. A caller that needs full coverage rejects `legacy`.
4. **No silent downgrade.** A record that claims `schemaVersion` 3 but has no valid v3 signature is invalid. v2 records are issued until the verifier release that supports v3 is published and deployed.
5. **One commitment rule.** The 4,096-byte Ed25519 commitment rule applies to v3 messages, and ML-DSA-65 signatures remain raw only.

## Implementation outline (after the decision)

1. Audit post-signing writes to records. Resolve question 1.
2. Add a v3 canonical view in `packages/crypto`, and sign and verify it in `VerificationCrypto.ts`, `ReceiptCrypto.ts`, and `OfflineVerifier.ts`. Gate issuance behind a configuration flag for rollout.
3. Add tests: a change to any top-level field fails v3 verification; a v2 record still verifies; the legacy signature is byte-identical before and after.
4. Add v3 test vectors to the public verifier, generated by this code. Keep the v2 vectors.
5. In the public verifier: implement the v3 rule, bump the version, update `CHANGELOG.md` and `docs/FORMAT.md`, and remove the limitation only after v3 records are issued.

## Known gap: schemaVersion is not signed (2026-10-19)

`schemaVersion` is not covered by the legacy `signature` or by `trustRecordHash`. Both use the seven legacy canonical fields, and the acceptance criteria forbid changing those bytes. So the value is not protected by any signature.

**Attack.** Someone with write access to a stored record removes `signatures` and sets `schemaVersion` to `2`, or deletes it. The legacy signature still verifies, because the signed bytes are unchanged. `VerificationCrypto.verifySignature()` then accepts the record as valid. A v3 record is downgraded to a classical-only record. Changing `updatedAt` or any other field outside the legacy view would still be caught by the v3 signature, but only if the signatures remain.

**What closes it today.** Only `HYBRID_SIGNATURE_REQUIRED=true` on the verifying server. With it set, a record with no `signatures` array is rejected whatever its `schemaVersion`. The offline verifier has no equivalent setting, so a third party that verifies a stored record offline can still be downgraded.

**Options.**

1. _Cover `schemaVersion` in the legacy signature._ Closes the gap fully but changes the legacy signed bytes, which breaks an acceptance criterion and every pre-hybrid verifier. Rejected.
2. _Require a hybrid envelope for all records issued after a cutover time._ Verifiers pin a cutover (for example in the trust file) and reject any record created after it that has no valid `signatures`. Records before the cutover keep their current rules. Needs a verifier change and a published cutover date. Recommended.
3. _Keep the server-side switch only._ Leaves the offline verifier open. Acceptable only if third parties are documented as unable to rely on v2-era records for downgrade protection.

**Decision needed before v3 issuance.** Choose option 2 or 3 and record it here. Until then, v3 must not be issued.

## Issuance gate for schema version 3

v3 issuance stays off (`HYBRID_SCHEMA_VERSION` defaults to `2`) until all of these hold:

- the downgrade gap above is closed or accepted in writing, with the option chosen recorded here;
- step 5 is published: the public verifier, the separately published verifier, and the SDKs read v3 and report `coverage`;
- the verifier's `docs/FORMAT.md` describes v3 coverage exactly as the signing code implements it.

Until the gate opens, a deployment that sets `HYBRID_SCHEMA_VERSION=3` is running an unsupported configuration. Enabling it is an operational decision, not a code default.

## Acceptance criteria

- A change to any top-level field of a v3 record fails verification.
- Every v2 record that verified before still verifies.
- The legacy `signature` bytes for a record are identical before and after this change.
- The public verifier's documentation describes v3 coverage exactly as the signing code implements it.
- The downgrade gap is closed, or accepted in writing with the option recorded in "Known gap" above, before v3 is issued anywhere.

## Addendum (2026-10-31): offline verifiers refuse legacy-only records by default

Option 2 required a verifier to reject a post-cutover record with no hybrid envelope. Without a cutover date, the offline verifier also accepted a record with its envelope removed, because a missing envelope counted as a pass. That is fixed: a record with no envelope is accepted only if it predates a supplied `hybridRequiredFrom`, or if no cutover is set and the caller passes `allowLegacyOnly: true` (the `allowLegacyOnly` trust-file field in `parmana-verifier`). A cutover, when given, decides alone. Affected: `verifyExecutionTrustRecordOffline` in `packages/crypto`, and `parmana-verifier` (Node and Python). The in-browser verifier in `docs/site/snippets/record-verifier.jsx` applies the same default, with an explicit reader opt-in.

## Decision recorded (2026-11-20): option 2, cutover

**Chosen:** option 2, a verifier-pinned cutover. Verifiers reject any record created at or after the cutover that has no valid `signatures` array, whatever its `schemaVersion`. Records before the cutover keep their current rules. The verifier already implements this as `hybridRequiredFrom` in the trust file, in both the Node and Python verifiers, with tests.

**Precondition, before the cutover takes effect.** The server attaches a `signatures` array only when `CRYPTO_MODE=hybrid` (`packages/runtime/src/BusinessTrustRecordBuilder.ts`). `CRYPTO_MODE` defaults to `single` (`.env.example`). A server still in `single` mode issues records with no hybrid envelope, and a verifier configured with the cutover refuses all of them. So the cutover instant must be the moment every issuing server runs `CRYPTO_MODE=hybrid` with `SECONDARY_SIGNATURE_PROVIDER` set and `HYBRID_SIGNATURE_REQUIRED=true`. Nothing here sets that instant automatically.

**Facts (owner, 2026-11-20).** No record has been issued in `single` mode, so no record predates the cutover, and the pre-cutover limit does not apply. The hybrid cutover instant has not been reached yet.

**Cutover instant (recorded 2026-11-20):** `2026-11-20T13:01:38Z`, the owner's instruction to set it now. Set `hybridRequiredFrom` to this value in each verifier trust file. The owner is responsible for the precondition below holding at this instant: every issuing server runs `CRYPTO_MODE=hybrid` with the secondary provider and `HYBRID_SIGNATURE_REQUIRED=true`. Record that instant here, and set `hybridRequiredFrom` to it in each verifier's trust file. Because no earlier record exists, any instant at or before the first hybrid record is also safe.

**Still open for v3 issuance:** the other conditions in the issuance gate above (step 5 publication, and `docs/FORMAT.md`). Recording this option does not by itself open v3 issuance.

## Issuance gate: status (2026-11-20)

- **Downgrade gap closed as a decision.** Option 2 is recorded above, with the cutover instant `2026-11-20T13:01:38Z`.
- **Step 5 published.** The verifier 2.0.3 is on npm (`@parmana/verifier`) and PyPI (`parmana-verifier`). The SDK `@parmana/sdk` 4.1.1 is on npm. Each reads v3 and reports `coverage`.
- **`docs/FORMAT.md` matches the signing code.** The verifier's FORMAT.md excludes `signature`, `signatures`, `schemaVersion`, `verifications` and `receipts` from v3 coverage. That is the same list as `WHOLE_RECORD_EXCLUDED_FIELDS` in `packages/crypto/src/ExecutionTrustRecordCanonicalView.ts`.

The gate is open. Enabling v3 is still a per-deployment operational step: `HYBRID_SCHEMA_VERSION=3` with `HYBRID_SCHEMA_V3_ACKNOWLEDGED=true`. The code default stays `2`. Changing the default is a separate decision, recorded as F1 in the developer portal.

## Amendment (2026-11-20): schema 3 is the default

The owner made schema 3 the default. An unset or blank `HYBRID_SCHEMA_VERSION` now means 3, and `2` remains the rollback. `HYBRID_SCHEMA_V3_ACKNOWLEDGED` is no longer read, so the issuance gate described above is retired. The sentences above that describe the default as 2 and the gate as open record the state before this amendment.

This applies only to hybrid signing. A server in `CRYPTO_MODE=single` writes no hybrid envelope and so no schema 3 record. Receipts keep their own hybrid message version 2.

The operational precondition in `docs/internal/runbooks/SCHEMA-V3-ROLLOUT.md` still applies: a hybrid server needs the ML-DSA-65 key, and that key must not be placed in an environment variable until one of the runbook's two conditions holds. The default change does not waive it.
