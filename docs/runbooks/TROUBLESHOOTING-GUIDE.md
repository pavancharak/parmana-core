# Troubleshooting guide: commands and steps

Step-by-step checks for the problems operators meet most often: local setup, PowerShell, Vercel, the Parmana API, governed changes, the refund runner, the key list, the kill switch and the Razorpay endpoint.

How to use it: find the symptom in the index, run the checks in order, and stop at the first step that gives an unexpected result. The fix is in the same section. If a fix is not listed, record the exact output and tell the founder.

Never paste a key, token or database URL into chat, email, a ticket or a commit when you troubleshoot. Use the output's status code and message, not the secret.

---

## Index

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

## Change log

- 23 October 2026: first version, from the work on the refund agent, the MCP bridge, the key list and the kill switch.
