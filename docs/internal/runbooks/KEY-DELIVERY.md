# Key delivery: how private signing keys reach the server, and the permanent fix

Status as of 2026-11-07. Owner: the maintainer. This is a design and a decision record. Nothing here is built yet.

## Decision summary

- **Do not place an ML-DSA-65 private key in an environment variable for the schema v3 test**, in Preview or Production, unless the owner accepts that exposure in writing.
- **Build option A first:** load key material at startup from a secret manager, using the server's own identity. It also covers the production keys that are already in `PARMANA_KEY_MATERIAL_JSON`.
- **Long-term target:** option B, a KMS or HSM that signs ML-DSA-65 so the key never leaves the device.
- **Owner decisions:**
  - Secret manager for option A: AWS Secrets Manager (decided 2026-11-07).
  - **Production moves to option A on 10 November 2026** (decided by the owner, recorded 2026-11-07). Production's keys are in `PARMANA_KEY_MATERIAL_JSON` today, so that date is the deadline for moving them.
  - **Risk to the date:** production runs on Vercel, and it is not yet verified that the Vercel project's OIDC role can read the Secrets Manager secret. That check comes first. If it fails, the date needs to be revisited with the owner, not worked around by keeping keys in the variable.

## The problem

The server needs private signing keys to start. Today they reach it in one of two ways:

1. **A key file in `PARMANA_KEY_DIR`**, mounted by the platform or written by the operator.
2. **`PARMANA_KEY_MATERIAL_JSON`**, a JSON object holding `privateKeyPem` for each key. The server writes any file that is missing from the key directory at startup (`assertSigningKeyMaterialConfigured.ts`).

Option 2 is an environment variable. The production guide already relies on it when a host cannot mount files, and it is how production's Vercel environment variables are set. So a production private key is already held in a platform secret store that anyone with project access can read. The same is true of the Preview ML-DSA-65 key proposed for schema v3 (`SCHEMA-V3-ROLLOUT.md`).

Two facts make this worse than it looks:

- A value in an environment variable is copied into the platform's stored configuration, and may be shown in dashboards and logs. Rotating it means changing the platform setting and redeploying.
- The ML-DSA-65 signer has no KMS or HSM path. `KmsSigner` supports Ed25519 only, so ML-DSA-65 keys cannot be held outside the process today (gap G-118 covers the attestation key living in the release process).

## Goals

- No long-lived private signing key in an environment variable, in any environment that holds real records.
- The server authenticates to its key store with an identity the platform issues (no bootstrap secret in the environment).
- Keys can be rotated without a code change, and a rotation is recorded.
- Preview and Production use separate keys.

## Options

**A. Load key material at startup from a secret manager, using the server's own identity (recommended first step).**
Extend the existing `PARMANA_SECRETS_PROVIDER=aws-secrets-manager` path, which already fetches connector credentials, so it also fetches the key files at startup into `PARMANA_KEY_DIR`. Access is granted to the server's IAM role (or OIDC identity from the platform), so nothing long-lived sits in the environment. Works for Ed25519 and ML-DSA-65 alike, since the key is a PEM file.

- Cost: a code change in `packages/api/src/bootstrap/` and the secrets provider, plus an IAM policy.
- Gap: the platform must support a workload identity. Vercel needs checking for this.

**B. Hold the keys in a KMS or HSM that signs ML-DSA-65 (the long-term answer).**
The key never leaves the device. This needs `KmsSigner` (or an HSM provider) to support ML-DSA-65, and the platform to offer it.

- Cost: a new signer, and confirmation that the chosen KMS offers ML-DSA-65.
- This is the only option where the key cannot be copied.

**C. Keep `PARMANA_KEY_MATERIAL_JSON`, but only with short-lived, per-environment keys and a rotation schedule.**
Acceptable only as a stopgap. It is the current state, with the exposure stated.

## Recommendation

1. **Now:** do not place an ML-DSA-65 key in any environment variable for Preview until option A exists, or until the owner accepts option C for Preview explicitly, with a rotation after the test.
2. **Next:** build option A. It covers the existing production keys as well, which are already in `PARMANA_KEY_MATERIAL_JSON`.
3. **Later:** option B, once a KMS supports ML-DSA-65 and the signer is built.

## Decisions needed (owner)

- Which secret manager to use for option A, given where Preview and Production are hosted (Vercel for the API project).
- Whether Preview may take option C for the schema v3 test, with the exposure and rotation accepted in writing.
- Whether production keys move to option A on a fixed date.

## Steps to rotate a key that may have been exposed

1. Generate a new key pair on a machine the owner controls. Do not reuse the old key.
2. Load the new key through the same path (option A once built; option C until then).
3. Set the new key id on the environment, redeploy, and confirm the server starts and `/health` responds.
4. Remove the old key from every environment variable and secret store, and delete local copies.
5. Record the rotation in `04-INCIDENTS-LOG.md` with the date, the environments, and why it was rotated.
6. Check records signed under the old key still verify with the old public key, which stays in the trust file.

## What this document does not do

- It does not change how keys are generated or stored today.
- It does not decide whether Preview tests schema v3 before option A.
