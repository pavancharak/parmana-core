# Tutorial 110 — Hybrid-Signature Downgrade Protection

## Objective

Close PQC audit RED-4 (`docs/VERIFICATION-GAPS.md`), the most serious finding: a genuinely
hybrid-signed record's ML-DSA-65 signature could be silently stripped by anyone with mere
storage/transport access to a copy of it — no private key required — and the record would
still verify as if it were only ever classically signed. This defeats hybrid mode's entire
purpose (surviving a future break of the classical algorithm). Fixed with an opt-in
`HYBRID_SIGNATURE_REQUIRED` flag, deliberately policy-gated rather than hash-based: baking
`schemaVersion` into the hash was considered and rejected, since it would invalidate every
already-issued signature, hybrid or not — a real breaking change this remediation's own
constraints ruled out.

## What You'll Learn

- A genuinely hybrid-signed record (`schemaVersion: 2`, both an Ed25519 and a ML-DSA-65
  entry in `signatures`) verifies (Scenario 1)
- Under the **default** policy (`HYBRID_SIGNATURE_REQUIRED` unset), stripping
  `schemaVersion`/`signatures` entirely still verifies — this is deliberate, additive
  backward compatibility for records signed before a deployment ever turned hybrid mode
  on, proven by this codebase's own pre-existing test (Scenario 2)
- Under the **strict** policy (`HYBRID_SIGNATURE_REQUIRED=true`), the identical stripped
  record is now rejected outright — the downgrade a deployment can close by opting in
  (Scenario 3)
- A genuinely complete hybrid record still verifies under the strict policy — the fix adds
  no false rejections (Scenario 4)

## Running the Tutorial

```bash
npx tsx examples/tutorials/110-hybrid-signature-downgrade-protection/run.ts
```

Requires Node ≥24 for native ML-DSA-65 support (skips cleanly, with a clear message,
on an older Node).
