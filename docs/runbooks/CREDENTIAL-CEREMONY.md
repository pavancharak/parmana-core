# Credential ceremony: maker, checker and operator keys, with kill-switch controls

Step-by-step procedure for creating the maker, checker and operator credentials, updating Parmana's live key list, redeploying, and verifying each caller. It also covers using the kill switch safely around that work.

Authority: `docs/runbooks/KILL-SWITCH-OPERATIONS.md` governs the kill switch. If this runbook and that one differ, the kill-switch runbook wins, and this file must be corrected.

This runbook never contains a key, a token or a database URL. Do not paste any of them into chat, email, a ticket or a commit.

---

## 0. Rules before you start

1. **Two people.** The checker is a different person from the maker. Operator B is a different person from operator A. One person holding two roles is an open risk (see the founder book, Part 31, item 2). Do not run this ceremony with one person.
2. **Each person works on their own machine.** Keys are generated and stored on the holder's machine.
3. **Only public material moves between people.** The entry file (a JSON line with the key's hash and capabilities) and, for the checker, the step-up public key. Never a private key or a raw key.
4. **Tripping the switch stops approvals too.** Do not trip the switch while creating or approving makers, checkers or grants.
5. **A reset needs two different keys.** The same key cannot finish its own reset (`409 SAME_OPERATOR_CANNOT_CONFIRM_RESET`).
6. **Changes to the key list and kill-switch settings need a redeploy.** Settings are read at startup.

---

## 1. Roles and credentials

| Credential | Caller id (example) | Holder | Capabilities on the key | Stored by the holder in |
| --- | --- | --- | --- | --- |
| Maker | `maker-<name>` | Maker | none | Password manager |
| Checker | `checker-<name>` | Checker | none | Password manager, and the step-up PEM in `%USERPROFILE%\parmana-checker\step-up.private.pem` |
| Operator A | `operator-a` | Operator A | `kill-switch:trip`, `kill-switch:reset` | Password manager |
| Operator B | `operator-b` | Operator B | `kill-switch:reset` | Password manager |

The probe key (`kill-switch-probe`, `kill-switch:probe`) belongs to the scheduled probe workflow and is not part of this ceremony.

---

## 2. Folders on each machine

Create once per machine. Run in PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\parmana-entries" | Out-Null   # entry files: hashes and capabilities, no raw keys
New-Item -ItemType Directory -Force "$env:USERPROFILE\parmana-secrets" | Out-Null   # encrypted values for this Windows user only
New-Item -ItemType Directory -Force "$env:USERPROFILE\parmana-checker" | Out-Null   # checker step-up key
New-Item -ItemType Directory -Force "$env:USERPROFILE\parmana-vercel-link" | Out-Null  # folder linked to parmana-api-real
```

Set the session variables. They last for this PowerShell window only:

```powershell
$env:PARMANA_URL = "https://parmana-api-real.vercel.app"
$stepUp = "$env:USERPROFILE\parmana-checker\step-up.private.pem"
$stepUpId = "checker-<name>"          # the checker's caller id
```

---

## 3. Step 1: Check production is clear

Any valid key can read status. Use the operator's or checker's key when you have it; the check needs only an authenticated caller.

```powershell
curl.exe -s "$env:PARMANA_URL/ready"
curl.exe -s "$env:PARMANA_URL/kill-switch/status?nonce=ceremony-start" -H "Authorization: Bearer <a-valid-key>"
```

Expected:
- `/ready` returns `READY`.
- Status shows `"active":false`, with your nonce echoed and `"signed":false`.

If `active` is `true`, stop. Find out why before you continue (see section 12).

---

## 4. Step 2: Generate the maker (maker's machine)

```powershell
cd D:\last\parmana-core
$out = npx tsx scripts/generate-api-key.ts --caller-id maker-<name> --credential-holder-type USER
$out | Where-Object { $_.StartsWith('{"callerId"') } | Set-Content "$env:USERPROFILE\parmana-entries\maker-<name>.json" -Encoding ascii
$k = (($out | Where-Object { $_ -match '^Key\s+:' }) -replace '^Key\s+:\s*', '').Trim()
"key length: $($k.Length)"
Set-Clipboard -Value $k
```

Then:
1. Expect `key length: 43`. Anything else means the capture failed; run it again.
2. Save the key in the password manager under the maker's name.
3. Clear the clipboard: `Set-Clipboard -Value " "`.
4. Clear the variable: `Remove-Variable k, out`.
5. Send the operator `maker-<name>.json` only.

Note: `$out` holds the raw key until it is removed, so clear it in step 4.

---

## 5. Step 3: Generate the checker (checker's machine)

The checker also gets a step-up key. The step-up private key stays on the checker's machine.

```powershell
cd D:\last\parmana-core
$out = npx tsx scripts/generate-api-key.ts --caller-id checker-<name> --credential-holder-type USER --generate-step-up-key
$out | Where-Object { $_.StartsWith('{"callerId"') } | Set-Content "$env:USERPROFILE\parmana-entries\checker-<name>.json" -Encoding ascii
$k = (($out | Where-Object { $_ -match '^Key\s+:' }) -replace '^Key\s+:\s*', '').Trim()
"key length: $($k.Length)"
Set-Clipboard -Value $k
$pem = ($out -join "`n") -replace '(?s).*(-----BEGIN PRIVATE KEY-----.*?-----END PRIVATE KEY-----).*', '$1'
$pem | Set-Content "$env:USERPROFILE\parmana-checker\step-up.private.pem" -Encoding ascii
Select-String -Path "$env:USERPROFILE\parmana-checker\step-up.private.pem" -Pattern "BEGIN PRIVATE KEY"
```

Then:
1. Expect `key length: 43` and one matching `BEGIN PRIVATE KEY` line.
2. Save the key and the step-up PEM (the whole block shown in the terminal) in the password manager.
3. Clear the clipboard and the variables: `Set-Clipboard -Value " "`, `Remove-Variable k, out, pem`.
4. Send the operator `checker-<name>.json`. The step-up public key is inside that file as `stepUpPublicKey`.

---

## 6. Step 4: Generate operator A (operator A's machine)

```powershell
cd D:\last\parmana-core
$out = npx tsx scripts/generate-api-key.ts --caller-id operator-a --credential-holder-type USER --allowed-capabilities "kill-switch:trip,kill-switch:reset"
$out | Where-Object { $_.StartsWith('{"callerId"') } | Set-Content "$env:USERPROFILE\parmana-entries\operator-a.json" -Encoding ascii
$k = (($out | Where-Object { $_ -match '^Key\s+:' }) -replace '^Key\s+:\s*', '').Trim()
"key length: $($k.Length)"
Set-Clipboard -Value $k
```

Then save the key, clear the clipboard and variables, as in step 2.

Status for this run: operator A was generated on 23 October 2026 (`key length: 43`). Its key must be saved in the password manager, and the clipboard cleared, before the next step.

---

## 7. Step 5: Generate operator B (operator B's machine, a different person)

```powershell
cd D:\last\parmana-core
$out = npx tsx scripts/generate-api-key.ts --caller-id operator-b --credential-holder-type USER --allowed-capabilities "kill-switch:reset"
$out | Where-Object { $_.StartsWith('{"callerId"') } | Set-Content "$env:USERPROFILE\parmana-entries\operator-b.json" -Encoding ascii
$k = (($out | Where-Object { $_ -match '^Key\s+:' }) -replace '^Key\s+:\s*', '').Trim()
"key length: $($k.Length)"
Set-Clipboard -Value $k
```

Operator B saves the key and clears the clipboard, then sends the operator `operator-b.json`.

If there is no second person, stop. Operator B's reset cannot be completed without them.

---

## 8. Step 6: Assemble the entries (the operator)

Put every entry file in `%USERPROFILE%\parmana-entries`:
- `maker-<name>.json` from the maker
- `checker-<name>.json` from the checker
- `operator-a.json` (created on this machine in step 4)
- `operator-b.json` from operator B

Keep the existing entries already in the folder: `paytm-refund-agent.json` and `razorpay-demo-agent.json`. Replacing the key list drops every caller that is missing, so none may be left out.

Print the list:

```powershell
$link = "$env:USERPROFILE\parmana-vercel-link"
$entries = @(Get-ChildItem "$env:USERPROFILE\parmana-entries\*.json" | ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json })
$entries | ForEach-Object { "{0}  capabilities={1}" -f $_.callerId, ($_.allowedCapabilities -join ",") }
```

Check that all six callers appear: `maker-<name>`, `checker-<name>`, `operator-a`, `operator-b`, `paytm-refund-agent`, `razorpay-demo-agent`. If one is missing, stop.

---

## 9. Step 7: Replace the live key list (no trip)

```powershell
$value = ConvertTo-Json -InputObject $entries -Depth 5 -Compress
vercel env rm PARMANA_API_KEYS production --yes --cwd $link
$value | vercel env add PARMANA_API_KEYS production --sensitive --cwd $link
```

Expect `Added PARMANA_API_KEYS`.

Do not run the `rm` line again unless the `add` has failed. If the `add` fails, every key is rejected until the list is restored. Restore it immediately: run the `add` line again with the same `$value`.

---

## 10. Step 8: Redeploy from current main

The runbook requires production to be deployed from a current checkout of `main`.

```powershell
cd D:\last\parmana-core
git status --short                       # expect no output for tracked files
git switch main
git pull origin main
git log -1 --oneline
Select-String -Path api\index.ts -Pattern "createKillSwitch"   # expect two lines; none means an old checkout: stop
npx vercel deploy --prod --yes
```

If the CLI asks you to link a project, stop. The only correct project is `parmana-api-real`.

Expected: the deployment is `Ready`. Check it in `npx vercel ls parmana-api-real`: the top Production row should be newer than the key-list change.

---

## 11. Step 9: Verify each caller (each holder, on their own machine)

Each holder checks only their own key:

```powershell
$env:PARMANA_URL = "https://parmana-api-real.vercel.app"
$k = <paste from the password manager, or read from the encrypted store>
curl.exe -s -o NUL -w "%{http_code}\n" "$env:PARMANA_URL/callers/me" -H "Authorization: Bearer $k"
curl.exe -s "$env:PARMANA_URL/kill-switch/status?nonce=verify-<caller-id>" -H "Authorization: Bearer $k"
Remove-Variable k
```

Expected for each caller: `200`, and status with `"active":false`.

Record the result of each caller in the ceremony log (section 14). A `401` means the list does not contain that key (see section 12).

The key for `razorpay-demo-agent` and `paytm-refund-agent` is checked by the operator, from the encrypted store:

```powershell
$k = Read-Secret "razorpay-demo-agent.key"
curl.exe -s -o NUL -w "%{http_code}\n" "$env:PARMANA_URL/callers/me" -H "Authorization: Bearer $k"
Remove-Variable k
```

---

## 12. Troubleshooting

| What you see | Cause | Action |
| --- | --- | --- |
| `key length` is not 43 | The copy failed | Run the generation again |
| `401 authentication required` on `/callers/me` | The key is not in the live list, or the wrong key is used | Check the key against its entry (hash), then the list; redeploy if the list changed |
| `403 CAPABILITY_NOT_ALLOWED` on a kill-switch route | The key lacks the capability | Check section 1; regenerate the key with the right capabilities |
| `503 KILL_SWITCH_ACTIVE` | The switch is tripped | Find the trip reason; reset only after the cause is known (section 13) |
| `Caller is not permitted to invoke this capability` | The wrong key was loaded in the session | Load the right key, in a new window if needed |
| `This action requires a caller credential provisioned as a verified human` | A non-human key was used to approve | Use the checker's key |
| `Cannot GET /kill-switch/status` | An old checkout was deployed | Deploy from current `main` (section 10) |
| The function fails at startup with `500` on every request | `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR` is not exactly `true` or `false` | Set it to `true` or `false` and redeploy |

---

## 13. Kill switch: trip, confirm, reset, drill

Run these only when the founder has agreed, and never during a governed approval.

### 13.1 Trip (operator A)

```powershell
$k = Read-Secret "operator-a.key"
curl.exe -s -X POST "$env:PARMANA_URL/kill-switch/trip" -H "Authorization: Bearer $k" -H "Content-Type: application/json" -d "{\"reason\":\"<reason>\"}"
Remove-Variable k
```

Expected: `200` with the state. No reason gives `400`.

### 13.2 Confirm the stop (no money moves)

```powershell
$env:PARMANA_API_KEY = Read-Secret "razorpay-demo-agent.key"
npx tsx examples/razorpay-refund/send.ts --case no-approval --payment pay_TrPtgJ3RVnzzFi --amount 100 --out record-drill.json
```

Expected while tripped: refused before policy with `KILL_SWITCH_ACTIVE` (503). Record what is returned. Note: this result is documented in the runbook and tested in tutorial 124, but has not been run live.

### 13.3 Reset, two operators

Operator A asks first (`202`, pending), then operator B completes it (`200`, lifted):

```powershell
# Operator A
$k = Read-Secret "operator-a.key"
curl.exe -s -X POST "$env:PARMANA_URL/kill-switch/reset" -H "Authorization: Bearer $k" -H "Content-Type: application/json" -d "{\"reason\":\"<reason>\"}"
Remove-Variable k

# Operator B (their own machine, their own key)
$k = Read-Secret "operator-b.key"
curl.exe -s -X POST "$env:PARMANA_URL/kill-switch/reset" -H "Authorization: Bearer $k" -H "Content-Type: application/json" -d "{\"reason\":\"<reason>, confirmed\"}"
Remove-Variable k
```

Expected: operator A gets `202` with `outcome: "pending"`; operator B gets `200` with `outcome: "reset"`. If operator A repeats the request, the answer is `409`. A new trip cancels a pending reset.

### 13.4 Verify

Status shows `"active":false`. Re-run the no-approval case: it must now give the policy refusal, `reject-manager-approval-required`.

Note: the two-operator reset is enabled in production but has not yet been exercised with two real operator keys. Record the result of the first real exercise.

---

## 14. Enabling and disabling the switch feature

Two controls are easy to confuse:

| Control | What it does | How | Redeploy |
| --- | --- | --- | --- |
| Trip and reset (the API routes) | Stops execution and approvals; a reset lifts it | API call by an operator | No |
| The feature (`KILL_SWITCH_ENABLED`) | Turns the guard machinery on or off | Vercel variable | Yes |

Enable (production, per the runbook):

```powershell
cd D:\last\parmana-core
vercel env add KILL_SWITCH_ENABLED production                       # Config, value: true
vercel env add KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR production   # value: true
npx vercel deploy --prod --yes
```

Disable: removing `KILL_SWITCH_ENABLED` turns the guard off, so an operator can no longer stop the system through the API. Only in an emergency, with the founder's agreement, and recorded:

```powershell
vercel env rm KILL_SWITCH_ENABLED production --yes
npx vercel deploy --prod --yes
```

Verify after any change: `vercel env ls production` (both names, as Config), `npx vercel ls parmana-api-real` (the newest Production row is Ready), and `/ready`.

---

## 15. Ceremony log

Record each step, the person, the date and the result. Do not record keys.

| Step | Done by | Date | Result |
| --- | --- | --- | --- |
| 1. Production clear (`active:false`) | | | |
| 2. Maker generated; entry sent | | | |
| 3. Checker generated; step-up PEM saved; entry sent | | | |
| 4. Operator A generated (`key length: 43`) | Operator A | 23 Oct 2026 | Done; key to password manager, clipboard cleared |
| 5. Operator B generated; entry sent | | | |
| 6. Entries assembled; list printed (six callers) | | | |
| 7. `PARMANA_API_KEYS` replaced | | | |
| 8. Redeployed from `main`; `api\index.ts` check passed | | | |
| 9. Each caller returns `200` on `/callers/me` | | | |
| 10. Drill (13.1 to 13.4) run or skipped, with reason | | | |
| 11. Keys pasted into chat rotated | | | |

---

## 16. Checklist

- [ ] Section 3: production clear.
- [ ] Maker and checker generated on their own machines, by different people.
- [ ] Operator A and operator B generated, by different people.
- [ ] Every key saved to a password manager; clipboards cleared; no key in chat, email or a commit.
- [ ] Entry files in `parmana-entries`; the printed list has all six callers.
- [ ] `PARMANA_API_KEYS` replaced; redeploy from current `main`; `Select-String` check passed.
- [ ] Each caller's key returns `200` on `/callers/me`.
- [ ] Drill run, or skipped with a reason.
- [ ] Any key that was pasted in chat is rotated (the kill-switch runbook lists them).
- [ ] Ceremony log (section 15) complete and sent to the founder.
