# Key management

[Portal home](../README.md) · [Security](README.md) · [Schema version 3](schema-v3.md) · [Verifier](../sdk/verifier.md)

This page sets out how the keys that sign Execution Trust Records are held, rotated and retired. It describes what the code does today. Where a practice needs something the code does not do, the page says so.

## What the code supports

| Need                                         | Supported today                   | How                                                                                                                                                                          |
| -------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classical signing key in a cloud key service | Yes, in `CRYPTO_MODE=single` only | `KEY_PROVIDER=aws-kms`. The Doctor check refuses `CRYPTO_MODE=hybrid` with `aws-kms`.                                                                                        |
| Hybrid signing (ed25519 plus dilithium3)     | Yes, with file keys               | `CRYPTO_MODE=hybrid` with `KEY_PROVIDER=local`. Key files are read from `PARMANA_KEY_DIR`.                                                                                   |
| Signing keys read from a secrets manager     | **No**                            | The secrets manager setting (`aws-secrets-manager`) resolves connector credentials, not signing keys. A deployment must put signing key files into `PARMANA_KEY_DIR` itself. |
| Pinned fingerprints and validity windows     | Yes, in the verifier              | The trust file lists each key with `keyId`, `algorithm`, `fingerprint`, `validFrom`, `validUntil` and `compromised`.                                                         |

## Interim policy

1. **Single-mode signing:** keep the classical key in the cloud key service, with `KEY_PROVIDER=aws-kms` and `AWS_REGION` set. Do not set `CRYPTO_MODE=hybrid` with it.
2. **Hybrid signing:** keep both key files in `PARMANA_KEY_DIR` with `KEY_PROVIDER=local`. The deployment writes them there at start-up from a secrets manager. The secrets manager holds the files; it is not the server's signing-key source. Restrict who can read the folder, and make the files readable only by the server's user.
3. **Pinning:** every verifier pins each key by fingerprint. Obtain a fingerprint with `parmana-verify key-fingerprint <public-key.pem>`, and check it out of band before adding it to a trust file.

## Rotation

1. Generate the new key with a new `keyId`. Do not reuse an old `keyId`.
2. Add the new key to each trust file with its fingerprint and a `validFrom` at or before the first record it will sign.
3. Point the server at the new key, and keep the old key in the trust file until its records are no longer needed.

## Retirement

- **Routine retirement:** set the key's `validUntil` in the trust file. The window excludes that instant, so records created at or after it are not accepted under that key.
- **Compromise:** set `compromised: true` in the trust file. Verifiers then refuse that key for every record. Records signed before the compromise are refused too, so decide before doing this whether those records need re-issuing.

## What this policy does not cover yet

- The server does not read signing keys from a secrets manager. Until it does, the step that puts the key files in place is an operator procedure, and it needs its own audit.
- Hybrid signing cannot use a cloud key service. A dilithium3 key has no managed service in this code, so it stays a file.
- Rotation is not automated, and the server does not check the trust file. Each verifier must be updated by hand.

The decision to change any of these belongs to the owner.
