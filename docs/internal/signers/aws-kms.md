# AWS KMS signer

**Production ready: not confirmed.** The signer is built and tested. Whether production uses it depends on two operator steps that the repo does not verify.

## What it is

`KmsSigner` (ADR-0009) signs with a key held in AWS KMS, so the private key never leaves AWS. Selected with `KEY_PROVIDER=aws-kms`, resolved by `SignerBootstrap.create()`.

## Status

- **Built:** yes (claim 2.37 covers large-message signing under KMS, with a commitment scheme).
- **Tested:** yes. Each refusal in the key-ID mapping has a test case, and the bootstrap tests check each non-local value.
- **In production:** not stated in the repo. The claims say Ed25519 runs in production, but do not name the key provider.

## Key ID mapping (safe by design)

- A bare ID such as `default` becomes `alias/default`.
- A dotted tenant ID such as `tenant.acme` becomes `alias/tenant/acme`, because KMS alias names cannot contain dots.
- Any ID that would land under AWS's reserved `alias/aws/` prefix is refused.
- A full key ARN is refused.

## Credentials

- No static AWS access keys.
- With `AWS_ROLE_ARN` set, `KmsSigner` exchanges Vercel's OIDC token for short-lived credentials.

## How to make it production ready

1. Create the KMS key and alias for each key ID the server uses.
2. Provision the IAM role that `AWS_ROLE_ARN` names, with permission only to sign with those keys.
3. Set `KEY_PROVIDER=aws-kms` in the production environment.
4. Confirm at startup that the server signs and that a record verifies offline against the KMS public key.

Steps 1 and 2 are operator steps. Claim 2.37 notes that the role's provisioning is not verified by the claim.

## Why it is not yet confirmed

- The repo does not state the production `KEY_PROVIDER`.
- Hybrid signing refuses `KEY_PROVIDER=aws-kms` (claim 3.13), because both hybrid entries are signed with local key files. So hybrid cannot use KMS yet.

## Limits

- The path check covers the file-based provider only. KMS key IDs are checked by the mapping rules above, not by the path check.
- Azure Key Vault, GCP KMS and HSM are not implemented. See [not-implemented.md](not-implemented.md).

## When it changes

When the production key provider is confirmed as `aws-kms`, or when production moves from `local` to KMS, update the status here. Hybrid on KMS needs a change to the hybrid path first.
