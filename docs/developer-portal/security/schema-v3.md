# Schema version 3: whole-record signatures, the cutover and the rollout

[Portal home](../README.md) · [Security](README.md) · [Evidence verification](evidence-verification.md) · [Environment variables](../reference/environment-variables.md) · [FINDINGS](../FINDINGS.md)

This page is the complete reference for schema version 3 (v3). It says what v3 covers, what it does not, how the server and the verifiers are configured, the decision that was made about the downgrade gap, and the steps to roll it out. Where a statement comes from the code, the decision record or a run, it says so. Where something is not known, it says that too.

The decision record is [ADR-0016](../../../docs/internal/adr/ADR-0016-Whole-Record-Signature-Schema-V3.md).

## Summary

- **Schema 2** signs seven top-level fields with the legacy signature. A change to any other field, such as `updatedAt`, still verifies. The verifier reports `coverage: "legacy"`. It was the default until 2026-11-20, and is now the rollback setting.
- **Schema 3** signs every top-level field except five excluded fields, with hybrid signatures (ed25519 and dilithium3). A change to any covered field fails. The verifier reports `coverage: "full"`.
- **Schema 3 is the default** (decided 2026-11-20, ADR-0016). An unset `HYBRID_SCHEMA_VERSION` means 3. The former acknowledgement gate, `HYBRID_SCHEMA_V3_ACKNOWLEDGED`, is no longer read. The default applies to hybrid signing: a server in `CRYPTO_MODE=single` issues records with no hybrid envelope, and so no schema 3 record.
- **The downgrade gap is decided.** Someone who can write to stored records can remove the hybrid envelope and set the version back to 2. The chosen fix (ADR-0016 option 2) is a cutover instant. From that instant, a record without a valid hybrid envelope is rejected. The instant is `2026-11-20T13:01:38Z`.
- **The cutover holds only if every issuing server runs hybrid signing.** A server in `CRYPTO_MODE=single` issues records with no hybrid envelope, and every such record would be rejected after the cutover. This is a precondition, not something the repository can check.

## What each schema covers

| Schema version         | Signatures                                                             | Fields covered                                                                                                                                                                                | Coverage reported |
| ---------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **2** (or unversioned) | Legacy `signature` (ed25519), plus `signatures` only when hybrid is on | `trustRecordId`, `businessTransactionId`, `transaction`, `authorization`, `overrides`, `executions`, `createdAt`                                                                              | `legacy`          |
| **3**                  | Hybrid `signatures`: ed25519 and dilithium3, both required             | Every top-level field except `signature`, `signatures`, `schemaVersion`, `verifications` and `receipts`. `schemaVersion` is part of the hybrid message, so changing it breaks the signatures. | `full`            |

The exclusion list is the same in the verifier's `docs/FORMAT.md` and in the signing code (`WHOLE_RECORD_EXCLUDED_FIELDS` in `packages/crypto/src/ExecutionTrustRecordCanonicalView.ts`). It was checked against both on 2026-11-20.

### What v3 still does not cover

- **`verifications` and `receipts` are not covered.** They are attached after signing. A receipt carries its own signature, which is checked separately.
- **The legacy `signature` does not cover `schemaVersion`.** That is the root of the downgrade gap. v3 covers `schemaVersion` only through its hybrid message. If the hybrid envelope is removed, nothing signs the version, so the cutover is what closes the gap.
- **Receipts keep their own hybrid version.** `ReceiptCrypto` signs receipts with hybrid message version 2 (a constant in `packages/crypto/src/ReceiptCrypto.ts`). The default schema change does not affect receipts.
- **v3 does not prove the business action happened.** It proves the record is unchanged since the key holder signed it. Use the connector's own records to show the action ran.

### Verified results

The following were checked in this portal, on records from the same run (see [Evidence verification](evidence-verification.md) for the commands):

| Change to the record                               | Schema 2 (`legacy`)                                   | Schema 3 (`full`)              |
| -------------------------------------------------- | ----------------------------------------------------- | ------------------------------ |
| A covered field (`executions[0].decision.outcome`) | Detected: `trustRecordHash mismatch`, signature fails | Detected                       |
| An uncovered field (`updatedAt`)                   | **Not detected: `valid: true`**                       | Detected: both signatures fail |

With the v3 settings below, a record reported `"coverage":"full"` under the verifier's default trust rules (no legacy flags). The TypeScript and Python SDK offline checks agreed (`coverage: "full"`), and a tampered copy was rejected by all three.

## Server configuration

| Variable                        | Default   | Purpose                                                                                                                                                          |
| ------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CRYPTO_MODE`                   | `single`  | `hybrid` makes the server add a `signatures` array to each record. In `single` mode there is no hybrid envelope.                                                 |
| `PRIMARY_SIGNATURE_PROVIDER`    | `ed25519` | The primary algorithm.                                                                                                                                           |
| `SECONDARY_SIGNATURE_PROVIDER`  | none      | Required when `CRYPTO_MODE=hybrid`. Must differ from the primary. The server refuses to start otherwise.                                                         |
| `HYBRID_SCHEMA_VERSION`         | `3`       | `2` or `3`. Unset means 3. `2` is the rollback. Any other value is refused at start-up.                                                                          |
| `HYBRID_SCHEMA_V3_ACKNOWLEDGED` | not read  | Ignored. It was the issuance gate until schema 3 became the default. Remove it from environment files.                                                           |
| `HYBRID_SIGNATURE_REQUIRED`     | `false`   | When `true`, verifying a record with no `signatures` array, or a partial one, is a rejection, whatever its version.                                              |
| `HYBRID_REQUIRED_FROM`          | none      | The cutover (UTC, ending in `Z`). From this instant, a record needs a valid hybrid envelope. Enforced by the server's verification path as well as by verifiers. |

Start-up refusals you will see:

- `CRYPTO_MODE=hybrid` without `SECONDARY_SIGNATURE_PROVIDER`, or with the same provider as the primary.
- A `HYBRID_SCHEMA_VERSION` that is neither `2` nor `3`.
- A `HYBRID_REQUIRED_FROM` that is not a UTC ISO-8601 timestamp.

If `CRYPTO_MODE=hybrid` is set but no secondary provider is, the server releases the action and then fails to write the record. Its response is `500` with `Secondary signature provider is not configured.`. The start-up check above now stops this before any action is released.

## Verifier configuration

The verifiers are the parties who rely on the record, so they set the policy for what they accept.

- **The trust file** (`trust.json` for the standalone verifier):
  - `hybridRequiredFrom`: the cutover. It must be the same instant the server uses.
  - `allowLegacyV2`: `true` to accept schema 2 records. Without it, schema 2 and unversioned records are refused, because they sign seven fields.
  - `allowLegacyOnly`: `true` to accept a record with no hybrid envelope where no cutover is set. Refused by default.
- **Coverage in the result.** Every verifier reports `coverage`. A caller that needs the whole record covered must reject `legacy`.
- **SDK option.** The TypeScript SDK takes `{ requireFullCoverage: true }` as the third argument to `verifyExecutionTrustRecordOffline`. The Python SDK takes `require_full_coverage=True` to `verify_execution_trust_record_offline`. With it, a record that is not `full` is `valid: false`, and the error names the option. The default result is unchanged.

## The decision

ADR-0016 listed three ways to close the downgrade gap:

1. Cover `schemaVersion` in the legacy signature. **Rejected.** It changes the legacy signed bytes, which breaks an acceptance criterion and every pre-hybrid verifier.
2. **Require a hybrid envelope for records created at or after a pinned cutover.** **Chosen (2026-11-20).**
3. Keep only the server-side switch. Leaves offline verification open, so third parties could be downgraded.

The owner's decisions on 2026-11-20:

- **Option 2 is chosen.** The verifier already implements it as `hybridRequiredFrom`.
- **The cutover instant is `2026-11-20T13:01:38Z`.** It is set now.
- **No record was issued in `single` mode.** So no record predates the cutover, and the limit for pre-cutover records does not apply.

**The precondition is the owner's to keep.** At the cutover instant, every server that issues records must run `CRYPTO_MODE=hybrid`, with `SECONDARY_SIGNATURE_PROVIDER` set and `HYBRID_SIGNATURE_REQUIRED=true`. The repository cannot check this from where it runs. If a server is still in `single` mode after the instant, the verifier rejects its new records.

### Issuance gate

ADR-0016 set four conditions for issuing v3. Each was checked on 2026-11-20:

| Condition                                                                   | Status | Evidence                                                                                                  |
| --------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| The downgrade gap is closed, or accepted in writing, with the option chosen | Met    | Option 2 recorded in ADR-0016, cutover `2026-11-20T13:01:38Z`                                             |
| The public verifier and the SDKs read v3 and report `coverage`              | Met    | `parmana-verifier` 2.0.3 on npm and PyPI; `@parmana/sdk` 4.1.1 on npm; both read v3 and report `coverage` |
| `docs/FORMAT.md` describes v3 coverage exactly as the code signs it         | Met    | Exclusion list matches `WHOLE_RECORD_EXCLUDED_FIELDS` in the signing code                                 |
| The downgrade decision is recorded in the ADR                               | Met    | ADR-0016, "Decision recorded" and "Issuance gate: status"                                                 |

The gate is met, and on 2026-11-20 the owner made schema 3 the default. The acknowledgement that the gate used to require is no longer read.

## Rollout

Each step is for each deployment. Do not skip a step.

1. **Confirm the precondition.** Every server that issues records runs `CRYPTO_MODE=hybrid`, with a secondary provider that differs from the primary, and `HYBRID_SIGNATURE_REQUIRED=true`. Keep this set for the lifetime of the deployment.
2. **Set the cutover on the server:** `HYBRID_REQUIRED_FROM=2026-11-20T13:01:38Z`.
3. **Set the cutover in every verifier trust file:** `hybridRequiredFrom: "2026-11-20T13:01:38Z"`. Do this before, or with, step 4, so a verifier never accepts a record that a stricter one would refuse.
4. **Confirm the server signs schema 3.** There is nothing to enable: schema 3 is the default. Restart the server, and confirm that a new hybrid record reports `schemaVersion` 3. If you must roll back, set `HYBRID_SCHEMA_VERSION=2`.
5. **Check one record end to end.** Create a record and verify it offline. It should report `valid: true` and `coverage: "full"`. Change one covered field in a copy and confirm it is rejected.
6. **Tell consumers what to require.** Each consumer that needs the whole record should require `coverage: "full"`, or use `requireFullCoverage`.

### Rollback

Setting `HYBRID_SCHEMA_VERSION` back to `2` returns new records to schema 2. Keep the hybrid settings and the cutover in place, so records stay hybrid-signed and the cutover stays enforced. **Not tested in this repository. Check it on a non-production deployment before relying on it.**

## Cost: size and speed

Measured on 2026-11-20 with the built packages in this repository, using the server's own signing code (`VerificationCrypto`) and the TypeScript SDK's offline verifier. The record was a minimal one (one transaction, no executions), so treat the byte counts as the cost of the signature envelope, not a size for production records. To reproduce these figures on your hardware, run `npx tsx scripts/bench-whole-record-cost.ts 1000` from the repository root after `npm run build:packages`. Each figure is the average over 1000 iterations, from two runs that agreed to within about 0.1 ms.

| Mode                           | Record size | Sign          | Offline verify | Coverage reported |
| ------------------------------ | ----------- | ------------- | -------------- | ----------------- |
| Single (legacy signature only) | 600 bytes   | about 0.15 ms | about 0.15 ms  | `legacy`          |
| Schema 2, hybrid               | 5,248 bytes | about 1.7 ms  | about 0.6 ms   | `legacy`          |
| Schema 3, hybrid               | 5,248 bytes | about 1.6 ms  | about 0.6 ms   | `full`            |

What this means:

- **Schema 2 and schema 3 cost the same.** Both carry the same hybrid envelope. Going to v3 changes what is covered, not how much it costs.
- **The hybrid envelope is the cost.** Adding it multiplies the record size by about 8.7 for this record (an extra 4,648 bytes). Signing is about 10 times slower than the single signature, and verifying about 4 times slower.
- **The overhead is per record, not per field.** The signatures have a fixed size, so the extra bytes do not grow with the record's payload. Records with large payloads gain proportionally less.
- **The environment was a 4-vCPU Linux container on Node 24.22.3.** Other hardware will differ. Re-measure on the deployment's own machines before sizing storage or latency budgets.
- **Algorithm names.** `dilithium3` is an alias for ML-DSA-65 in this codebase, so the configuration above and the benchmark used the same algorithm.

## Known limits and open items

- **The default was changed on 2026-11-20** by the owner's decision, recorded in [FINDINGS F1](../FINDINGS.md#f1-default-record-schema-version-3-since-2026-11-20-was-version-2-signing-7-fields). Changing it again is a new decision.
- **Third-party readers are unknown, and the owner reports no active consumer.** Only the TypeScript and Python SDKs and `parmana-verifier` 2.0.3 have been checked to read v3. Whether other tools do is not known (F11). Any consumer added later must read v3 before it receives records.
- **Size and speed were measured** (see [Cost](#cost-size-and-speed)). Re-measure on the deployment's own hardware before sizing storage or latency budgets.
- **The cutover and the default rest on owner statements.** The owner reports that no `single`-mode record exists and that no consumer is active. The repository cannot confirm either, or that every issuing server is in hybrid mode.
- **Verifier-side changes are in another repository.** The `hybridRequiredFrom` and `allowLegacyV2` handling lives in `parmana-verifier`. This portal documents it but does not change it.

## Related

- [ADR-0016](../../../docs/internal/adr/ADR-0016-Whole-Record-Signature-Schema-V3.md): the decision record and the issuance gate.
- [Evidence verification](evidence-verification.md): how to verify a record offline.
- [Environment variables](../reference/environment-variables.md): every setting above, with its default.
- [Security](README.md#schema-versions-and-coverage): the summary this page expands.
