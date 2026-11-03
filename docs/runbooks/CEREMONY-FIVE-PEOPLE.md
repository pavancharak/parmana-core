# Credential ceremony with five people: roles, reasons, steps and commands

This document is the working guide for the fresh-credentials ceremony on the production key list (`PARMANA_API_KEYS` on `parmana-api-real`). It names the five people, sets out who does what and why five are needed, and gives every command in order. The full procedure and the rules are in `docs/runbooks/CREDENTIAL-CEREMONY.md`. Where the two differ, this document applies to this run, and the reason is given.

Status: written 3 November 2026. Not yet run.

## People in this run

| Person   | Role                        | Caller id       | Holds a key |
| -------- | --------------------------- | --------------- | ----------- |
| Pavan    | Maker                       | `maker-pavan`   | Yes         |
| Mamta    | Checker, with a step-up key | `checker-mamta` | Yes         |
| Asha     | Operator A                  | `operator-a`    | Yes         |
| Mohinder | Operator B                  | `operator-b`    | Yes         |
| Shalini  | Assembler                   | none            | No          |

Five people in total: four hold a key, and the assembler holds none.

---

## 1. Why five people

The ceremony needs five people. Four of them hold a key, each in one role. The fifth, the assembler, holds no key. No person holds two roles.

| Reason                                                                                                                  | Rule in the runbook                                                                               | What goes wrong with fewer people                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| The checker must not be the maker. A maker who could approve their own change could ship a change nobody else reviewed. | Section 0, rule 1. The server also refuses it with `SameActorCannotApproveOwnChangeError`.        | One person can propose and approve a change to production.                             |
| Operator B must not be operator A. Resetting the kill switch needs two different keys.                                  | Section 0, rule 5. The server refuses the same key with `409 SAME_OPERATOR_CANNOT_CONFIRM_RESET`. | One person can trip and reset the switch alone, so the safety check does nothing.      |
| Each holder generates their own key on their own machine, and only public material moves between people.                | Section 0, rules 2 and 3.                                                                         | A key that passed through another person's machine is not one that person holds alone. |
| The runbook says not to run the ceremony with one person, and records any shared role as an open risk.                  | Section 0, rule 1.                                                                                | Shared roles become quiet defaults and are never reviewed.                             |

The runbook requires at least two people. This run uses five, so that no one holds two of the roles. That is the decision for this run.

---

## 2. Roles and responsibilities

| Role       | Person (this run) | Caller id       | Machine    | Capabilities on the key                 | Responsible for                                                                                                                                       |
| ---------- | ----------------- | --------------- | ---------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maker      | Pavan             | `maker-pavan`   | Pavan's    | none                                    | Generates the maker key. Proposes changes to the key list, and to policies. Sends only the entry file.                                                |
| Checker    | Mamta             | `checker-mamta` | Mamta's    | none, plus a step-up key                | Generates the checker key and its step-up key pair. Keeps the step-up private key on her machine. Sends only the entry file.                          |
| Operator A | Asha              | `operator-a`    | Asha's     | `kill-switch:trip`, `kill-switch:reset` | Generates the operator A key. Can trip the kill switch. Sends only the entry file.                                                                    |
| Operator B | Mohinder          | `operator-b`    | Mohinder's | `kill-switch:reset`                     | Generates the operator B key. Confirms a reset with operator A. Sends only the entry file.                                                            |
| Assembler  | Shalini           | —               | Shalini's  | none, holds no key                      | Collects the four entry files, checks the list, replaces the live list, redeploys, and checks each caller. Needs Vercel access to `parmana-api-real`. |

The assembler is Shalini. She holds no key and generates none, so the four key roles are held by four different people. She handles only public entry files and runs the Vercel commands. Five people are involved in total: the four key holders and the assembler.

The live caller `kill-switch-probe` (`kill-switch:probe`) belongs to the scheduled probe workflow, not to this ceremony. It is kept in the list (see section 6).

Each person needs a checkout of parmana-core on `main`, at `D:\last\parmana-core`, with `npm install` run once.

---

## 3. When

Run it only when all of these are true:

1. All five people are available for the whole run.
2. Production is clear (step 0 below).
3. No change to the kill switch or to policies is in progress.

Do not trip the switch while creating or approving keys (runbook section 0, rule 4).

---

## 4. Before you start (everyone)

Open PowerShell on your own machine. Run once:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\parmana-entries" | Out-Null
New-Item -ItemType Directory -Force "$env:USERPROFILE\parmana-secrets" | Out-Null
New-Item -ItemType Directory -Force "$env:USERPROFILE\parmana-checker" | Out-Null
New-Item -ItemType Directory -Force "$env:USERPROFILE\parmana-vercel-link" | Out-Null
$env:PARMANA_URL = "https://parmana-api-real.vercel.app"
```

The `parmana-entries` folder is only needed by the assembler. The other people can leave it empty. The `parmana-checker` folder is only needed by the checker.

---

## 5. Step 0: Check production is clear (any operator, or the assembler with a valid key)

```powershell
curl.exe -s "$env:PARMANA_URL/ready"
curl.exe -s "$env:PARMANA_URL/kill-switch/status?nonce=ceremony-start" -H "Authorization: Bearer <a-valid-key>"
```

Expect `/ready` to return `READY`, and the status to show `"active":false` with your nonce echoed. If `active` is `true`, stop and find out why (runbook section 12).

---

## 6. Generate the keys (each holder, on their own machine)

Each holder runs only their own block below, and sends only the entry file to the assembler, Shalini.

### 6.1 Maker (Pavan)

```powershell
cd D:\last\parmana-core
$out = npx tsx scripts/generate-api-key.ts --caller-id maker-pavan --credential-holder-type USER
$out | Where-Object { $_.StartsWith('{"callerId"') } | Set-Content "$env:USERPROFILE\parmana-entries\maker-pavan.json" -Encoding ascii
$k = (($out | Where-Object { $_ -match '^Key\s+:' }) -replace '^Key\s+:\s*', '').Trim()
"key length: $($k.Length)"
Set-Clipboard -Value $k
```

Expect `key length: 43`. Anything else means the capture failed: run the block again. Then:

1. Save the key in the password manager under the maker's name.
2. Clear the clipboard: `Set-Clipboard -Value " "`.
3. Clear the variables: `Remove-Variable k, out`.
4. Send Shalini (assembler) `maker-pavan.json` only.

### 6.2 Checker (Mamta)

The checker also gets a step-up key. The step-up private key stays on the checker's machine.

```powershell
cd D:\last\parmana-core
$out = npx tsx scripts/generate-api-key.ts --caller-id checker-mamta --credential-holder-type USER --generate-step-up-key
$out | Where-Object { $_.StartsWith('{"callerId"') } | Set-Content "$env:USERPROFILE\parmana-entries\checker-mamta.json" -Encoding ascii
$k = (($out | Where-Object { $_ -match '^Key\s+:' }) -replace '^Key\s+:\s*', '').Trim()
"key length: $($k.Length)"
Set-Clipboard -Value $k
$pem = ($out -join "`n") -replace '(?s).*(-----BEGIN PRIVATE KEY-----.*?-----END PRIVATE KEY-----).*', '$1'
$pem | Set-Content "$env:USERPROFILE\parmana-checker\step-up.private.pem" -Encoding ascii
Select-String -Path "$env:USERPROFILE\parmana-checker\step-up.private.pem" -Pattern "BEGIN PRIVATE KEY"
```

Expect `key length: 43` and one matching `BEGIN PRIVATE KEY` line. Then:

1. Save the key and the step-up PEM (the whole block shown in the terminal) in the password manager.
2. Clear the clipboard and variables: `Set-Clipboard -Value " "`, `Remove-Variable k, out, pem`.
3. Send Shalini (assembler) `checker-mamta.json` only. Its `stepUpPublicKey` is inside it.

### 6.3 Operator A (Asha)

```powershell
cd D:\last\parmana-core
$out = npx tsx scripts/generate-api-key.ts --caller-id operator-a --credential-holder-type USER --allowed-capabilities "kill-switch:trip,kill-switch:reset"
$out | Where-Object { $_.StartsWith('{"callerId"') } | Set-Content "$env:USERPROFILE\parmana-entries\operator-a.json" -Encoding ascii
$k = (($out | Where-Object { $_ -match '^Key\s+:' }) -replace '^Key\s+:\s*', '').Trim()
"key length: $($k.Length)"
Set-Clipboard -Value $k
```

Expect `key length: 43`. Save the key in the password manager, clear the clipboard and variables, and send Shalini (assembler) `operator-a.json` only.

### 6.4 Operator B (Mohinder)

```powershell
cd D:\last\parmana-core
$out = npx tsx scripts/generate-api-key.ts --caller-id operator-b --credential-holder-type USER --allowed-capabilities "kill-switch:reset"
$out | Where-Object { $_.StartsWith('{"callerId"') } | Set-Content "$env:USERPROFILE\parmana-entries\operator-b.json" -Encoding ascii
$k = (($out | Where-Object { $_ -match '^Key\s+:' }) -replace '^Key\s+:\s*', '').Trim()
"key length: $($k.Length)"
Set-Clipboard -Value $k
```

Expect `key length: 43`. Save the key, clear the clipboard and variables, and send Shalini (assembler) `operator-b.json` only.

---

## 7. Assemble the entries (assembler: Shalini)

Put the four entry files in `%USERPROFILE%\parmana-entries`. Keep the `kill-switch-probe` entry (see section 8). Move these entries out of the folder into `%USERPROFILE%\parmana-entries-archive`, not deleted:

- `paytm-refund-agent.json`
- `razorpay-demo-agent.json`
- the old `operator-a.json` and `operator-b.json`, if they are still there
- any other old entry

Print the list:

```powershell
$link = "$env:USERPROFILE\parmana-vercel-link"
$entries = @(Get-ChildItem "$env:USERPROFILE\parmana-entries\*.json" | ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json })
$entries | ForEach-Object { "{0}  capabilities={1}" -f $_.callerId, ($_.allowedCapabilities -join ",") }
```

Check the printed list:

- `maker-pavan`, `checker-mamta`, `operator-a` (with trip and reset), `operator-b` (with reset), `kill-switch-probe` (with probe).
- Not `paytm-refund-agent`, `razorpay-demo-agent`, `pavan`, `mamta`.

If any other caller is missing, stop.

---

## 8. The kill-switch probe entry

`kill-switch-probe` is not part of this ceremony, but replacing the list drops every caller not in the folder, and the scheduled probe would break. Its entry is copied from the live list. It is not regenerated.

Copy it from the live list, not from this document. In the Vercel dashboard for `parmana-api-real`, open the environment variable `PARMANA_API_KEYS` (production), and copy the object whose `callerId` is `kill-switch-probe`. Its fields are `callerId` (`kill-switch-probe`), `keyHash` (copy exactly), `allowedCapabilities` (`kill-switch:probe`) and `credentialHolderType` (`SERVICE`). Write it as one line of JSON, in ASCII, to `%USERPROFILE%\parmana-entries\kill-switch-probe.json`.

Save it as `%USERPROFILE%\parmana-entries\kill-switch-probe.json`, one line, ASCII. Confirm with the owner of the probe workflow before step 9, that this key is still the one the probe uses.

---

## 9. Replace the live key list (assembler: Shalini)

If the `add` step fails, every key is rejected until the list is restored. If it fails, run the `add` again with the same `$value` straight away. Only run `rm` again after an `add` failure.

```powershell
$value = ConvertTo-Json -InputObject $entries -Depth 5 -Compress
vercel env rm PARMANA_API_KEYS production --yes --cwd $link
$value | vercel env add PARMANA_API_KEYS production --sensitive --cwd $link
```

Expect `Added PARMANA_API_KEYS`. Record the time in the ceremony log.

---

## 10. Redeploy from current main (assembler: Shalini)

The runbook requires production to be deployed from a current checkout of `main`.

```powershell
cd D:\last\parmana-core
git status --short
git switch main
git pull origin main
git log -1 --oneline
Select-String -Path api\index.ts -Pattern "createKillSwitch"
npx vercel deploy --prod --yes
```

Expect the `Select-String` to show lines (if none, the checkout is old: stop). If the CLI asks you to link a project, stop. The only correct project is `parmana-api-real`. Check the deployment is `Ready` with `npx vercel ls parmana-api-real`. The top Production row should be newer than the key-list change.

---

## 11. Verify each caller (each holder, on their own machine)

Each holder checks only their own key. Use the key from the password manager. Do not paste it into chat.

```powershell
$env:PARMANA_URL = "https://parmana-api-real.vercel.app"
$k = <paste from the password manager>
curl.exe -s -o NUL -w "%{http_code}\n" "$env:PARMANA_URL/callers/me" -H "Authorization: Bearer $k"
curl.exe -s "$env:PARMANA_URL/kill-switch/status?nonce=verify-<caller-id>" -H "Authorization: Bearer $k"
Remove-Variable k
```

Expect `200`, and status with `"active":false`. Record each result in the ceremony log. A `401` means the list does not contain that key (runbook section 12).

The two removed callers must now get `401`. The operator checks that from the archive, if needed.

---

## 12. Kill-switch drill (section 13 of the runbook)

The drill as written uses `razorpay-demo-agent`, which is removed in this run, so it cannot be run as written. Choose one, and record the choice in the ceremony log (section 15):

1. **Skip the drill.** Record that it was skipped, and why. Tutorial 124 tests the behaviour, but it has not been run live (runbook section 13.2).
2. **Run the drill with operator A's key, on a test payment,** as a separate decision. Only do this if the team agrees to trip the switch in production, and then reset it with operator B.

Do not trip the switch while the list is being replaced (runbook section 0, rule 4).

---

## 13. Record the ceremony (all five)

Write the ceremony log (runbook section 15) with:

- the date and time of each step, and the deployment ID from section 10;
- each caller's check result from section 11;
- the drill decision from section 12;
- the open risks: none, for this run, if the four key roles are held by four different people;
- each person's sign-off line.

Tick the checklist (runbook section 16).

---

## 14. Who sends what, and when

| Order | Who      | Sends                | Receives |
| ----- | -------- | -------------------- | -------- |
| 1     | Mamta    | `checker-mamta.json` | Shalini  |
| 2     | Mohinder | `operator-b.json`    | Shalini  |
| 3     | Asha     | `operator-a.json`    | Shalini  |
| 4     | Pavan    | `maker-pavan.json`   | Shalini  |

Mamta, Mohinder and Asha can generate their keys in any order, but each sends only after their own block has printed `key length: 43`. Never send a private key, a raw key, or a clipboard copy of either.

---

## 15. Stop conditions

Stop, and do not continue, if any of these happen:

- a `key length` other than 43;
- the printed list is missing a caller that is not in the removal list;
- `kill-switch-probe` is missing from the printed list;
- `/ready` is not `READY`, or the kill switch is `active`;
- the deployment is not `Ready`, or the project asked for is not `parmana-api-real`;
- any person is asked to hold a second role.

For any refusal in section 11, see runbook section 12.
