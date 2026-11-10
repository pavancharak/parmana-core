# Runbook: approving customer-refund 1.3.0

Status as of 2026-11-10: the change is approved in production. The approval is in the signed log after the export step below. This runbook records what was done, why, and how to repeat or troubleshoot it.

## What the change does

`customer-refund` 1.3.0 refuses every customer refund. It has no approve rule. Caller-declared signals (`refundEligible`, `fraudCheckPassed`, `managerApproved`) can no longer authorize money movement.

Refunds on Razorpay payments go through `razorpay-refund` (1.1.0), which checks the payment with Razorpay and needs a signed manager approval. Other payment rails need their own verified signal and policy first.

## Why

Version 1.2.0 authorized refunds on signals the caller declared. Nothing checked them against the payment, and the policy could not name a payment. A caller could authorize a refund on its own word. Version 1.3.0 removes that authority.

## Steps followed

Times are UTC on 2026-11-10.

| #   | Step                                                                                | Why                                                            | Result                                                  |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | Confirmed PR #62 merged after CI passed                                             | The Google AX acceptance test had been failing                 | `main` at `47ad1b2`, CI green                           |
| 2   | Closed PR #63 and PR #66 as superseded                                              | Both would replace newer code on `main`                        | Closed; branches kept                                   |
| 3   | Drafted 1.3.0 as a fail-closed policy                                               | Caller-declared signals must not authorize money               | Commit `6d3f3ee`, sign-off and SSH signature            |
| 4   | Pointed `.env` and `.env.test` at local Postgres (port 5433), applied 49 migrations | Tests and migrations had been running against a hosted project | Local only; hosted lines commented out                  |
| 5   | Committed the policy file                                                           | The pre-commit hook runs the full test suite                   | Commit `6d3f3ee`                                        |
| 6   | Pushed the branch and opened PR #553                                                | Needs a reviewer and a passing policy check                    | Open                                                    |
| 7   | Registered the SSH signing key on GitHub, re-ran the commit-signature workflow      | GitHub verifies only signatures from registered keys           | `verified-commits` passed                               |
| 8   | Proposed the 1.3.0 change to the production API                                     | A human credential must propose before anyone approves         | Pending change `aa80bb67-d398-4f61-bae8-0a1c46ef8d33`   |
| 9   | Operator added `mamta-checker` to `POLICY_CHANGE_CHECKERS` and redeployed           | The API refused the checker until then                         | Scope check passed                                      |
| 10  | Checker signed a step-up envelope and approved                                      | Approval needs the checker's bearer token and a fresh envelope | `APPROVED` at 04:59:17, resolved by `mamta-checker`     |
| 11  | Ran `policy-log:export`, then `policy-log:verify --require-coverage`                | Puts the approval into the signed log that CI checks           | 1 appended, 54 approvals, chain and signatures verified |
| 12  | Committed the log                                                                   | Pre-commit Prettier check failed on leftover files             | Leftover files removed before retrying                  |

## Commands

Replace every value in angle brackets. Never paste a token, a private key, an envelope or a connection string into a chat or a ticket.

Propose (human maker, once):

```bash
curl.exe -s -X POST "https://parmana-api-real.vercel.app/policies/customer-refund/1.3.0/pending-changes" -H "Authorization: Bearer <MAKER_BEARER_TOKEN>" -H "Content-Type: application/json" --data-binary "@<PROPOSAL_JSON_FILE>"
```

The proposal file holds `{"proposedContent": <policy.json>, "reason": "..."}`. Build it with Node, not by hand.

Check the checker is in scope. An empty body sends no envelope, so nothing is approved:

```bash
curl.exe -i -X POST "https://parmana-api-real.vercel.app/policies/pending-changes/<PENDING_ID>/approve" -H "Authorization: Bearer <CHECKER_BEARER_TOKEN>" -H "Content-Type: application/json" -d "{}"
```

`CHECKER_NOT_IN_SCOPE` means the checker isn't listed. `STEP_UP_AUTHORIZATION_INVALID` means the checker is in scope.

Sign and approve, on the checker's machine, in one run:

```bash
npx tsx scripts/sign-policy-change-step-up.ts --private-key-file .\<CHECKER>.step-up.private.pem --key-id <CHECKER_CALLER_ID> --pending-policy-change-id <PENDING_ID> --action approve | Out-File -Encoding utf8 sign-output.txt
node -e "const fs=require('fs');const line=fs.readFileSync('sign-output.txt','utf8').split(/\r?\n/).find(l=>l.trim().startsWith('{')&&l.includes('payload'));if(!line)throw new Error('no envelope line found');const e=JSON.parse(line);fs.writeFileSync('approve-body.json',JSON.stringify({stepUpAuthorization:e}));console.log('valid JSON, expires',e.payload.expiresAt)"
curl.exe -i -X POST "https://parmana-api-real.vercel.app/policies/pending-changes/<PENDING_ID>/approve" -H "Authorization: Bearer <CHECKER_BEARER_TOKEN>" -H "Content-Type: application/json" --data-binary "@approve-body.json"
```

Send the last line only if the `node` line printed `valid JSON`. The envelope expires 120 seconds after signing.

Log it, from the repo folder, with the read-only connection string from the operator:

```bash
$env:CI_DATABASE_URL = "<READ_ONLY_CONNECTION_STRING>"
npm run policy-log:export -- --policy customer-refund
npm run policy-log:verify -- --require-coverage
Remove-Item Env:CI_DATABASE_URL
```

Commit only the two governance files, then delete any leftover approval files:

```bash
git add governance/policy-approvals.jsonl governance/policy-approval-keys.json
git commit -s -S -m "Log the maker-checker approval for customer-refund 1.3.0"
git push origin claude/customer-refund-1.3.0
Remove-Item approve-body.json, sign-output.txt -ErrorAction SilentlyContinue
```

## Troubleshooting

| Symptom                                                     | Cause                                                                         | Fix                                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `getaddrinfo ENOTFOUND base` from `policy-log:export`       | `CI_DATABASE_URL` still holds the placeholder text                            | Set it to the real read-only connection string                              |
| `Couldn't load public key` on commit                        | A repo-level `user.signingkey` overrides the global SSH key                   | `git config --local --unset user.signingkey`                                |
| `Malformed JSON body` (HTTP 400)                            | The envelope was pasted with its wrapper, placeholder text or a truncated end | Use the Node build step above, which parses the signed line                 |
| `CHECKER_NOT_IN_SCOPE` (HTTP 403)                           | The checker's `callerId` is not in `POLICY_CHANGE_CHECKERS` for this policy   | Operator adds it under Production, then redeploys                           |
| `STEP_UP_AUTHORIZATION_INVALID` (HTTP 403) with no envelope | Expected for an empty body; not an error for the checker                      | Continue to the sign-and-approve step                                       |
| `CONFLICT`, "A PENDING_APPROVAL change already exists"      | A proposal for this policy version is already pending                         | Use the existing pending ID; do not propose again                           |
| `verified-commits` failing                                  | The SSH signing key is not registered on GitHub as a signing key              | Add it under Settings, SSH and GPG keys, as a Signing Key; re-run the check |
| Pre-commit fails on `approve-body.json`                     | Prettier checks every file in the folder                                      | Delete the leftover files, then commit                                      |
| Tests run against a hosted database                         | `.env` or `.env.test` still has a hosted `DATABASE_URL`                       | Point both at local Postgres; comment out hosted lines                      |
| `Malformed JSON` from the step-up file                      | Placeholder text left in the envelope variable                                | Re-run the Node build step with the real envelope                           |
| Envelope rejected as expired                                | More than 120 seconds since signing                                           | Sign a new envelope and send it at once                                     |

## Open items

- A second reviewer must approve PR #553 before it can merge. The repo owner cannot approve their own PR.
- Rotate the bearer token pasted into the chat, and any credential that has appeared in a chat or a screenshot.
- Check what the hosted project `ynpnesbdeudlsgwsrewg` holds. The test suite ran against it before the switch to local.
- A pending change for `razorpay-refund-manager-approved` 1.0.0, proposed by `maker-wiring-check` on 2026-10-21, is still pending. Confirm whether it is a leftover test before anyone approves it.
- Once the log commit is pushed, `verify-policy-approvals` should pass on the PR.
