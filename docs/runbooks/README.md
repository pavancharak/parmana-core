# Runbooks

Operator guides for running Parmana in production and for working on it locally. Each runbook names the commands, the checks, and the reason behind each step. When something goes wrong, find the symptom in the table, then read the runbook it points to before trying anything else.

## Which runbook to open

| You are stuck on                                                                                       | Open                                                                         |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Production returns 500, the startup log shows an error, or `/ready` fails                              | [PRODUCTION-TROUBLESHOOTING.md](PRODUCTION-TROUBLESHOOTING.md), sections 1–3 |
| `STEP_UP_AUTHORIZATION_INVALID`, `CHECKER_NOT_IN_SCOPE`, or a policy change will not approve or reject | [POLICY-CHANGE-APPROVAL.md](POLICY-CHANGE-APPROVAL.md)                       |
| An environment variable is missing, wrong, or set when it should not be                                | [PRODUCTION-ENVIRONMENT.md](PRODUCTION-ENVIRONMENT.md)                       |
| A change is not live after you saved it, or you need to roll back                                      | [PRODUCTION-DEPLOY-AND-ROLLBACK.md](PRODUCTION-DEPLOY-AND-ROLLBACK.md)       |
| A key is lost, shared, or may be exposed, or you need to rotate one                                    | [KEY-ROTATION.md](KEY-ROTATION.md)                                           |
| Creating or checking the `.env` file, or a setting's allowed values                                    | [ENV-FILE.md](ENV-FILE.md)                                                   |
| The local build, typecheck or tests fail, or the local tools cannot import a package                   | [LOCAL-DEVELOPMENT.md](LOCAL-DEVELOPMENT.md)                                 |
| A Razorpay refund demo, the draft refund policy, or the live-money gate                                | [RAZORPAY-REFUND.md](RAZORPAY-REFUND.md)                                     |
| What one environment variable means, why it is required, and what happens if it is missing             | [ENV-VARIABLE-REFERENCE.md](ENV-VARIABLE-REFERENCE.md)                       |
| The kill switch is on, or the probe reports it                                                         | [KILL-SWITCH-OPERATIONS.md](KILL-SWITCH-OPERATIONS.md)                       |
| The server refuses to start over Paytm settings, or a Paytm refund fails to authenticate               | [PAYTM-CONNECTOR.md](PAYTM-CONNECTOR.md)                                     |
| An approval signed by an approver is refused, or you need to add or revoke an approval issuer          | [APPROVAL-ISSUERS.md](APPROVAL-ISSUERS.md)                                   |
| A file was deleted by mistake                                                                          | [PRODUCTION-TROUBLESHOOTING.md](PRODUCTION-TROUBLESHOOTING.md), section 12   |

## Rules that apply to every runbook

- Never paste a key, token, or secret value into a chat, a ticket, a commit, or a PR. Type keys at a secure prompt.
- Check before you delete. `Remove-Item -Force` skips the Recycle Bin.
- Changes to production environment variables apply only to new deployments. Redeploy after every change.
- A signed envelope expires 120 seconds after signing. Sign and send in one step, and check the PC clock first.

## Related references in the repository

- `docs/site/deployment/production.mdx` and `docs/site/deployment/environment-variables.mdx`: the authoritative deployment and variable reference. The runbooks here add the Vercel steps and the failures we actually hit.
- `docs/site/handbook/07-policy-governance-maker-checker.mdx`: the rules behind maker and checker.
- `docs/adr/`: the decisions behind the architecture.
