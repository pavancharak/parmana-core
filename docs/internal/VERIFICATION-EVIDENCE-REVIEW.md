# Verification evidence review (parmana-core)

Status: findings and planned fix. The fix is not implemented or merged.
Scope: generic. These services serve every connector, not only GitHub.

## Summary

The signature check in `VerificationCrypto.verify()` is correct for the fields it covers. The evidence built on top of it is not checked:

- A `Verification` record is stored with a status (VERIFIED or FAILED) and no signature.
- Receipt generation trusts the stored status instead of rechecking the record.
- The verify endpoint returns the stored status without rechecking.

## Findings

### F1. Verification status is unsigned

`Verification` (packages/shared/src/domain/verification.ts) holds `status`, `message`, `verifiedAt` and `trustRecordHash`. It has no signature. It is appended after the record is signed (`appendVerification`), so anyone who can write to storage can change a FAILED status to VERIFIED without detection.

### F2. Receipts trust the stored status

`ReceiptService.generate()` (packages/runtime/src/services/receipt-service.ts) loads the record, reads the last `Verification`, and if its status is VERIFIED, signs a receipt over `crypto.hash(trustRecord)`. It does not rerun the checks. A record changed in storage, with its stored status set to VERIFIED, can therefore receive a valid core-signed receipt, and that receipt's hash is computed over the changed content.

### F3. The verify endpoint returns the stored status

`packages/api/src/routes/verify-get.ts` returns `record.verifications.at(-1)` as stored, without recomputing it.

### F4. Scope of the signature check

The legacy signature covers seven top-level fields: `trustRecordId`, `businessTransactionId`, `transaction`, `authorization`, `overrides`, `executions`, `createdAt`. `verifications` and `receipts` are outside it, as expected, because they are appended after signing. The `schemaVersion` field is covered only by the hybrid signature, not the legacy one.

### F5. Standalone verifier not reviewed

`parmana-verifier` (the offline checker) is a separate repository, not reviewed here. The security review (governance/security-reviews/FINAL-REPORT.md, F12) recorded that it accepted schema version 2 records that sign only seven fields. That finding is marked fixed in parmana-verifier #36, which has not been checked.

## Planned fix

1. **Recheck before receipts.** `ReceiptService.generate()` reruns the same checks as `VerificationService` (hash, signature, authorization binding, chain) on the current record, and refuses to sign if any fail. The stored status is not used.
2. **Recompute on the verify endpoint.** The endpoint returns a fresh result from the current record. It reports the stored status alongside, so a mismatch is visible. It does not write.
3. **Tests.**
   - Tamper with `executions` after signing: receipt generation refuses.
   - A record whose stored status is VERIFIED but whose content has changed: the recomputed result is FAILED.
   - An untampered record: receipt generation succeeds.

Existing tests that build a receipt from a fake record (`receipt.integration.test.ts`, `receipt-hybrid.integration.test.ts`) will need real signed records, or the checks will refuse them.

## Where this belongs

parmana-core, next to the existing `docs/internal/VERIFICATION-GAPS.md`. Add a new section for F1 to F3, with the fix as its planned remedy.

## Open questions

- Whether a valid record with no stored verification should receive a receipt. The planned fix allows it, since the check is recomputed.
- Whether the verify endpoint's response shape changes. The planned fix keeps the stored status as a separate field so existing clients still see it.
