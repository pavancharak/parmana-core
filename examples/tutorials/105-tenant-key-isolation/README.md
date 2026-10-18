# Tutorial 105 — Tenant Key Isolation

## Objective

Show that an Execution Authorization signed for one tenant is verifiable only under that
tenant's own key, once a dedicated `tenant.<tenantId>` key has been provisioned — and show
exactly what happens when it hasn't. Mirrors `docs/VERIFICATION-GAPS.md` G-32,
`docs/CLAIMS.md` §2.28 ("Update 2026-09-09"), and
`packages/runtime/tests/unit/execution-authorization-wiring.test.ts`.

## What You'll Learn

- `RuntimeAuthorizationSigner` resolves the signing keyId per-transaction via
  `TenantKeyResolver` (`packages/runtime/src/TenantKeyResolver.ts`) instead of a single
  hardcoded key — a transaction with `metadata.tenantId: "acme-corp"` signs under
  `tenant.acme-corp` when that key has been provisioned (Scenario 1)
- An authorization signed under a tenant's key verifies under that tenant's own public key,
  and **fails** signature verification under the shared default deployment's public key —
  the isolation property itself, not just a naming convention
- A `tenantId` with no dedicated key provisioned falls back to the shared `default` key
  silently, not a failure (Scenario 2) — deliberate, so adoption is incremental per tenant,
  but it means a misspelled or unprovisioned `tenantId` produces a valid, unlabeled
  authorization under the default key with no warning (G-32's residual #3)
- A transaction with no `tenantId` at all is completely unaffected — still signs under
  `default`, exactly as every deployment without tenant keys already behaves (Scenario 3)
- Per-tenant keys need no new key storage or provider: same `FileKeyProvider` /
  `keys/<keyId>.private.pem` layout, provisioned with
  `scripts/generate-keypair.ts --key-id tenant.<tenantId>`, resolved through the same
  `KeyProvider.hasKey()` every other keyId lookup already uses

## Running the Tutorial

```bash
npx tsx examples/tutorials/105-tenant-key-isolation/run.ts
```

Generates a scratch `default` and `tenant.acme-corp` keypair into a temp `PARMANA_KEY_DIR`
(never the repo's own `keys/`) and cleans it up afterward. `tenant.globex-corp` is
deliberately never provisioned, to exercise the fallback path. Uses the real
`vendor-payment` policy from the repo's own `policies/` directory, in-memory trust records —
no HTTP server, no Supabase.

## Why This Matters

Verification could already resolve a public key per-authorization by its own `keyId`
(`EnvelopeVerifier`/`FileKeyProvider`/`FileKeyExpiryStore`, CLAIMS.md §2.28) — but until
G-32, nothing on the signing side ever produced an authorization carrying any `keyId` other
than `"default"`, so every tenant in a deployment shared one signing key regardless. This
tutorial demonstrates the fix is real, not just documented: a tenant's proof is
cryptographically bound to that tenant's key the moment one exists, with no change to
existing single-tenant behavior when it doesn't.

**Residual, not fixed by this tutorial or by G-32 itself:** per-tenant keys are still
provisioned by hand, one `generate-keypair` invocation per tenant — there is no automated
onboarding, rotation, or KMS/HSM-backed provider yet (`docs/VERIFICATION-GAPS.md` G-32,
residual #1). `PolicyEngine` itself also remains one shared, stateless, in-process instance
across every tenant — not a gap in the same sense, since it holds no key material to isolate
(residual #2).

## Next Tutorial

[Tutorial 106 - API Key Issuance (Writing a New Policy)](../106-api-key-issuance/README.md)
