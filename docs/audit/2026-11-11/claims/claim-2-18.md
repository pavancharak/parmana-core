# 2.18 Key Provider Input Validation

Source: CLAIMS.md (commit d1d63c6), lines 415-451.

## Exact claim text

## 2.18 Key Provider Input Validation

Two behaviours protect the key layer. First, a key identifier cannot be used to escape the key directory. Second, a configured key custody model that is not implemented fails at startup rather than falling back silently.

**Path traversal is refused.** `FileKeyProvider` rejects any key ID that does not match `^[A-Za-z0-9._-]+$` before it builds a file path from it. A crafted key ID such as `../` is refused before the filesystem is touched.

**Unimplemented custody is refused.** `KEY_PROVIDER` accepts `local`, `aws-kms`, `azure-key-vault`, `gcp-kms`, and `hsm`. Only two of these have an implementation:

- `local` uses `FileKeyProvider`, which reads keys from `PARMANA_KEY_DIR`.
- `aws-kms` uses `KmsSigner` (ADR-0009) for signing. `SignerBootstrap.create()` resolves it.

`SignerBootstrap.create()` throws at startup for `azure-key-vault`, `gcp-kms`, and `hsm`, and names the value. The older `KeyBootstrap.create()` throws for every value other than `local`. No value of `KEY_PROVIDER` makes Parmana fall back to file-based keys without saying so.

**The AWS KMS signer maps key IDs safely.** `KmsSigner` turns a logical key ID into a KMS alias. A bare ID such as `default` becomes `alias/default`, and a dotted tenant ID such as `tenant.acme` becomes `alias/tenant/acme`, because KMS alias names cannot contain dots. It refuses any ID that would land under AWS's reserved `alias/aws/` prefix. It refuses a full key ARN, because an ARN can name a key in another AWS account. It treats a UUID-shaped ID as an alias name in the configured account, never as a raw key ID.

**Credentials.** `KmsSigner` uses no static AWS access keys. When `AWS_ROLE_ARN` is set, it exchanges Vercel's OIDC token for short-lived credentials. Whether that role is provisioned in a given deployment is an operator step, and this claim does not verify it.

**Scope and limits.**

- Azure Key Vault, GCP KMS, and HSM are not implemented. Configuring any of them fails at startup.
- The path check covers the file-based provider only. It does not check the KMS key ID beyond the rules above.
- Each refusal is covered by a test case, and the bootstrap tests check each non-local value.

**Evidence.**

- `packages/crypto/src/providers/key/FileKeyProvider.ts` (`assertValidKeyId`)
- `packages/crypto/tests/unit/file-key-provider.test.ts` (path-traversal key IDs rejected in `getPrivateKey`, `getPublicKey`, and `hasKey`)
- `packages/crypto/src/SignerBootstrap.ts` (`aws-kms` resolves `KmsSigner`; other non-local values throw)
- `packages/crypto/tests/unit/signer-bootstrap.test.ts`
- `packages/crypto/src/KeyBootstrap.ts` (throws for any value other than `local`)
- `packages/crypto/tests/unit/key-bootstrap.test.ts` (refusal for each non-local value)
- `packages/crypto/src/providers/signer/KmsSigner.ts` (key ID mapping, ARN and reserved-prefix refusal, `AWS_ROLE_ARN` exchange)
- `packages/crypto/tests/unit/kms-signer.test.ts` (key ID mapping cases, signing, public key, metadata, caching)
- `packages/shared/src/config/KeyProviders.ts` (the accepted values)

Dated updates, including the 2026 fix that made `KmsSigner` map key IDs to aliases and the live check against a real AWS KMS key, are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).


## Cited evidence paths

- `packages/crypto/src/KeyBootstrap.ts`: EXISTS
- `packages/crypto/src/SignerBootstrap.ts`: EXISTS
- `packages/crypto/src/providers/key/FileKeyProvider.ts`: EXISTS
- `packages/crypto/src/providers/signer/KmsSigner.ts`: EXISTS
- `packages/crypto/tests/unit/file-key-provider.test.ts`: EXISTS
- `packages/crypto/tests/unit/key-bootstrap.test.ts`: EXISTS
- `packages/crypto/tests/unit/kms-signer.test.ts`: EXISTS
- `packages/crypto/tests/unit/signer-bootstrap.test.ts`: EXISTS
- `packages/shared/src/config/KeyProviders.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/crypto/tests/unit/file-key-provider.test.ts` | passed | 7 | 7 | 0 |
| `packages/crypto/tests/unit/key-bootstrap.test.ts` | passed | 7 | 7 | 0 |
| `packages/crypto/tests/unit/kms-signer.test.ts` | passed | 31 | 31 | 0 |
| `packages/crypto/tests/unit/signer-bootstrap.test.ts` | passed | 8 | 8 | 0 |
