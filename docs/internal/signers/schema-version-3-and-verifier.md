# Schema version 3, hybrid records, and the third-party verifier

This file covers the two steps that let a third party check a hybrid-signed record: the record format (schema version 3) and the verifier that checks it.

## Where things stand (2026-11-10)

| Item                                                            | Status                                                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Server issues schema version 2 records                          | **Yes**. Schema version 3 is not switched on (claim 2.59; parmana-core #291).                                                                    |
| Server issues hybrid-signed records                             | **No**. `CRYPTO_MODE` is `single` everywhere, including production (claim 3.13).                                                                 |
| Python and TypeScript SDKs verify hybrid records in full        | **Yes** (claim 2.59).                                                                                                                            |
| Published verifier 2.0.1 verifies the hybrid `signatures` array | **Yes**. `verifyHybridSignatures` is in `src/verify.mjs` of `@parmana/verifier` 2.0.1, and the check runs for records with a `signatures` array. |
| A third party can check a hybrid record today                   | **Only if one exists.** No production record is hybrid yet, so there is nothing to check.                                                        |

## Correction to an out-of-date caveat

Claim 3.13 once said the separately published verifier "does not yet recognize the `signatures` envelope" and checked the legacy `signature` field only. The claim's update of 2026-10-03 says that is resolved for the verifier in that version and later. The 2.0.1 source and package confirm it. Treat the older caveat as history.

## What the verifier does (2.0.1)

- A record with no `signatures` array is checked against the legacy `signature` field, as before.
- A record with a `signatures` array is checked as a hybrid envelope. It needs at least two entries, one per algorithm, and each must verify.
- For schema version 3, the signed message covers every top-level field except `signature`, `signatures`, `schemaVersion`, `verifications` and `receipts` (`WHOLE_RECORD_EXCLUDED_FIELDS`).
- A schema version 3 record with no `signatures` array is refused: a whole-record signature is required.
- Records with no `schemaVersion`, or with schema version 2, are refused unless the trust file opts in (`allowLegacyV2`, from 2.0.0).
- ML-DSA-65 entries need Node 24 or later with OpenSSL 3.5 or later.

## What is still missing before a hybrid record can be checked in production

1. **Schema version 3 on the server** (parmana-core #291). Without it, the server issues schema version 2 records, which cover only seven top-level fields.
2. **Hybrid signing on the server**, with `CRYPTO_MODE=hybrid`. This needs the secondary key and the open blockers in [hybrid.md](hybrid.md).
3. **An end-to-end check:** a hybrid record from the staging server, verified offline by the published verifier 2.0.1 with both public keys, and the result recorded here.

## How a third party checks a hybrid record

1. Install the verifier: `npm install -g @parmana/verifier@2.0.1`, or `pip install parmana-verifier==2.0.1`.
2. Get the record, the trust file, and the public keys for both `default` (Ed25519) and `default-secondary` (ML-DSA-65).
3. Run the verifier against the record. A hybrid result is valid only if the legacy `signature` and every `signatures` entry pass, and the `coverage` field reports `full`.

## When it changes

Update this file when schema version 3 is switched on, when hybrid signing is enabled, and after the first staging record has been verified end to end.
