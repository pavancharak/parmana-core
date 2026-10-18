# Tutorial 113 — KMS Key ID Resolution

## Objective

Show, against the real code (not a reimplementation), that `KmsSigner` correctly maps
every logical keyId this codebase actually produces into a format AWS KMS accepts —
and reproduce, in words, exactly what used to happen before this existed. Mirrors
`docs/VERIFICATION-GAPS.md` G-48 (item 1) and
`packages/crypto/tests/unit/kms-signer.test.ts`'s `resolveKmsKeyId` coverage.

## What You'll Learn

- Every signing call site in this codebase (`VerificationCrypto`, `RefusalCrypto`,
  `AuditEventCrypto`, `ReceiptCrypto`, `PolicyChangeCrypto`, `ExecutionChainCrypto`,
  `RuntimeAuthorizationSigner`, `GatewayPaytmAdapter`) passes a _logical_ keyId —
  `"default"` (`KeyProvider.DEFAULT_KEY_ID`) in the common case, `"tenant.<id>"` for a
  provisioned tenant key (Tutorial 105) — never a real AWS identifier.
- AWS KMS's `Sign`/`GetPublicKey`/`DescribeKey` APIs require their `KeyId` parameter to
  be one of exactly three shapes: a raw key ID (UUID), a full key ARN, or an alias
  name/ARN (which must carry the `alias/` prefix). A bare word like `"default"` is none
  of those.
- `resolveKmsKeyId` (`packages/crypto/src/providers/signer/KmsSigner.ts`, exported for
  exactly this kind of direct demonstration) maps a bare logical keyId to
  `alias/<keyId>` — mirroring `FileKeyProvider`'s own `keyId` → `<keyId>.private.pem`
  filename convention — and passes an already-qualified `alias/` name through unchanged,
  so it never double-prefixes it. KMS alias names cannot contain `.`, so each `.` becomes
  `/`: the tenant key `tenant.acme-corp` is `alias/tenant/acme-corp`. A logical keyId never
  contains `/`, so two keyIds never map to the same alias. It refuses a full key ARN: a
  keyId often comes from the record being verified, and an ARN can name a key in another
  AWS account. It also refuses AWS's reserved `alias/aws/` prefix. A UUID shaped keyId is
  treated as an alias name, never as a raw key ID.

## Running the Tutorial

```bash
npx tsx examples/tutorials/113-kms-key-id-resolution/run.ts
```

Pure string-mapping logic — no AWS credentials, network access, or `AWS_REGION`
required. This is the exact function `KmsSigner.sign()`, `.getPublicKey()`,
`.getMetadata()`, and `.hasKey()` all call before making any real AWS API request.

## Why This Matters

Before this fix, `KmsSigner.sign("default", data)` called AWS KMS's `SignCommand` with
`{ KeyId: "default", ... }`. AWS KMS rejects this immediately
(`ValidationException`/`NotFoundException`) — there is no AWS-side configuration that
can make a bare, unprefixed string resolve to a real key, regardless of how the actual
KMS key or its aliases are named. Every real signing and verification call failed the
moment `KEY_PROVIDER=aws-kms` was first turned on in production
(item 1 of the 2026-09-15 KMS migration troubleshooting guide, in git history). The fix
also means `alias/default` **must exist in AWS** for the logical `"default"` key to
resolve at all — see `docs/site/deployment/aws-kms-signing.mdx`, step 1.

## Next Tutorial

[Tutorial 114 - Signing and Verification Must Agree on One Key Source](../114-signing-verification-key-agreement/README.md)
