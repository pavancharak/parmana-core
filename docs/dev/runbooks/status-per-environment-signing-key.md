# Change record: per-environment KMS signing key

Status: code and documentation merged. Production configured. Two verification items open.

## Merged

| PR   | Content                                                                                                           | Merged to                  |
| ---- | ----------------------------------------------------------------------------------------------------------------- | -------------------------- |
| #613 | `PARMANA_SIGNING_KEY_ID` setting, signing call sites, tests, docs                                                 | `main` (commit `a1d75f4d`) |
| #614 | Runbook, command and policy log, status document, production Terraform, Prettier ignore for local Terraform state | `main`                     |

## Live in production

- KMS key `7b0c7156-88b1-4979-be5d-7eca96972c39`, Ed25519 (`ECC_NIST_EDWARDS25519`), tag `purpose=parmana-prod`, ap-south-1.
- Alias `alias/parmana-prod` points to that key.
- Role `parmana-vercel-kms-signer` has inline policy `parmana-prod-kms-signing`: `kms:Sign`, `kms:GetPublicKey`, `kms:DescribeKey` on that key only.
- Vercel production variable `PARMANA_SIGNING_KEY_ID=alias/parmana-prod`.
- Production deployment built from `main`: `dpl_AGh2CNLugRCsqzm4R3FK5zhGGjXp` (`parmana-api-real-8ma2zq723-…`), Ready. Health check returns 200.

## Verified

- Key and alias are enabled with the correct spec.
- Test signature with the new key succeeded; CloudTrail recorded it against `7b0c7156-…`.
- Role policy allows only the three actions on that key.
- Production health check returns 200.

## Not verified

- Production signs with `alias/parmana-prod`. The newest production `Sign` events are from the old build and use `alias/default`. Confirm after one real signed request and a CloudTrail check.
- Git commit of the current production deployment. Confirm in the Vercel dashboard (deployment → Source).

## Open actions

1. Make one real signed request in production, wait about 15 minutes, check CloudTrail `Sign` events for `7b0c7156-…` from `parmana-vercel-kms-signer`. Owner: team.
2. Confirm the commit of deployment `dpl_AGh2CNLugRCsqzm4R3FK5zhGGjXp`. Owner: team.
3. Delete access key, user `parmana-prod-test` and policy `parmana-prod-signing-test`. Owner: admin.
4. Cancel deletion of drill key `83cd2361-df73-4879-859f-412d5f9fd7c9` if still needed (scheduled around 2026-11-20). Owner: admin.
5. Remove `EnableKey`, `DisableKey`, `CreateAlias`, `DeleteAlias` from the inline policy on `parmana-kms-drill`. Owner: admin.
6. Stop local PostgreSQL on the sandbox. Owner: engineer.
7. Run the full test suite on Node 24. Owner: engineer.
8. Staging key and alias: not created. Repeat the runbook when needed. Owner: admin.
9. Provider 6.x support for the Ed25519 key spec: untested. Owner: engineer.

## Known issues

- Vercel "Redeploy" rebuilds the old commit. Deploy from `main` after changing variables.
- `/health` does not show which key the server uses.
- CloudTrail lookups lag about 15 minutes.
- CloudShell may be blocked for new accounts.
- Crypto suite: 56 failures on Node 22 before and after the change (ML-DSA key type). Not caused by this change.
