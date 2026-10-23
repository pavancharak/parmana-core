# Troubleshooting guide: commands and steps

Step-by-step checks for the problems operators meet most often: local setup, PowerShell, Vercel, the Parmana API, governed changes, the refund runner, the key list, the kill switch and the Razorpay endpoint.

How to use it: find the symptom in the index, run the checks in order, and stop at the first step that gives an unexpected result. The fix is in the same section. If a fix is not listed, record the exact output and tell the founder.

Never paste a key, token or database URL into chat, email, a ticket or a commit when you troubleshoot. Use the output's status code and message, not the secret.

---

## Index

Scenario walkthroughs (complete, step by step) are at the end of this guide, after section 13.

1. Local checkout and git
2. The stop hook reports unpushed commits
3. PowerShell: keys, variables and quoting
4. Vercel: linking, secrets and deploys
5. Parmana API: status codes
6. Governed changes (maker and checker)
7. The refund runner
8. The live key list
9. The kill switch
10. The Razorpay endpoint
11. The MCP bridge
12. Building and tests
13. When to escalate

---

## 1. Local checkout and git

**Symptom:** a command refers to a file that does not exist, or the code is not what you expect.

**Checks:**

```powershell
cd D:\last\parmana-core
git status -sb
git log -1 --oneline
git branch --show-current
```

**Causes and fixes:**

- **Branch is behind `main`:** `git switch main`, then `git pull origin main`.
- **The file is missing on your branch:** the file was added on another branch. Check with `git log --oneline origin/main -- <path>`. Switch to `main` and pull.
- **Local changes block a switch:** `git status --short` shows the files. Save what matters outside the repo (for example to `D:\last\parmana-records`), then restore the tree. Do not discard changes you do not understand.
- **Untracked files:** `git status --short` lists them with `??`. Move records and test outputs out of the repo; leave the files you edited on purpose.

**Expected healthy state before a deploy:** `git status --short` is empty for tracked files, and `git log -1 --oneline` shows the commit you expect on `main`.

---

## 2. The stop hook reports unpushed commits

**Symptom:** `Branch '<name>' has N unpushed commit(s) and no remote branch.`

**Cause:** the hook reads a local checkout that does not have the branch's remote tracking state. The remote branch is usually fine.

**Checks (run in the checkout the hook reads):**

```powershell
git ls-remote --heads origin <branch-name>
git status -sb
```

- If the remote lists the branch at the same commit as `git log -1 --oneline`, nothing needs pushing.
- If the remote does not list it, push it: `git push -u origin <branch-name>`.

**Fix when the branch is only on the other checkout:**

```powershell
git fetch origin <branch-name>:<branch-name>
git switch <branch-name>
git status -sb
```

**Do not** push again and again when the remote already matches. Each push adds nothing.

**Fix when the commits are already on `main`:** the hook counts commits that are not in `main`. Merging the branch (through a PR) clears it.

---

## 3. PowerShell: keys, variables and quoting

### 3.1 `Caller is not permitted to invoke this capability.`

**Cause:** the wrong key is loaded in the session. Commonly, `Use-Key "Checker"` was run earlier in the same window, and the agent key was not reloaded.

**Fix:**

```powershell
$env:PARMANA_API_KEY = Read-Secret "razorpay-demo-agent.key"
```

Or open a new PowerShell window and load only the key you need.

### 3.2 `This action requires a caller credential provisioned as a verified human`

**Cause:** the approve was attempted with a non-human key (often the agent key).

**Fix:** load the checker's key with `Use-Key "Checker"` and retry.

### 3.3 `key length` is not 43

**Cause:** the key was not copied in full, or the wrong text was captured.

**Fix:** run the generation again. The clipboard may hold a partial value; do not use it. Save the new key, then clear the clipboard with `Set-Clipboard -Value " "`.

### 3.4 `Read-Secret` fails: file not found

**Cause:** the key was never saved in the encrypted store on this machine, or the caller id is wrong.

```powershell
Get-ChildItem "$env:USERPROFILE\parmana-secrets"
```

**Fix:** use the exact file name listed (for example `razorpay-demo-agent.key.dpapi`'s base name `razorpay-demo-agent.key`). If the file is missing, load the key from the password manager for this session only.

### 3.5 `Read-Secret` fails: cannot decrypt

**Cause:** the secret was saved by another Windows user, or on another machine. DPAPI is tied to the user and the machine.

**Fix:** run the command as the same Windows user who saved it, on the same machine. If that is not possible, use the password manager.

### 3.6 Inline JSON returns `400 Parse error`

**Cause:** PowerShell removed the inner quotes when passing JSON to `curl.exe`.

**Fix:** write the body to a file, and send it with `--data-binary`:

```powershell
'{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | Set-Content "$env:TEMP\body.json" -Encoding ascii
curl.exe -i -X POST <url> -H "Authorization: Bearer $t" -H "Content-Type: application/json" --data-binary "@$env:TEMP\body.json"
```

### 3.7 `curl: (3) URL rejected: Port number was not a decimal number`

**Cause:** the command was broken when pasted, so the URL contained extra text.

**Fix:** type the URL again, or paste the whole command in one piece.

### 3.8 `curl: (6) Could not resolve host: REPLACE-WITH-DEPLOY-URL`

**Cause:** a placeholder was left in the command.

**Fix:** replace it with the real URL, printed by `npx vercel deploy --prod --yes` (the `Production:` line).

### 3.9 `The '<' operator is reserved for future use`

**Cause:** a placeholder such as `<grant-id>` was pasted into the command.

**Fix:** replace each `<...>` with the real value before running the command.

### 3.10 `Use-Key` or `Read-Secret` is not recognised

**Cause:** the session was opened without the helper functions.

**Fix:** define them again (Founder Book, Part 4.4, or the operator guide, section 3).

---

## 4. Vercel: linking, secrets and deploys

### 4.1 `vercel link` connects the wrong GitHub repository

**Cause:** the link was made in the repository root instead of the folder that holds the project.

**Fix:** unlink (delete the `.vercel` folder in the wrong folder), then link from the correct folder:

```powershell
Remove-Item -Recurse -Force .vercel -ErrorAction SilentlyContinue
cd "$env:USERPROFILE\parmana-vercel-link"
npx vercel link --yes --project <project-name>
```

Then disconnect the wrong Git repository in the Vercel dashboard (Settings → Git).

### 4.2 `npm error Missing script: "openapi"` during a deploy

**Cause:** the project still uses the repository's build command.

**Fix:** add a `vercel.json` to the deployed folder that overrides the build:

```json
{ "buildCommand": "echo prebuilt", "installCommand": "echo no install", "functions": { "api/mcp.mjs": { "maxDuration": 60 } } }
```

Then redeploy.

### 4.3 `No Output Directory named "public" found`

**Cause:** the project expects a `public` output folder.

**Fix:**

```powershell
New-Item -ItemType Directory -Force public | Out-Null
Set-Content public\index.html "<name>" -Encoding ascii
npx vercel deploy --prod --yes
```

### 4.4 `Deployment Protection is on for this project`

**Meaning:** Vercel Authentication is on. Requests need a Vercel login, unless the caller sends the project's own token.

**Fix:** if the caller is a service with its own bearer token, the token still works. Turn protection off in the dashboard (Settings → Deployment Protection) only if the caller cannot send the token, and record why.

### 4.5 `Error: Environment Variable was not found.` on `env rm`

**Meaning:** nothing to remove; the variable was never set. This is expected when setting a variable for the first time.

### 4.6 `Removed trailing newline from stdin input`

**Meaning:** a piped value had a trailing newline; the CLI removed it. This is expected.

### 4.7 A changed variable has no effect

**Cause:** variables are read at startup. A change applies to the next deployment only.

**Fix:** redeploy the project that holds it. For Parmana, redeploy from current `main` (ceremony runbook, section 10).

### 4.8 `vercel env add` fails or prints nothing

**Checks:**

```powershell
npx vercel env ls production
npx vercel whoami
```

- If `env ls` does not show the variable, run the `add` again.
- If `whoami` shows a different account or team, log in to the right one: `npx vercel login`.

### 4.9 The PARMANA_API_KEYS list is wrong after an `add`

**Symptom:** many callers return `401` after the list was replaced.

**Fix:** restore the list at once from the same `$value` (ceremony runbook, section 9). Then check each caller again (section 8).

---

## 5. Parmana API: status codes

| Code | Common cause | First check | Fix |
| --- | --- | --- | --- |
| 400 | Missing field, or a malformed body | The response's `error` or `message` names the field | Fix the request. Do not retry unchanged |
| 401 `authentication required` | Key not in the live list, wrong key, or stale list | `callers/me` with the key; the entry hash | Section 8 |
| 403 `CAPABILITY_NOT_ALLOWED` | The key lacks the capability | The key's `allowedCapabilities` in the entry file | Use the right key |
| 404 | Not found, or not visible to this caller | The id, and the caller | Check the id; cross-caller reads return 404 by design |
| 409 `SAME_OPERATOR_CANNOT_CONFIRM_RESET` | The same key tried to finish its own reset | Who started the reset | Operator 2 completes it |
| 409 (governance) | A pending change, an active connector, or an active grant exists | `pending-changes`, `external-connectors`, `authority-grants` | Section 6 |
| 429 | Rate limit | The time since the last request | Wait, then retry |
| 500 on every request | `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR` is invalid | Vercel `env ls`; the value must be exactly `true` or `false` | Fix the variable and redeploy |
| 503 `KILL_SWITCH_ACTIVE` | The switch is tripped | `kill-switch/status` | Kill switch section 9 |

**General checks for any API problem:**

```powershell
curl.exe -s "$env:PARMANA_URL/health"
curl.exe -s "$env:PARMANA_URL/ready"
```

Expected: `{"status":"UP"}` and `READY`. If `/health` answers but `/ready` does not, the service is up but not ready (check the environment and the database).

### 5.1 `Unable to communicate with the Parmana Runtime`

**Cause:** a network blip, or the service is restarting.

**Steps:** check `/health` (above); wait a minute; retry the same command once. Do not re-propose a change because of this message.

### 5.2 `Cannot GET /kill-switch/status`

**Cause:** the deployment was built from an old checkout that lacks the kill-switch routes.

**Fix:** deploy from current `main`, after checking `Select-String -Path api\index.ts -Pattern "createKillSwitch"` prints two lines (ceremony runbook, section 10).

---

## 6. Governed changes (maker and checker)

### 6.1 `A PENDING_APPROVAL change already exists for policy '<name>' version '<v>'`

**Cause:** a change for that version is waiting for approval.

```powershell
curl.exe -s "$env:PARMANA_URL/policies/pending-changes" -H "Authorization: Bearer $k"
```

**Fix:** approve it, or leave it and propose a new version for new content. A duplicate of the version in force does nothing harmful.

### 6.2 `Capability '<cap>' already has an active external connector. Revoke it first.`

```powershell
curl.exe -s "$env:PARMANA_URL/external-connectors" -H "Authorization: Bearer $k"
```

**Fix:** if the connector should change, propose a revoke, have it approved, then propose the new connector.

### 6.3 `'<caller>' already holds a grant for '<cap>'. Revoke it first.`

```powershell
curl.exe -s "$env:PARMANA_URL/authority-grants" -H "Authorization: Bearer $k"
```

Check `validUntil`. An `active` grant with a past `validUntil` is not in force, but it still blocks a new grant.

**Fix:** propose a revoke, approve it, then propose the new grant.

### 6.4 `CHECKER_NOT_IN_SCOPE`

**Cause:** the checker is not allowed to approve this kind of change. Seen on 23 October for policy changes; the same key approved grants.

**Fix:** check the policy-change checker list (`POLICY_CHANGE_CHECKERS`) in the Vercel dashboard. The value is hidden in the CLI. Adding a checker is a founder decision.

### 6.5 Approve asks for `APPROVE` and you typed something else

**Meaning:** the approve stopped, deliberately. Nothing changed.

**Fix:** run the approve again and type `APPROVE` exactly when the change shown is the one you intended.

### 6.6 Approve answers `Status: APPROVED`, but the change does not take effect

**Checks:**

```powershell
curl.exe -s "$env:PARMANA_URL/policies/in-effect?capability=<cap>" -H "Authorization: Bearer $k"
curl.exe -s "$env:PARMANA_URL/authority-grants" -H "Authorization: Bearer $k"
```

For a grant, confirm `validUntil` is in the future and the limits are right. For a policy, confirm the version in force is the new one.

### 6.7 `Proposed:` appears, but the change never reaches `APPROVED`

**Cause:** the checker has not approved it. Changes wait until a checker approves; there is no timeout.

**Fix:** tell the checker. There is no reject in the operator script; a rejection is made through the SDK (reject methods exist for each change kind), and that needs a developer.

---

## 7. The refund runner

### 7.1 `Refused by : reject-manager-approval-required`

**Meaning:** the request had no approval. This is the correct refusal for a request without one.

**Fix:** only add an approval when a manager has signed one for this payment and amount.

### 7.2 `Refused by : authority-not-authorized` / `Authority : NOT_AUTHORIZED`

**Meaning:** the amount is above the grant's limit. Correct refusal.

**Fix:** do not increase the request. If the limit is wrong, change the grant through a governed change (revoke and re-propose).

### 7.3 `Refused by : signal-state-verification-violation`

**Meaning:** the approval was already used, or does not match this request. Correct refusal for a replay.

**Fix:** create a new approval for the request. Do not reuse `approval.json`.

### 7.4 `Razorpay answered` shows an error

**Checks:** the endpoint's answer in the record file (`--out`), and the Razorpay dashboard in Test Mode for the payment's refunds.

**Fix:** if the payment is not captured, create a captured test payment. If the refund exists already, the endpoint returns it rather than creating another (receipt check).

### 7.5 `Verifies offline : false`

**Meaning:** the record did not verify. This is a serious result.

**Steps:** keep the record file. Do not treat the run as passed. Tell the founder. Check that the runner used the current public key (`GET /keys/default`).

### 7.6 The runner times out

**Meaning:** the answer may be lost, not the action. The refund may already exist.

**Fix:** do not send the request again. Read the trust record with the caller's key (`GET /trust-records/<businessTransactionId>`), and check the Razorpay dashboard for a refund with that receipt.

---

## 8. The live key list

### 8.1 A caller returns `401` on `/callers/me`

**Checks, in order:**

1. The key is 43 characters: `$k.Length`.
2. The key matches its entry. Compute the SHA-256 of the key and compare it with `keyHash` in the entry file:

```powershell
$h = [System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($k))).Replace("-","").ToLower()
$e = Get-Content "$env:USERPROFILE\parmana-entries\<caller-id>.json" -Raw | ConvertFrom-Json
"match: " + ($e.keyHash -eq $h)
```

Expected: `match: True`. `False` means the key you hold is not the key for that entry.

3. The caller is in the live list: print the entries (ceremony runbook, section 8) and compare.
4. The redeploy happened after the list changed.

**Fixes:**
- Key does not match: find the right key, or regenerate that caller's key and its entry, then update the list.
- Caller missing from the list: add the entry file, replace the list (ceremony runbook, section 9), and redeploy.
- List changed but no redeploy: redeploy from current `main`.

### 8.2 A caller that worked stops working after a list change

**Cause:** the caller was left out of the new list.

**Fix:** restore the list with the caller included, and redeploy. Check every caller again.

---

## 9. The kill switch

### 9.1 `503 KILL_SWITCH_ACTIVE` on every request

**Meaning:** the switch is tripped. This is the intended stop.

**Checks:** `kill-switch/status` (any valid key). `active: true` confirms it.

**Fix:** find the trip reason in the incident log. Reset only through the two-operator flow after the cause is known (operator guide, sections 5 to 7).

### 9.2 Reset answers `202` but the switch stays tripped

**Meaning:** `202` is the first request. It is pending until a different operator completes it.

**Fix:** operator 2 sends the second request with their own key (`200`).

### 9.3 Reset answers `409 SAME_OPERATOR_CANNOT_CONFIRM_RESET`

**Cause:** the same key sent both requests.

**Fix:** operator 2 completes it with their own key.

### 9.4 Reset answers `403 CAPABILITY_NOT_ALLOWED`

**Cause:** the key lacks `kill-switch:reset`.

**Fix:** use the right operator's key. Do not borrow another operator's key.

### 9.5 Every request fails with `500` after a redeploy

**Cause:** `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR` is not exactly `true` or `false`. The function stops at startup, and `/ready` fails too.

**Fix:** set the variable to `true` (or `false`), then redeploy. Verify with `npx vercel env ls production` and `/ready`.

### 9.6 `Cannot GET /kill-switch/status`

See section 5.2.

### 9.7 The switch is off but execution is still refused

**Checks:**

```powershell
curl.exe -s "$env:PARMANA_URL/kill-switch/status?nonce=check" -H "Authorization: Bearer $k"
curl.exe -s "$env:PARMANA_URL/ready"
```

If `active` is `false` and `/ready` is `READY`, the refusal is a policy or grant refusal. Read the refusal record.

---

## 10. The Razorpay endpoint

### 10.1 `{"errors":["the body is not { release, signature }"]}`

**Meaning:** correct. The endpoint refuses anything Parmana did not sign.

### 10.2 The endpoint refuses a release with a signature error

**Checks:** the endpoint must hold the current Parmana public key, and the release must be for its own URL (`audience`).

**Fix:** rebuild the endpoint with `build-endpoint.ts`, passing the current `--parmana-url` and the exact `--endpoint-url`, then redeploy.

### 10.3 The endpoint refuses with `expired`

**Cause:** the release is older than its validity window (the release was not used in time).

**Fix:** send a new request. Do not reuse an old release.

### 10.4 `Razorpay refund ... test mode` refused: live key

**Meaning:** the endpoint refuses `rzp_live_` keys before any call. Correct.

**Fix:** use the test-mode key in the endpoint's Vercel variables. Live use needs the go-live plan.

---

## 11. The MCP bridge

### 11.1 `401` without a token

Correct. Send the bearer token.

### 11.2 `401` with the token

**Checks:** the token length, and that the header is exactly `Authorization: Bearer <token>`.

**Fix:** if the token was replaced, the new value must be set in Vercel (`AGENT_STUDIO_TOKEN`) and the project redeployed.

### 11.3 `400 Parse error`

See section 3.6.

### 11.4 The tool returns a refusal

Read the tool result's `rule` and `reason`. They are the same as the runner's refusals (section 7).

---

## 12. Building and tests

### 12.1 `ERR_MODULE_NOT_FOUND` for a `build-*.ts` script

**Cause:** the path is wrong, or you are in the wrong folder.

**Fix:** `cd D:\last\parmana-core`, and check the path with `Test-Path examples\razorpay-agent-studio\build-mcp.ts`.

### 12.2 `Failed to resolve entry for package "@parmana/..."`

**Cause:** workspace packages are not built.

**Fix:**

```powershell
npm ci --ignore-scripts
npm run build
```

### 12.3 `Could not resolve 'vitest/config'`

**Cause:** dependencies are not installed.

**Fix:** `npm ci --ignore-scripts`.

### 12.4 `distrustCompromisedRoots` tests fail

**Cause:** these tests expect Node 24.22.1 or later. Node 22 fails three of them.

**Fix:** run on Node 24, as `package.json` requires. Do not change the tests to pass on Node 22.

### 12.5 `npm run build` regenerates OpenAPI files

**Meaning:** expected. Check with `git status --short`; the regenerated files should match the repository. If they differ, do not commit them without reading them.

---

## 13. When to escalate

Escalate to the founder at once when:
- a refund or other action happened that nobody approved;
- a key was seen by someone who should not have seen it (rotate it, then tell the founder);
- the switch is tripped and the cause is not known;
- a record does not verify (`Verifies offline : false`);
- the same error appears on every caller after a list change, and restoring the list did not help.

Give the founder: the time, the exact output (no keys), the commands run, and the step you stopped at.

---

## Scenarios: complete walkthroughs

Each scenario gives the situation, the goal, the steps in order with the reason for each step, what success looks like, and when to stop and escalate. Work through them in order. Do not skip the checks; each one tells you whether the next step is safe.

### Scenario 1. A command fails on a new machine

**Situation.** You cloned the repository and a script fails with a missing module or a missing workspace package.

**Goal.** A working build and the Razorpay examples running.

**Steps.**
1. Confirm the folder and branch: `cd D:\last\parmana-core`, then `git status -sb`. Why: most failures come from the wrong branch or an old checkout.
2. Install from the lockfile without lifecycle scripts: `npm ci --ignore-scripts`. Why: `--ignore-scripts` avoids changing git hooks on your machine.
3. Build the workspace packages: `npm run build`. Why: the examples import built packages, and a missing build gives `Failed to resolve entry for package`.
4. Run the Razorpay tests: `npx vitest run examples/razorpay-agent-studio examples/razorpay-refund-agent examples/razorpay-refund`. Why: this checks the examples without touching production.

**Success.** The tests pass. Node 24 is expected; on Node 22 the three `distrustCompromisedRoots` tests in the full suite fail, and that is not caused by these examples.

**Escalate** if `npm run build` fails after a clean `npm ci --ignore-scripts`. Send the first error line.

### Scenario 2. An approved refund is refused

**Situation.** You expected `APPROVED`, and the runner printed `REFUSED`.

**Goal.** Find which rule refused it, and whether the refusal is correct.

**Steps.**
1. Read the refusal line. The runner prints `Refused by` with the rule and the reason. Why: the rule name tells you which requirement failed.
2. Match the rule to a cause:
   - `reject-manager-approval-required`: the request had no approval. Add a signed approval for this payment and amount.
   - `authority-not-authorized` (`NOT_AUTHORIZED`): the amount is above the grant's limit. Do not raise the request; check the grant.
   - `signal-state-verification-violation`: the approval was used already, or does not match. Create a new approval.
3. Check the grant if the amount is the problem:
   ```powershell
   curl.exe -s "$env:PARMANA_URL/authority-grants" -H "Authorization: Bearer $k"
   ```
   Why: the grant shows `limits` and `validUntil`. An expired grant that still says `active` blocks new grants and gives no approval.
4. Check the policy in force, if the rule looks wrong:
   ```powershell
   curl.exe -s "$env:PARMANA_URL/policies/in-effect?capability=razorpay:refund" -H "Authorization: Bearer $k"
   ```
   Why: the answer shows which policy version decided the request.
5. Read the refusal record for the transaction (`GET /refusal/<businessTransactionId>`) if you need the signed detail.

**Success.** You can name the rule, the cause, and the fix. A correct refusal is a success of the system: do not work around it.

**Escalate** if the rule is wrong for the policy you approved, or if a refusal names a rule that does not exist in the policy file.

### Scenario 3. The key list update locked callers out

**Situation.** After you replaced `PARMANA_API_KEYS`, a caller returns `401 authentication required`.

**Goal.** Every caller back to `200` on `/callers/me`.

**Steps.**
1. Restore the list at once. Why: a list replacement drops any caller that is missing, and every minute out is an outage for that caller.
   ```powershell
   $value | vercel env add PARMANA_API_KEYS production --sensitive --cwd $link
   ```
   Use the same `$value` as before. If it is gone, rebuild it from `parmana-entries` (ceremony runbook, section 8).
2. Redeploy from current `main`: `git switch main`, `git pull origin main`, then `npx vercel deploy --prod --yes`. Why: list changes are read at startup.
3. Check each caller on its own machine: `curl.exe -s -o NUL -w "%{http_code}\n" "$env:PARMANA_URL/callers/me" -H "Authorization: Bearer $k"`. Expect `200`.
4. For a caller that is still `401`, check its key against its entry (section 8.1 of this guide).

**Success.** All callers return `200`. Record the time, the cause and the fix in the incident log.

**Escalate** if a caller that was in the previous list is not in the entries folder any more. Find out how it went missing before you change anything else.

### Scenario 4. A governed change is stuck

**Situation.** A proposal shows `PENDING_APPROVAL` and nothing happens.

**Goal.** The change is approved, or deliberately left, with a note.

**Steps.**
1. List the pending changes so you have the id and the content:
   ```powershell
   curl.exe -s "$env:PARMANA_URL/policies/pending-changes" -H "Authorization: Bearer $k"
   ```
   Why: the list shows the proposer, the time, and the reason, which the checker needs.
2. Tell the checker the id and what it does. Why: changes wait for a checker; there is no timeout.
3. The checker runs the approve with `--step-up-key-file` and types `APPROVE` only when the change shown is the one intended.
4. Confirm the result with the read that matches the change: `policies/in-effect` for a policy, `authority-grants` for a grant, `external-connectors` for a connector.

**Success.** The read shows the new state. `Status: APPROVED` alone is not enough: confirm the effect.

**Escalate** if the checker cannot approve (`CHECKER_NOT_IN_SCOPE`, section 6.4). A checker-scope decision is the founder's.

### Scenario 5. Trip the kill switch and recover

**Situation.** An incident needs execution stopped now.

**Goal.** Execution and approvals stopped at once; then a reset, by two operators, after the cause is known.

**Steps.**
1. Operator 1 trips with a reason: `kill-switch/trip` with `{"reason": "..."}`. Why: a reason is required and is recorded.
2. Confirm: `kill-switch/status` shows `active: true`. Why: confirms the stop took effect.
3. Confirm the refusal is in force: the runner's no-approval case returns `KILL_SWITCH_ACTIVE`. Why: this proves the stop, without moving money.
4. Investigate. Read the trust records for the suspect transactions with the affected caller's key.
5. Operator 1 starts the reset (`202`). Operator 2 completes it with their own key (`200`). Why: two different keys make sure no one person restarts the system alone.
6. Confirm `active: false`, and re-run the no-approval case: it must return the policy refusal.

**Success.** The switch is off, the cause is in the log, and the policy refusal is back.

**Escalate** if the reset is refused, or if the stop does not take effect (`KILL_SWITCH_ACTIVE` does not appear). Do not reset to test; tell the founder.

### Scenario 6. Production is serving old code

**Situation.** A route you expect is missing (`Cannot GET`), or a fix is not live.

**Goal.** Production runs the current `main`.

**Steps.**
1. Check the local checkout: `git switch main`, `git pull origin main`, `git log -1 --oneline`. Why: a deploy uploads the working folder, so an old checkout deploys old code.
2. Check the kill-switch routes are in the code: `Select-String -Path api\index.ts -Pattern "createKillSwitch"`. Why: two lines means the routes are present.
3. Deploy: `npx vercel deploy --prod --yes`.
4. Check the newest production row: `npx vercel ls parmana-api-real`. Why: it should be Ready and newer than the deploy.
5. Re-run the route that was missing.

**Success.** The route answers. Keep the deploy output in the log.

**Escalate** if `api\index.ts` does not contain the expected line on `main`. The layout may differ from the runbook.

### Scenario 7. A key may have been exposed

**Situation.** A key was printed in a terminal someone else saw, pasted into chat or email, or saved in a file that was shared.

**Goal.** The exposed key stops working, and a new key is in use.

**Steps.**
1. Treat the key as exposed from that moment. Why: you cannot know who copied it.
2. Note the caller id and the time in the incident log. Never write the key in the log.
3. Generate a new key for the same caller, on the holder's machine (ceremony runbook, the matching step).
4. Replace the entry and the live key list, then redeploy (scenario 3).
5. Check the old key now fails: `callers/me` with the old key must return `401`. Why: this proves the old key is no longer accepted.
6. Check the new key returns `200`.
7. Remove the old entry from `parmana-entries`, so a later list update cannot bring it back.
8. Update any system that holds the key: the bridge's variable, the runner's store, or the platform.

**Success.** The old key returns `401`, the new key returns `200`, and every holder has the new key.

**Escalate** at once to the founder. Check the trust records for the caller since the time of exposure, in case the key was used.

### Scenario 8. A checker's step-up key is lost

**Situation.** The checker cannot approve, and the step-up PEM file is missing or cannot be read.

**Goal.** A working step-up key for the checker, and no unapproved change.

**Steps.**
1. Check the file: `Test-Path "$env:USERPROFILE\parmana-checker\step-up.private.pem"`. Why: a missing file is the most common cause.
2. If it is there, check it contains the key: `Select-String -Path ... -Pattern "BEGIN PRIVATE KEY"`. Why: an empty or partial file fails the approve.
3. If the file is lost and the password manager has the PEM, restore it to the same path.
4. If neither has it, the checker cannot approve. Generate a new checker credential with a new step-up key (ceremony runbook, the checker step), and replace the entry and the key list. Why: the old public key in the entry must match the private key the checker holds.

**Success.** A test approve of a harmless pending change works, or the replacement is in the list and the checker can approve.

**Escalate** if the entry's public key does not match the file. Do not approve anything until this is explained.

### Scenario 9. Vercel deploy fails

**Situation.** `npx vercel deploy --prod --yes` stops with a build error.

**Goal.** A successful deploy of the right code.

**Steps.**
1. Read the first error line, not the last. Why: the first line names the real cause.
2. Match it to section 4 of this guide (for example `Missing script: "openapi"` or `No Output Directory named "public"`).
3. Apply the fix in the deployed folder, not in the repository, unless the fix belongs in the code.
4. Deploy again and read the new first error line.
5. When it is `Ready`, check `npx vercel ls <project>` and the route you deployed for.

**Success.** The newest Production row is Ready, and the route answers.

**Escalate** if the error is inside the code (a TypeScript or test error). Send the error and stop; do not change the code to get past a build.

### Scenario 10. A refund does not appear in Razorpay

**Situation.** The runner printed `APPROVED`, but the Razorpay dashboard shows no refund.

**Goal.** Find the refund, or prove it was not created.

**Steps.**
1. Read the record file the runner wrote (`--out`). Note the `refundId` (`rfnd_...`) and the business transaction id.
2. Check the dashboard in Test Mode, for the payment, under refunds. Filter by the period. Why: the list can be filtered by date and status.
3. Search by refund id, then by the payment id.
4. If it is missing, check the endpoint's answer in the record. A `success: false` answer with a stage names the step that failed.
5. Check the receipt: the refund's receipt should equal the business transaction id.

**Success.** The refund is found with its receipt, or the endpoint's answer shows why it was not created.

**Escalate** if the record says `success: true` and no refund exists. Do not send the request again: tell the founder with the record.

### Scenario 11. A record does not verify

**Situation.** The runner prints `Verifies offline : false`, or a customer's check fails.

**Goal.** Know whether the record is genuine.

**Steps.**
1. Keep the record file. Do not delete it. Why: it is the evidence.
2. Re-run the verification with the current public key, to rule out a stale key: fetch `GET /keys/default` and verify again.
3. If it still fails, compare the record's `errors` list with the rule for each error.
4. Check the record was not edited: the file must be the one the runner wrote.

**Success.** The record verifies, or the failure is explained and the founder knows.

**Escalate** at once. A record that does not verify is not to be trusted until explained.

### Scenario 12. The stop hook keeps reporting unpushed commits

**Situation.** The hook reports a branch with unpushed commits, but the remote already has them.

**Goal.** The hook stops reporting, without pushing again.

**Steps.**
1. Confirm the remote: `git ls-remote --heads origin <branch>` and `git log -1 --oneline` on the branch. Why: if the remote commit equals the local commit, nothing is unpushed.
2. Fetch the branch into the checkout the hook reads: `git fetch origin <branch>:<branch>`.
3. Check: `git status -sb` shows the branch with no ahead or behind.
4. If the commits are on `main` already, the hook counts them against `main`; merge the branch through a PR.

**Success.** The hook is quiet, or the PR is merged.

**Escalate** if the remote does not have the branch. Push it once: `git push -u origin <branch>`.

### Scenario 13. The MCP bridge answers 401 with the token

**Situation.** A call with the bearer token returns `401`.

**Goal.** The token the caller sends matches the one on the server.

**Steps.**
1. Check the length: `$t.Length` should be 43 for a token made by the standard command. Why: a short or long value means a bad copy.
2. Send the request from a file, with `--data-binary` (section 3.6). Why: inline JSON can be mangled.
3. If the length is right and it still fails, the server holds a different value. Replace `AGENT_STUDIO_TOKEN` in Vercel and redeploy the bridge.
4. Save the new token in the password manager before copying anything else.

**Success.** The request returns `200`, and `tools/list` shows `propose_refund`.

**Escalate** if the token was pasted into chat at any time: rotate it (scenario 7).

---

## Scenario checklist

- [ ] Scenario 1: build and tests pass.
- [ ] Scenario 2: every refusal has a named rule and a correct cause.
- [ ] Scenario 3: all callers return `200` after a list change.
- [ ] Scenario 4: no change stays pending without a note.
- [ ] Scenario 5: a trip was confirmed; a reset used two keys.
- [ ] Scenario 6: production serves current `main`.
- [ ] Scenario 7: an exposed key was replaced and the old one returns `401`.
- [ ] Scenario 8: the checker can approve.
- [ ] Scenario 9: the deploy reads Ready.
- [ ] Scenario 10: every refund is traced to Razorpay.
- [ ] Scenario 11: every record verifies, or is escalated.
- [ ] Scenario 12: the hook is quiet, or the PR is merged.
- [ ] Scenario 13: the bridge answers `200` with the token.


## Change log

- 23 October 2026: first version, from the work on the refund agent, the MCP bridge, the key list and the kill switch.
- 23 October 2026: added the complete scenario walkthroughs (scenarios 1 to 13) and a checklist.
