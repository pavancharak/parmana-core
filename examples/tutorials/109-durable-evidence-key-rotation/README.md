# Tutorial 109 — Durable-Evidence Key Rotation

## Objective

Close PQC audit RED-3 (`docs/VERIFICATION-GAPS.md`): `VerificationCrypto`, `RefusalCrypto`,
and `AuditEventCrypto` — the signers for Trust Records, Refusal Records, and Audit Events,
the durable evidence an auditor actually queries later — all hardcoded the literal keyId
`"default"` for every new signature, with the only "rotation" being to overwrite
`default.private.pem`/`default.public.pem` in place, which silently invalidates every
signature ever issued under it. `PARMANA_VERIFICATION_KEY_ID` (mirroring the existing
`PARMANA_GATEWAY_KEY_ID` precedent for the Gateway's own key) fixes this: new signing moves
to a freshly generated keyId, and nothing already issued is affected.

## What You'll Learn

- A record signed before rotation uses keyId `"default"` and verifies (Scenario 1)
- Rotation means generating a brand-new keyId's key pair — `default.*.pem` is never
  touched, never deleted (Scenario 2)
- A record signed after rotation, by a freshly constructed `VerificationCrypto` (simulating
  a new process after redeploy), uses the new keyId and verifies (Scenario 3)
- The pre-rotation record still verifies correctly after rotation — this is the property
  that was previously false: verification always resolves the public key by the record's
  own stored `keyId`, never a hardcoded "current" one (Scenario 4)

## Running the Tutorial

```bash
npx tsx examples/tutorials/109-durable-evidence-key-rotation/run.ts
```

`scripts/rotate-verification-key.ts` performs exactly Scenario 2 as a standalone,
reusable operator command.
