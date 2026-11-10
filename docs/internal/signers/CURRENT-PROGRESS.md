# Signing: current progress report, 2026-11-10

## Summary

- **Production today:** Ed25519 with a local key file, alone. Everything else is built or partly built, and none of it is deployed.
- **Production ready:** Ed25519 (yes). AWS KMS (not confirmed; needs an operator check). ML-DSA-65 alone (no). Hybrid (no). Azure, GCP and HSM are not implemented.
- **Tested:** Ed25519 and offline verification pass in the local sandbox. ML-DSA-65 and hybrid suites run on CI's Node 24 runner and pass on `main`. In the sandbox (Node 22) they skip, with the reason shown.
- **Blocking the next step:** schema version 3 on the server (parmana-core #291), then hybrid signing on the server.

## Per signer

See [README.md](README.md) for the table and one file per signer:

- [ed25519.md](ed25519.md): production ready.
- [aws-kms.md](aws-kms.md): not confirmed; the production key provider is not stated in the repo.
- [ml-dsa-65.md](ml-dsa-65.md): not production ready.
- [hybrid.md](hybrid.md): not production ready.
- [not-implemented.md](not-implemented.md): Azure, GCP, HSM.
- [schema-version-3-and-verifier.md](schema-version-3-and-verifier.md): record format and the third-party verifier.

## Corrections

- The third-party verifier does verify hybrid records in 2.0.1. Claim 3.13's older caveat is out of date.
- Production records are not hybrid, so a third party cannot yet check a hybrid production record.

## Open items

1. Confirm the production `KEY_PROVIDER` and the AWS role (operator).
2. Schema version 3 on the server (parmana-core #291).
3. Hybrid custody decision: local files only, or a KMS path for hybrid.
4. Confirm the Node 24 runtime in production.
5. Check the published verifier against single-algorithm ML-DSA-65 records.
6. A staging hybrid record, verified offline end to end.
7. A CI guard so ML-DSA-65 suites cannot skip silently on CI (patch prepared, not yet a PR).

## Next

Items 2 and 6 are the gate for hybrid. Item 1 is needed for KMS, whatever is decided about hybrid.
