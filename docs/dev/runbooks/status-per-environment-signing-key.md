# Status: per-environment KMS signing key

Last updated: 2026-11-14 (IST), at the end of the working session.

## Summary

Production uses a per-environment KMS signing key, `alias/parmana-prod`. The change is
deployed and the health check passes. Production signing with the new key is not yet
confirmed, because no signing request has reached production since the redeploy.

## Current state

| Item                                           | State                                                        | Reference                                                           |
| ---------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| Code: `PARMANA_SIGNING_KEY_ID` setting         | Merged to `main`                                             | PR #613                                                             |
| Runbook and command log                        | Committed on `claude/gracious-cerf-c2ehq9`                   | `docs/dev/runbooks/`                                                |
| Terraform for production alias and role policy | Committed; PR open                                           | `infra/parmana-prod-signing/`, PR #614                              |
| Production KMS key                             | Enabled, `ECC_NIST_EDWARDS25519`, tag `purpose=parmana-prod` | `7b0c7156-88b1-4979-be5d-7eca96972c39`                              |
| Production alias                               | Exists, points to the key above                              | `alias/parmana-prod`                                                |
| Server role policy                             | Applied: sign, get public key, describe, on that key only    | Role `parmana-vercel-kms-signer`                                    |
| Vercel variable                                | `PARMANA_SIGNING_KEY_ID=alias/parmana-prod` in Production    | Project `parmana-api-real`                                          |
| Production deployment                          | Built from `main`, Ready                                     | `dpl_AGh2CNLugRCsqzm4R3FK5zhGGjXp` (`parmana-api-real-8ma2zq723-…`) |
| Health check                                   | 200                                                          | `https://parmana-api-real.vercel.app/health`                        |
| Test signing with new key                      | Succeeded; logged in CloudTrail against the new key          | Test identity, 18:33 UTC                                            |
| Old shared key                                 | Unchanged, still behind `alias/default`                      | `2787acce-db19-4cd6-88ed-ce2c1319096b`                              |
| Drill key                                      | Scheduled for deletion (around 2026-11-20)                   | `83cd2361-df73-4879-859f-412d5f9fd7c9`                              |

## Verified

- The new key and alias are enabled and have the right spec.
- The server role can sign with the new key and nothing else, by policy.
- A test signature with the new key succeeded, and CloudTrail recorded it.
- The production health check returns 200.

## Not verified

- **Production signs with `alias/parmana-prod`.** The newest production `Sign` calls are from the old build and use `alias/default`. Nothing has signed since the redeploy.
- **Git commit of the current production deployment.** The Vercel CLI output didn't show it. Check the Source field in the dashboard.
- **Provider 6.x** can create the Ed25519 key in Terraform. Not tested; the provider 5.x rejects the key spec.
- **Full test suite on Node 24.** The crypto suite had 56 failures on Node 22 before and after the change, from ML-DSA support. The runtime and API suites weren't run.

## Open actions

1. Make one real signed request in production, wait about 15 minutes, then check CloudTrail `Sign` events for `7b0c7156-…` from `parmana-vercel-kms-signer`. Owner: team.
2. Confirm the Git commit of the current production deployment in the Vercel dashboard. Owner: team.
3. Delete the test access key, user `parmana-prod-test` and policy `parmana-prod-signing-test`. Owner: admin.
4. Cancel the drill key's deletion if it's still needed, before about 2026-11-20. Owner: admin.
5. Remove `EnableKey`, `DisableKey`, `CreateAlias` and `DeleteAlias` from the inline policy on `parmana-kms-drill`. Owner: admin.
6. Stop the local PostgreSQL cluster on the sandbox. Owner: engineer.
7. Run the full test suite on Node 24. Owner: engineer.
8. Staging key and alias not created; repeat the runbook when needed. Owner: admin.
9. Merge PR #614 after review.

## Known issues

- Vercel "Redeploy" rebuilds the old commit. Deploy from `main` after changing variables.
- Health checks don't prove which key the server uses.
- CloudTrail lookups can lag about 15 minutes.
- CloudShell may be blocked for new accounts.
