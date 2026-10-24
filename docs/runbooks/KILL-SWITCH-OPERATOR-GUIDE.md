# Kill switch: operator guide (Operator 1 and Operator 2)

Detailed, step-by-step guide for the two operators who control Parmana's kill switch. It explains what each operator does, in what order, with what commands, and what each result means.

Authority: `docs/runbooks/KILL-SWITCH-OPERATIONS.md` is the governing runbook (ADR-0017). If this guide and that runbook differ, the governing runbook wins; correct this guide.

This guide never contains a key, a token or a database URL. Do not paste any of them into chat, email, a ticket or a commit.

---

## 1. The two operators

| | Operator 1 (operator A) | Operator 2 (operator B) |
| --- | --- | --- |
| Caller id | `operator-a` | `operator-b` |
| Capabilities on the key | `kill-switch:trip`, `kill-switch:reset` | `kill-switch:reset` |
| Can trip the switch | Yes | No |
| Can start a reset | Yes (first request, `202`) | Yes (second request, completes it) |
| Can complete a reset started by the other operator | No | Yes |
| Must be a different person from the other operator | Yes | Yes |

Operator 1 can stop the system. Operator 2 is the second pair of hands needed to restart it. Neither can do the other's part alone.

A key without the matching capability gets `403 CAPABILITY_NOT_ALLOWED`. A request without a key gets `401`.

---

## 2. Rules for both operators

1. **Two people, always.** Operator 1 and Operator 2 are different people on different machines.
2. **Keys stay on your machine.** Store your key in your password manager. Never paste it into chat, email, a ticket or a commit.
3. **Clear the clipboard after every key copy:** `Set-Clipboard -Value " "`.
4. **Trip only for a real stop or an agreed drill.** A trip also stops governed approvals. Do not trip while makers, checkers or grants are being created or approved.
5. **Give a real reason every time.** A trip or reset without a reason is refused with `400`.
6. **Do not reset until the cause is known and written down.**
7. **Record every action** in the incident log (section 9), with the time and the result.

---

## 3. Session setup (both operators)

Run in PowerShell, in a new window, on your own machine:

```powershell
$env:PARMANA_URL = "https://parmana-api-real.vercel.app"

function Read-Secret([string]$Name) {
  $secure = Get-Content "$env:USERPROFILE\parmana-secrets\$Name.dpapi" | ConvertTo-SecureString
  [System.Net.NetworkCredential]::new("", $secure).Password
}
```

`Read-Secret` reads a key from the encrypted store on your machine (only if you saved it there). If you keep your key only in the password manager, paste it into a variable for the duration of the command and remove it straight after:

```powershell
$k = Read-Host "Paste your key (hidden)" -AsSecureString
$k = [System.Net.NetworkCredential]::new("", $k).Password.Trim()
# ... run your commands using $k ...
Remove-Variable k
```

Every command below uses `$k`. Remove it after each command (`Remove-Variable k`) so no key stays in the window.

---

## 4. Check the state (both operators, any time)

Status is open to any valid key. Use it before you do anything else.

```powershell
curl.exe -s "$env:PARMANA_URL/ready"
curl.exe -s "$env:PARMANA_URL/kill-switch/status?nonce=check-<yyyymmdd-hhmm>" -H "Authorization: Bearer $k"
```

What you should see:

| Field | Normal | Meaning if different |
| --- | --- | --- |
| `/ready` | `READY` | The service is not ready. Check the deploy and the environment variables |
| `active` | `false` | `true`: the switch is tripped. Execution and approvals are refused |
| `nonce` | Your nonce, echoed back | Proves the answer is fresh |
| `signed` | `false` | Expected today; signing is not yet built (G-118) |
| `version` | A number that rises with each trip or reset | Use it when you write the log |

`Cannot GET /kill-switch/status` means the deployment does not have the kill-switch routes. Stop, and tell the founder: an old checkout was deployed.

---

## 5. Operator 1: trip the switch

Use only for a real stop or an agreed drill. Operator 1 runs these steps.

**Step 1.** Check the state (section 4). Note the `version`.

**Step 2.** Write the reason first, in the incident log, so the reason and the time are recorded before the trip.

**Step 3.** Trip, with the reason:

```powershell
$k = <your operator-a key, as in section 3>
curl.exe -s -X POST "$env:PARMANA_URL/kill-switch/trip" -H "Authorization: Bearer $k" -H "Content-Type: application/json" -d "{\"reason\":\"<short reason, for example: incident INC-123, suspected unauthorised refund>\"}"
Remove-Variable k
```

Expected: `200` with the new state. The `version` has risen, and `active` is `true`.

**Step 4.** Confirm with status (section 4). `active` must be `true`.

**Step 5.** Tell Operator 2 and the founder that the switch is tripped, with the reason and the time.

Errors:
- `400`: no reason was sent. Send the reason and try again.
- `403 CAPABILITY_NOT_ALLOWED`: this key cannot trip. You are not Operator 1, or the key is wrong. Do not try another key.
- `401`: the key is not in the live list. Check section 8 of the ceremony runbook.

---

## 6. Operator 1: start a reset (first request)

Start a reset only when the cause is known, written down and agreed with Operator 2 and the founder.

**Step 1.** Confirm the cause is recorded in the incident log, with a note of what was checked.

**Step 2.** Operator 1 sends the first reset request:

```powershell
$k = <your operator-a key>
curl.exe -s -X POST "$env:PARMANA_URL/kill-switch/reset" -H "Authorization: Bearer $k" -H "Content-Type: application/json" -d "{\"reason\":\"<cause and what was checked>\"}"
Remove-Variable k
```

Expected: `202`, with `outcome: "pending"`. The reset is not yet done. The switch is still tripped.

**Step 3.** Operator 1 must not send a second reset request. Repeating it from the same key gives `409 SAME_OPERATOR_CANNOT_CONFIRM_RESET`, which is correct: the same key cannot confirm its own reset.

**Step 4.** Tell Operator 2 that a reset is pending, and hand over the reason, not the key.

A new trip cancels a pending reset. If the cause is still under investigation, do not start a reset.

---

## 7. Operator 2: complete the reset (second request)

Operator 2 completes a reset only after checking the cause themselves. Operator 2 must not complete a reset on Operator 1's word alone.

**Step 1.** Check the state (section 4). The switch must still be tripped, and a reset must be pending.

**Step 2.** Read the incident log entry for the reason, and check the cause yourself. Use the trust records for the affected transactions (section 10).

**Step 3.** If the cause is resolved, complete the reset with your own key:

```powershell
$k = <your operator-b key>
curl.exe -s -X POST "$env:PARMANA_URL/kill-switch/reset" -H "Authorization: Bearer $k" -H "Content-Type: application/json" -d "{\"reason\":\"<cause resolved, what you checked>\"}"
Remove-Variable k
```

Expected: `200`, with `outcome: "reset"`.

**Step 4.** Confirm with status (section 4). `active` must be `false`.

**Step 5.** Re-check the system: send the no-approval case of the runner. It must now give the normal policy refusal, `reject-manager-approval-required`, not `KILL_SWITCH_ACTIVE`:

```powershell
$env:PARMANA_API_KEY = <the agent's key, from the encrypted store>
npx tsx examples/razorpay-refund/send.ts --case no-approval --payment pay_TrPtgJ3RVnzzFi --amount 100 --out record-recheck.json
```

If the result is still `KILL_SWITCH_ACTIVE`, do not allow approvals; tell Operator 1 and the founder.

**If Operator 2 disagrees with the reset,** do not complete it. Write the disagreement in the log. The switch stays tripped until the founder decides.

---

## 8. What the other operator can and cannot do

| Action | Operator 1 | Operator 2 |
| --- | --- | --- |
| Trip | Yes | No (`403`) |
| First reset request | Yes (`202`) | Yes (`202`), if Operator 1 has not started one |
| Second reset request (completes) | No (`409` from the same key) | Yes (`200`) |
| Check status | Yes | Yes |
| Trip while Operator 2 has a reset pending | Yes (cancels the pending reset) | No |

Operator 2 should not start a reset while Operator 1 has one pending, and should not trip. If Operator 2 needs to stop the system, they tell Operator 1 and the founder, who decides.

---

## 9. Incident log

Keep one log for each trip. Keep it outside the repository, on an operator's machine, and share it with the founder.

Record:

| Field | Example |
| --- | --- |
| Incident id | INC-2026-10-23-01 |
| Trip time (local, with time zone) | 2026-10-23 16:40 IST |
| Trip by | Operator 1 |
| Trip reason | Suspected unauthorised refund |
| Status `version` before and after the trip | 0 then 1 |
| Affected callers and transactions | `razorpay-demo-agent`, `<businessTransactionId>` |
| Checks done | Trust records read; external refunds compared |
| Reset requested by | Operator 1 at (time), `202` |
| Reset completed by | Operator 2 at (time), `200` |
| Final status | `active:false`, `version` |
| Follow-up | Keys rotated? Policy changed? |

Never write a key in the log.

---

## 10. Checking the affected transactions (both operators)

Read the trust record for each suspect transaction, with the affected caller's key, not an operator's key:

```powershell
$k = <the affected caller's key>
curl.exe -s "$env:PARMANA_URL/trust-records/<businessTransactionId>" -H "Authorization: Bearer $k"
Remove-Variable k
```

Read the refusal record for a refused transaction:

```powershell
curl.exe -s "$env:PARMANA_URL/refusal/<businessTransactionId>" -H "Authorization: Bearer $k"
```

Save the output to a file in the incident folder. Do not delete anything. The external system (for example the Razorpay dashboard) is the final evidence of what happened to money.

Note: the trust record for a transaction the operator did not start can only be read with that caller's key, so the caller's holder must run the read, or the caller's key must be handed over for the read (both only for the incident, and recorded in the log).

---

## 11. Errors and what they mean

| Response | Who sees it | Meaning | Action |
| --- | --- | --- | --- |
| `200` on trip | Operator 1 | The switch is tripped | Confirm with status |
| `200` with `outcome: "reset"` | Operator 2 | The reset is complete | Confirm with status, then re-check (section 7) |
| `202` with `outcome: "pending"` | Operator 1 or 2 | The first request of a reset | Hand over to the other operator |
| `400` `reason is required` | Either | No reason sent | Send a reason |
| `401` | Either | Key not in the live list | Check the ceremony runbook, section 12 |
| `403` `CAPABILITY_NOT_ALLOWED` | Either | The key lacks the capability | Use the right operator's key; do not borrow another |
| `409` `SAME_OPERATOR_CANNOT_CONFIRM_RESET` | Operator 1 repeating | The same key cannot finish its own reset | Operator 2 completes it |
| `503` `KILL_SWITCH_ACTIVE` | Anyone sending a request | The switch is tripped; execution and approvals refused | Expected while tripped |
| `500` on every request | Anyone | `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR` is not exactly `true` or `false` | Founder and engineering; a deploy is needed |
| `Cannot GET /kill-switch/...` | Anyone | An old checkout was deployed | Stop; deploy from current `main` |

---

## 12. Drill (both operators, only when agreed)

A drill proves the procedure works, without a real incident. Agree the date and time with the founder, and run it outside any governed approval.

1. Operator 1 trips with the reason `drill <date>`.
2. Either operator sends the no-approval case (section 7, step 5). The expected answer is `KILL_SWITCH_ACTIVE`. Record the actual answer.
3. Operator 1 starts the reset (`202`).
4. Operator 2 completes it (`200`).
5. Either operator re-checks status and the no-approval case. The expected answer is the policy refusal.
6. Record the drill in the log, with each result.

Note: the two-operator reset is enabled in production but has not yet been exercised with two real operator keys. The first drill is the first real test. Record every result, including failures.

---

## 13. Enable and disable the feature (founder decision)

The feature is separate from the trip. Do not change it as an operator; the founder decides.

- **Enable:** `KILL_SWITCH_ENABLED=true` (Config) and `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR=true`, then redeploy from current `main`.
- **Disable:** removing `KILL_SWITCH_ENABLED` turns the guard off. Then operators cannot stop the system through the API. Only in an emergency, with the founder's agreement, and recorded.

Full commands are in `docs/runbooks/CREDENTIAL-CEREMONY.md`, section 14.

---

## 14. Summary card (print and keep with the operator)

**Operator 1 (operator A):**
1. Check status. Write the reason.
2. Trip with the reason. Confirm `active:true`. Tell Operator 2.
3. When the cause is known: start the reset (`202`). Do not repeat it.

**Operator 2 (operator B):**
1. Check status. Read the log. Check the cause yourself.
2. If resolved: complete the reset (`200`). Confirm `active:false`.
3. Re-check with the no-approval case: expect the policy refusal.

**Both:** never paste a key; clear the clipboard; log every action; a trip stops approvals too.
