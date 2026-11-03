# Resume status: connector migration (parmana-core)

Status as of 3 November 2026. Read this first when you come back to this work. The registration commands are in `docs/REGISTRATIONS-PENDING.md`.

## Current status

- ADR-0018 (connectors outside core) is accepted.
- Vendor connectors removed from core and merged: Zerodha (#295), Slack (#296), Paytm (#297), GitHub (#299), HubSpot (#300).
- Resume notes updated and merged: #301 (`5f2cdac`).
- Registrations still open: Razorpay, GitHub, HubSpot, Slack.
- Not needed: Paytm (staging only, removed from core). Zerodha (paper only, no live mode).
- Nothing is live. No live traffic, no vendor credentials in production, no live money.
- The SDK (`packages/connector-sdk`) still ships four sample vendor connectors: Oracle, Salesforce, SAP and Workday. They are not in the migration order and are not moved.

## What happened

1. Zerodha, Slack and Paytm were removed from core, in that order, on 2 and 3 November.
2. GitHub was removed (#299). Its code left core before its registration was approved. That was the operator's decision, following the earlier removals.
3. HubSpot was removed (#300). The same applies: its registration is still open.
4. The resume docs were corrected to show the removals and to name the SDK samples (#301).
5. The registration document `docs/REGISTRATIONS-PENDING.md` was written, based on the policy change approval runbook.

## What is left

- [ ] Confirm the registration mechanism with the operator and Mamta. The repo's runbook is the basis, and that reading has not been confirmed.
- [ ] Map each connector to its policy names in the policies directory.
- [ ] Add Mamta to `POLICY_CHANGE_CHECKERS` for those policies, and give her a step-up key pair.
- [ ] Decide who registers Razorpay.
- [ ] Run the Razorpay preview signed-release test. It needs a Vercel login and a local core.
- [ ] Register Razorpay, then GitHub, HubSpot and Slack. Each needs a maker proposal and a checker approval.
- [ ] Rewrite the seven core gate tests that were removed with Paytm, against a core test connector, if core's gate should be covered by its own proof again.

## Recommended order

Do these in order. Each step depends on the one before it.

1. **Confirm the registration mechanism with Mamta.** This is the first step. Nothing else starts until she agrees that a registration is the policy approval in `docs/runbooks/POLICY-CHANGE-APPROVAL.md`, or until a different process is agreed. Record the decision here.
2. **Run the Razorpay preview signed-release test.** It needs a Vercel login and a local core, so the operator runs it. Record the result here.
3. **Register Razorpay only.** Stop and review before any other connector.
4. **Decide, for each of GitHub, HubSpot and Slack, whether it should run at all.** Their code is already out of core. Only after that decision, propose its registration.
5. **Optional, not blocking:** rewrite the seven core gate tests removed with Paytm, against a core test connector. Decide whether the SDK's four sample vendor connectors stay in core. Open the parmana-verifier `dilithium3` PR (issues #27 and #28).

Live money stays off until each connector has its own approval.

## Why

A connector can change a real system, such as issuing a refund or updating a deal. A second person must approve that before it can run in production. The maker and checker roles keep those two steps separate, and the server enforces the separation.

## How

The commands are in `docs/REGISTRATIONS-PENDING.md`. In short:

1. The maker proposes the policy change with a reason. The server returns a pending change ID.
2. The checker signs a step-up envelope for that ID and approves it, or rejects it with a reason.
3. The server checks the caller, the scope, the maker and checker keys, and the envelope, in order.

Run the clock check first. The envelope is valid for 120 seconds.

## Steps, in order

1. Agree the registration mechanism (operator and Mamta).
2. Confirm the production URL and the maker and checker keys are set in PowerShell.
3. Check the local clock against the server.
4. Maker proposes the Razorpay policy change.
5. Checker approves. Confirm `status : APPROVED` and `resolvedBy` set to the checker.
6. Repeat for GitHub, HubSpot and Slack, one at a time.

## Troubleshooting

| Symptom                                         | Likely cause                                                   | Fix                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `401` on propose or approve                     | Key not in the API keys setting, or wrong key                  | Check the key entry for that caller                                             |
| `CHECKER_NOT_IN_SCOPE`                          | Checker not listed for this policy                             | Add the checker's `callerId` to `POLICY_CHANGE_CHECKERS` for that policy        |
| `STEP_UP_AUTHORIZATION_INVALID`                 | Clock skew, expired envelope, wrong ID or action, or wrong key | Run `w32tm /resync` from an administrator PowerShell. Sign and send in one step |
| `SameActorCannotApproveOwnChangeError`          | Maker and checker are the same person                          | Use a different checker key                                                     |
| `reason is required.`                           | Missing `reason` in the proposal                               | Add the reason and resend                                                       |
| `git push --force-with-lease` says "stale info" | Local copy of the remote branch is out of date                 | Fetch the branch, then rebase from the fresh remote tip                         |
| DCO check fails                                 | Sign-off name does not match the author name                   | Set `git config user.name` to the author name, then rerun the signing block     |
| Commits show as unverified                      | Local branch points at an unsigned old commit                  | Move the local branch to the remote tip. Do not change the author identity      |
| `gitleaks` not found in pre-commit              | Gitleaks not on PATH                                           | Add its folder to PATH, then retry the commit. Do not use `--no-verify`         |
| Vercel "deployment rate limited"                | Vercel quota, not code                                         | Retry in 24 hours                                                               |
| Pre-commit preflight fails                      | A check in the preflight failed                                | Read the failing step in the output and fix it. Do not skip it                  |

## Checklist before any registration

- [ ] The change is merged to `main`.
- [ ] The clock check passes.
- [ ] The maker is not the checker.
- [ ] The checker is listed for that policy.
- [ ] The reason is written.
- [ ] Nothing is live until the approval is confirmed on the server.
