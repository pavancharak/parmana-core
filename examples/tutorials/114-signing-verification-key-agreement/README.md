# Tutorial 114 — Signing and Verification Must Agree on One Key Source

## Objective

Reproduce the most significant bug found migrating the gateway signing key to AWS KMS —
signing and verification silently resolving _different_ keys, producing exactly the
"ambiguous outcome" failure this codebase's fail-closed design otherwise works hard to
avoid — and demonstrate the real fix. Mirrors `docs/VERIFICATION-GAPS.md` G-48 and
item 7 of the 2026-09-15 KMS migration troubleshooting guide (in git history).

## What You'll Learn

- `EnvelopeVerifier.resolveKey()` uses its `keyProvider` option — **when supplied at
  all** — to resolve the verification key for _every_ authorization it checks, not only
  ones signed under a non-default (tenant-scoped) keyId. This is easy to get wrong: it's
  natural to assume a `keyProvider` wired for tenant-key lookups is "inert" until a
  tenant key actually exists, but the option's mere presence changes resolution for
  every request, including the plain `"default"` case.
- `createExecutionGateway.ts` used to construct `keyProvider: new FileKeyProvider()`
  unconditionally, independent of whatever `Signer` actually produced the signature
  (`SignerBootstrap` → `LocalFileSigner` or `KmsSigner`, depending on `KEY_PROVIDER`).
  Under `KEY_PROVIDER=aws-kms`, signing correctly used the real KMS key; verification
  kept resolving whichever local key file happened to still exist on disk.
- The failure this produces looks like _three_ independent problems —
  `[signatureVerified, businessTransactionHashMatches, nonceUnseen]` all `false` — but
  it's one: `ExecutionGateway.verify()`'s own `passed`/`priorChecksPassed` gating means
  the other two checks never actually run once `signatureVerified` is `false`; they
  default to `false` without being evaluated. Scenario 1 below reproduces exactly this.
- The fix, `SignerKeyProviderAdapter`
  (`packages/crypto/src/providers/SignerKeyProviderAdapter.ts`), adapts a `Signer` to
  `KeyProvider`'s read-only surface (`getPrivateKey()` always throws — a `Signer` never
  releases private key material by design). `createExecutionGateway.ts` now resolves
  **one** `Signer` and shares it between the static `publicKey` and the
  `SignerKeyProviderAdapter` passed as `keyProvider` — the two paths are structurally
  guaranteed to agree, not just coincidentally consistent under today's configuration.

## Running the Tutorial

```bash
npx tsx examples/tutorials/114-signing-verification-key-agreement/run.ts
```

Entirely hermetic — `KEY_PROVIDER` is never set to `aws-kms` here, no AWS credentials or
network access needed. `LocalFileSigner` stands in for "whichever `Signer` backend is
actually configured": the bug and the fix are both about whether signing and
verification share _one_ resolved `Signer` instance, not about which concrete backend
(local file or AWS KMS) that `Signer` happens to wrap. A scratch key directory is used
(never the repo's own `keys/`), cleaned up afterward.

## Why This Matters

This is exactly the bug that produced a real, live incident: a legitimate Pfinite
refund request, correctly signed by production's real KMS key, failed Gateway
verification and returned an opaque HTTP 500 — indistinguishable, from the caller's
side, from a forged request or a server crash. It was found only by testing against
real production traffic, not by code review or the existing test suite (which mocks
the AWS boundary where the divergence lived) — see the troubleshooting guide's full
account of how it was actually diagnosed (querying the shared `execution_audit_events`
table for the exact failure reason).

**The generalizable lesson:** whenever a codebase introduces a _second_ way to resolve
signing/verification key material (a new backend, a new provider, a migration in
progress), every consumer of "the key" needs to resolve it through the same source —
one static value captured once and a second, independently-resolved lookup path are a
structural invitation for exactly this kind of silent divergence, especially across a
migration where the two paths are correct individually but disagree about _which_
migration state they're each in.

## Next Tutorial

[Tutorial 115 - Per-Limiter Rate Limit Stores](../115-per-limiter-rate-limit-stores/README.md)
