# 2.28 Key Resolution by Key ID, with Expiry and Revocation

Source: CLAIMS.md (commit d1d63c6), lines 988-1012.

## Exact claim text

## 2.28 Key Resolution by Key ID, with Expiry and Revocation

**Claim.** The verifier resolves the signing key for each authorization by its `keyId`, rather than always using one configured key. A key can be marked with an expiry time or revoked, and a verification that depends on such a key fails closed. The same mechanism lets more than one key be valid during a rotation, without a restart.

**How it works.** `EnvelopeVerifier` takes optional `keyProvider` and `keyExpiryStore` options. With `keyProvider` set, each authorization's `keyId` is looked up through it. With `keyExpiryStore` also set, the key is checked first: a revoked key, or one whose expiry time has passed, is refused before its key material is read. A key that cannot be found, read, or checked is refused the same way. The verifier does not fall back to the static key in these cases. Without `keyProvider`, verification uses the single configured public key, as before, and key resolution is not part of its checks.

`FileKeyExpiryStore` is the reference store. It reads `key-expiry.json` from the key directory. A key ID that is not in the file is treated as valid with no expiry. A malformed file stops verification rather than being read as "no expiry".

**Tenant keys (opt-in).** When a transaction carries a tenant ID, `FileTenantKeyResolver` can sign its authorization with a dedicated `tenant.<id>` key, if that key has been provisioned. A transaction without a tenant ID, or for a tenant with no key, is signed with the shared `default` key. An API key may only name the tenants in its `allowedTenantIds` list; a request for another tenant is refused with `TENANT_NOT_ALLOWED`. Under `KEY_PROVIDER=aws-kms`, tenant key IDs map to KMS aliases (`tenant.<id>` becomes `alias/tenant/<id>`); a key ID that would fall under AWS's reserved `alias/aws/` prefix is refused. This mapping has been tested with unit tests and an example, not against a live AWS account.

**Limits.** Tenant keys are provisioned by hand (`scripts/generate-keypair.ts --key-id tenant.<id>`). There is no automatic rotation, and no KMS or HSM support for the expiry file. The durable evidence records (Trust Records, Refusal Records and Audit Events) take their key IDs from `PARMANA_VERIFICATION_KEY_ID` and `PARMANA_VERIFICATION_SECONDARY_KEY_ID`, which is how they rotate. See `docs/internal/VERIFICATION-GAPS.md`, gaps 32 and 53.

Evidence

- `packages/envelope-verifier/src/EnvelopeVerifier.ts` (`keyProvider` and `keyExpiryStore` options, `keyValid` check)
- `packages/execution-gateway/src/ExecutionGateway.ts` (passes both options to its verifier)
- `packages/crypto/src/KeyExpiry.ts` (`KeyExpiryStore`, `FileKeyExpiryStore`)
- `packages/crypto/tests/unit/key-expiry.test.ts`
- `packages/envelope-verifier/tests/unit/envelope-verifier.test.ts` (key resolution, expiry, revocation, and the unchanged static-key behaviour)
- `packages/runtime/src/TenantKeyResolver.ts` (`FileTenantKeyResolver`)
- `packages/runtime/tests/unit/tenant-key-resolver.test.ts`
- `packages/crypto/src/providers/signer/KmsSigner.ts` (`resolveKmsKeyId`)

Dated updates for this claim are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).


## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `packages/crypto/src/KeyExpiry.ts`: EXISTS
- `packages/crypto/src/providers/signer/KmsSigner.ts`: EXISTS
- `packages/crypto/tests/unit/key-expiry.test.ts`: EXISTS
- `packages/envelope-verifier/src/EnvelopeVerifier.ts`: EXISTS
- `packages/envelope-verifier/tests/unit/envelope-verifier.test.ts`: EXISTS
- `packages/execution-gateway/src/ExecutionGateway.ts`: EXISTS
- `packages/runtime/src/TenantKeyResolver.ts`: EXISTS
- `packages/runtime/tests/unit/tenant-key-resolver.test.ts`: EXISTS

## Test results from the full run (vitest full run, 403 files, 0 failed)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/crypto/tests/unit/key-expiry.test.ts` | passed | 7 | 7 | 0 |
| `packages/envelope-verifier/tests/unit/envelope-verifier.test.ts` | passed | 22 | 22 | 0 |
| `packages/runtime/tests/unit/tenant-key-resolver.test.ts` | passed | 5 | 5 | 0 |
