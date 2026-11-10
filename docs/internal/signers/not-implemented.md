# Not implemented: Azure Key Vault, GCP KMS, HSM

**Production ready: no.** These are refused at startup, so no deployment can run on them today.

- `KEY_PROVIDER` accepts `azure-key-vault`, `gcp-kms` and `hsm` as values.
- `SignerBootstrap.create()` throws at startup for each of them and names the value (claim 2.18, `docs/internal/CLAIMS.md`).
- The older `KeyBootstrap.create()` throws for every value other than `local`.

No value of `KEY_PROVIDER` falls back to file keys silently.

To make one of them production ready, it needs an implementation like `KmsSigner`, its own tests, a claim in the register, and a decision on key ID mapping. The AWS KMS signer is the model; see [aws-kms.md](aws-kms.md).
