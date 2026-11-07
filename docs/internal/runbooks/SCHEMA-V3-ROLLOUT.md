# Schema version 3 rollout: preconditions, steps, checks, rollback

Status as of 2026-11-07. Owner: the maintainer. Tracked by parmana-core#291 and parmana-verifier#27. Nothing in this runbook is done yet.

## What v3 changes

A schema version 3 record signs every top-level field except `signature`, `signatures`, `schemaVersion`, `verifications` and `receipts`. A schema version 2 record signs only the fixed canonical fields. A field added to a v2 record after signing is not detected. With v3 it is.

v3 records are hybrid-signed: one Ed25519 entry and one ML-DSA-65 entry (`dilithium3`).

## Current state

- The SDKs verify v3 hybrid records (parmana-core PR #491, merged or open at the time of reading).
- The verifier reads v3 (parmana-verifier PR #34).
- The server issues v2 everywhere. Nothing in production issues hybrid records today (gap G-119).
- Preview on Vercel shows Node 26.x through an override. Production shows the same. See `NODE-VERSION.md`.

## Preconditions (all must hold before turning v3 on)

1. **Hybrid signing is configured** in the target environment: `CRYPTO_MODE=hybrid`, `SECONDARY_SIGNATURE_PROVIDER=ml-dsa-65`, and `PRIMARY_SIGNATURE_PROVIDER=ed25519`.
2. **ML-DSA-65 key material exists** in the environment's key directory, and `PARMANA_VERIFICATION_SECONDARY_KEY_ID` names it. The key is generated and stored by the owner. Do not commit it, paste it into chat, or copy it between environments.
3. **Node 24.x** is the runtime of that environment. ML-DSA-65 needs Node 24 or later with OpenSSL 3.5 or later. Confirm the patch from the build log's `Using Node.js` line.
4. **The verifier and SDK versions** that will read the records are released or pinned: parmana-verifier with v3 support, and the SDKs from PR #491.

Do not proceed if any precondition is missing. The server refuses `HYBRID_SCHEMA_VERSION=3` without `HYBRID_SCHEMA_V3_ACKNOWLEDGED=true`, and refuses hybrid mode with `KEY_PROVIDER=aws-kms`.

## Step 1: Preview only

Set these on the Vercel **Preview** environment only. Production must not have them.

| Variable                                | Value                              |
| --------------------------------------- | ---------------------------------- |
| `CRYPTO_MODE`                           | `hybrid`                           |
| `PRIMARY_SIGNATURE_PROVIDER`            | `ed25519`                          |
| `SECONDARY_SIGNATURE_PROVIDER`          | `ml-dsa-65`                        |
| `PARMANA_VERIFICATION_SECONDARY_KEY_ID` | the ML-DSA-65 key id (not the key) |
| `HYBRID_SCHEMA_VERSION`                 | `3`                                |
| `HYBRID_SCHEMA_V3_ACKNOWLEDGED`         | `true`                             |

Set the Preview Node.js Version to `24.x` and redeploy the Preview branch.

## Step 2: Checks on Preview

Each check must pass before moving on.

1. `/health` responds, and `/ready` reports the hybrid configuration.
2. Create one trust record through a Preview execution. Its JSON has `schemaVersion: 3` and a `signatures` array with two entries, `ed25519` and `dilithium3`.
3. Verify that record offline with the TypeScript and Python SDKs. Both report `valid: true` and `coverage: "full"`.
4. Add one field to a copy of the record. Both SDKs report `valid: false`.
5. Change one covered value in a copy. Both SDKs report `valid: false`.
6. Check the audit log and the Preview logs for signing errors over one day of traffic.

## Step 3: Production (separate decision)

Do not start this step until Preview has run cleanly for an agreed period, and the owner has decided to go ahead.

1. Set the Production Node.js Version to `24.x`, redeploy `main`, and check `/health`.
2. Set the same variables as Preview, on the Production environment.
3. Redeploy. Run the Step 2 checks against Production, using a test transaction the owner approves.
4. Keep the verifier and SDK versions that read v3 deployed everywhere records are checked.

## Rollback

- **Preview or Production, records look wrong:** unset `HYBRID_SCHEMA_VERSION` (or set it to `2`), then redeploy. New records are v2 again. Existing v3 records still verify, because they carry their own `schemaVersion`.
- **Signing fails:** unset `CRYPTO_MODE` (or set it to `single`), then redeploy. Records are issued with the legacy signature only.
- **Key problem:** revoke the ML-DSA-65 key through the owner's key process. Do not delete key files on the host. Record the incident in `04-INCIDENTS-LOG.md`.

## What this runbook does not do

- It does not generate, rotate or store ML-DSA-65 keys.
- It does not change the verifier's behaviour for v2 records.
- It does not decide whether v3 becomes the default. That is a later decision, after Production has run.
