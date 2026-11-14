# Evidence: production signs with the per-environment key

Checked: 14 November 2026, from CloudTrail `lookup-events` in ap-south-1, filtered to
`EventName=Sign`, last 24 hours at the time of the check. Times are UTC unless marked IST.

## What was checked

- Key: `7b0c7156-...` (production, Ed25519, tag `purpose=parmana-prod`).
- Alias: `alias/parmana-prod`.
- Expected caller: role `parmana-vercel-kms-signer`, which Vercel assumes through OIDC.
- Method: read-only CloudTrail query. No requests were made to production for this check.

## Result

Production signing uses the new key. Signatures from the Vercel role with `alias/parmana-prod`
appear on 13 and 14 November 2026. The shared key `alias/default` is no longer used by that role.

| Time (UTC)            | Key or alias                                  | Caller                                        |
| --------------------- | --------------------------------------------- | --------------------------------------------- |
| 13 Nov 08:44 to 16:44 | `alias/default` (shared key), many signatures | Vercel role                                   |
| 13 Nov 18:18          | `alias/default` (shared key), last use        | Vercel role                                   |
| 13 Nov 18:33          | `alias/parmana-prod`, first use               | `parmana-prod-test` user (the test signature) |
| 13 Nov 22:12          | `alias/parmana-prod`                          | Vercel role                                   |
| 14 Nov 02:07          | `alias/parmana-prod`                          | Vercel role                                   |
| 14 Nov 02:25          | `alias/parmana-prod`, latest (07:55 IST)      | Vercel role                                   |

Other events in the window: the drill user signed with its own test key (`83cd2361-â€¦`) on 13 Nov
16:47 UTC. Its test signatures are not production traffic.

## Why it is believed

- Every production-alias signature resolves to the production key ARN in the CloudTrail record.
- The role's trust policy allows only the Vercel project `parmana-api-real`, production environment.
- The calls use the AWS JavaScript SDK on Node 24, the same runtime as the production deployment.

## What this does not prove

- It does not show which Vercel environment made each call. The trust policy limits the role to
  production, but this is an inference, not a direct record.
- It does not show that every production request signs with this key. Only the calls above were checked.

## Deployment and commit (confirmed)

- Deployment `dpl_AGh2CNLugRCsqzm4R3FK5zhGGjXp`: target production, Ready, created 14 Nov 2026 00:07 IST.
- Commit it was built from: `a1d75f4dfb57d9e0f1f147374f856fb7f57f3efe`, "Make the KMS signing key
  configurable per deployment (#613)", committed 13 Nov 2026 23:11 IST.
- Source: the Vercel Deployments list, filtered to Production, shows this commit on branch `HEAD`
  (a detached checkout, as in the runbook), about 11 hours ago. The CLI reports the creation time as 10 hours ago.
- Later production deployment: `6c2c906` on `main` (4 hours ago, PR #617). It also contains the signing change.

## Follow-up

- Sign out of the root session and restore a normal default profile. The `aws login` run switched the
  default profile to root.
- Keep this record with the full record in the scratch folder. Add it to the repository only if you want
  it committed.

## Access used for this check (14 November 2026)

This section records which AWS identities were used, so the access trail is clear.

1. **CloudTrail read as root.** The check was run after `aws login` was used with the root account.
   The default profile was switched to root credentials, which is the wrong identity for routine
   work. The lookup itself was read-only.
2. **Session switched to `parmana-prod-test`.** The `parmana-test` profile resolves to the IAM
   user `parmana-prod-test`, which is the test user scheduled for deletion. The session now
   runs as that user. It should not be used for anything else. Its only remaining purpose is cleanup.
3. **Sandbox identity (not used for this check).** The sandbox runs as the drill user
   `parmana-kms-drill`. That user cannot read CloudTrail.

Still outstanding from this section:

- End the root login with `aws logout`, then confirm `aws sts get-caller-identity` no longer returns root.
- Delete `parmana-prod-test`, its access key and its policy, from an identity with IAM rights.
  Once it is gone, the `parmana-test` profile must be pointed at a different user.
- Make the default profile an IAM user, not root.
