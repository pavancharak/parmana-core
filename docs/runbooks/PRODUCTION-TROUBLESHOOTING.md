# Parmana production troubleshooting guide

Built from the real incidents and fixes in this project. Each entry gives the **symptom** you see, **why** it happens, how to **check**, and the **fix**. Nothing here contains a real key or value. Keep it that way.

Conventions used below:
- `$env:PARMANA_URL` = `https://parmana-api-real.vercel.app`
- `$link` = `"$env:USERPROFILE\parmana-vercel-link"` (the Vercel-linked folder). Set it in every new PowerShell window.
- Run commands in **Windows PowerShell** from `D:\last\parmana-core`.

---

## 0. Ground rules (read first)

| Rule | Why |
|---|---|
| Never paste a key, token, login code, or secret value into chat | Anything in chat is kept. Treat anything pasted as exposed and rotate it. |
| Type keys at a secure prompt: `Read-Host "..." -AsSecureString` | Keeps the value out of the screen and the command history. |
| Clear the clipboard after saving a key: `Set-Clipboard -Value " "` | A key left on the clipboard gets pasted by mistake later. |
| Use `Remove-Variable` on keys when done | Stops keys sitting in the session. |
| Deleting with `Remove-Item -Force` skips the Recycle Bin | Deletes are permanent on Windows unless File History or shadow copies exist. Look before you delete. |
| Check `Get-ChildItem` output before any delete | We lost `D:\secrets` this way. |

---

## 1. Production is down: every request returns 500 `FUNCTION_INVOCATION_FAILED`

**Symptom:** `Invoke-RestMethod` gives `500 A server error has occurred / FUNCTION_INVOCATION_FAILED`.

**Why:** the app throws while starting, so Vercel can't serve any request. Usually a bad environment variable that the startup checks reject.

**Check (fast):**
```powershell
try { Invoke-RestMethod "$env:PARMANA_URL/policies" } catch { "$($_.Exception.Response.StatusCode.value__) $($_.ErrorDetails.Message)" }
```
- `401 authentication required` = healthy.
- `500 FUNCTION_INVOCATION_FAILED` = startup is failing.

**Find the real error:** Vercel dashboard → `parmana-api-real` → **Logs** → **Runtime Logs**. Set the filter to **Error**. Read the first `Error:` line. The CLI (`vercel logs`) showed nothing for us, so use the dashboard.

**Fix (restore first, investigate second):**
```powershell
vercel promote https://<last-good-deployment-url> --cwd $link --yes
```
Use the last deployment that returned 401. That gives you a working site while you fix the variable.

**Common causes, in order we hit them:**
- Wrong shape for `PARMANA_KEY_MATERIAL_JSON` (see section 4).
- `PARMANA_KEY_DIR` set to a read-only path (see section 5).
- `PARMANA_API_KEYS` missing or invalid (sections 2 and 3).

---

## 2. `No caller authentication keys are configured (PARMANA_API_KEYS)`

**Symptom:** every request returns 500, and the Runtime Logs show this message.

**Why:** the app reads `PARMANA_API_KEYS` at startup. If the value is empty, unset, or not a JSON array, the app refuses to start, so every route fails.

**Check locally, against the exact file you'll upload:**
```powershell
$env:KEYS = Get-Content D:\secrets3\PARMANA_API_KEYS.json -Raw
npx tsx -e "import { parseApiKeys } from './packages/shared/src/config/ConfigValidation.ts'; console.log('OK', parseApiKeys(process.env.KEYS).map(e => e.callerId))"
```
- `OK [ ... ]` lists the caller IDs. Good.
- An error names the bad entry. Fix that entry.

**Fix:** upload a one-line version (section 3), then redeploy (section 6).

---

## 3. `PARMANA_API_KEYS is not valid JSON` / a bad upload

**Symptom:** the app crashes at startup, or the local check fails.

**Why:**
- A multi-line value pasted into a single-line field becomes invalid JSON.
- `ConvertFrom-Json` piped into `ConvertTo-Json` unrolls the array. Vercel then stores something that is not an array (`{` as the first character instead of `[`).

**Correct way to build and upload:**
```powershell
$value = (Get-Content D:\secrets3\PARMANA_API_KEYS.json -Raw) -replace '\s*\r?\n\s*', ''
$value.Substring(0,1)        # must print [
```
Upload by piping the string:
```powershell
vercel env rm PARMANA_API_KEYS production --yes --cwd $link
$value | vercel env add PARMANA_API_KEYS production --sensitive --cwd $link
```

**Build a list without unrolling:**
```powershell
$all = @( (Get-Content a.json -Raw | ConvertFrom-Json), (Get-Content b.json -Raw | ConvertFrom-Json) )
[System.IO.File]::WriteAllText('D:\secrets3\PARMANA_API_KEYS.json', (ConvertTo-Json -InputObject $all -Depth 6 -Compress))
```
Always check the result with the section 2 command.

**Why `Set-Content` can break it:** on Windows PowerShell 5, `Set-Content` and Notepad can save UTF-16 or add a BOM. Use `[System.IO.File]::WriteAllText(path, text)` for anything that must be exact.

---

## 4. `PARMANA_KEY_MATERIAL_JSON` wrong shape

**Symptom:** startup fails with a key-material error.

**Why:** the app expects exactly `{"gateway":{"privateKeyPem":"...","publicKeyPem":"..."}}`. We first set `{"keys":[{private_key_pem,id,type}]}`, which is the wrong shape.

**Check the shape (do not print the PEM):**
```powershell
$m = Get-Content <file> -Raw | ConvertFrom-Json
$m.gateway.PSObject.Properties.Name    # must show privateKeyPem, publicKeyPem
```

**Fix:** derive the public key from the private key, so the pair always matches:
```powershell
node -e "const c=require('crypto');const priv=c.createPrivateKey(process.argv[1]);const pub=c.createPublicKey(priv).export({type:'spki',format:'pem'});console.log(JSON.stringify({gateway:{privateKeyPem:priv.export({type:'pkcs8',format:'pem'}),publicKeyPem:pub}}))" "<private key PEM>"
```

---

## 5. `ENOENT mkdir ./keys` / read-only file system

**Symptom:** startup fails when creating the key directory.

**Why:** Vercel's filesystem is read-only except `/tmp`. `PARMANA_KEY_DIR=./keys` tries to create a folder in the project.

**Fix:**
```powershell
vercel env rm PARMANA_KEY_DIR production --yes --cwd $link
"/tmp/parmana-keys" | vercel env add PARMANA_KEY_DIR production --cwd $link
```

---

## 6. Changes to environment variables don't take effect

**Symptom:** you changed a variable, but production behaves the same.

**Why:** Vercel applies environment changes only to **new** deployments. The running one keeps its old values.

**Fix:** redeploy the production deployment:
```powershell
vercel redeploy <current-production-url> --target production --cwd $link
```
Find the current URL with `vercel ls parmana-api-real --prod --cwd $link` (take the first URL, not the header line). Wait for `✓ Ready`, then run the section 1 check.

---

## 7. Vercel rollback fails: `402` on Hobby

**Symptom:** you can't roll back more than one deployment.

**Why:** the Hobby plan only allows one rollback.

**Fix:** promote the older deployment instead:
```powershell
vercel promote <older-deployment-url> --cwd $link --yes
```

---

## 8. `STEP_UP_AUTHORIZATION_INVALID` on approve or reject

This was the longest problem. Work through the checks in order.

**Symptom:** `{"code":"STEP_UP_AUTHORIZATION_INVALID"}`. The HTTP status can be 400 or 403, so record it.

**What the server checks** (`packages/api/src/auth/PolicyChangeStepUpVerifier.ts`): signature, expiry, the pending change ID, the action, a TTL of 120 seconds or less, and a nonce that hasn't been used. The nonce is recorded only after the other checks pass.

**Step 8a. Check the clock first.** This was the real cause for most of our failures. The envelope is stamped with the PC clock. If the PC is behind by more than about two minutes, the envelope is expired on arrival.
```powershell
"local UTC: $((Get-Date).ToUniversalTime().ToString('o'))"
try { Invoke-RestMethod "$env:PARMANA_URL/policies" } catch { $_.Exception.Response.Headers['Date'] }
```
Compare the two times. If they differ by more than about a minute, fix the clock. As administrator: `w32tm /resync`, or in **Settings → Time & language → Date & time**, turn **Set time automatically** off and on, then **Sync now**.

**Step 8b. Sign and send in one block.** The envelope expires 120 seconds after signing. Don't pause between signing and sending.
```powershell
$out = npx tsx scripts/sign-policy-change-step-up.ts --private-key-file D:\secrets3\checker.step-up.private.pem --key-id checker-step-up --pending-policy-change-id <ID> --action approve
$envelope = $out | Where-Object { $_ -like '{"payload"*' }
$body = '{"stepUpAuthorization":' + $envelope + '}'
Invoke-RestMethod -Method Post -Uri "$env:PARMANA_URL/policies/pending-changes/<ID>/approve" -Headers @{ Authorization = "Bearer $checker" } -ContentType "application/json" -Body $body
```
- Send the envelope **as printed**. Don't round-trip it through `ConvertFrom-Json`/`ConvertTo-Json`. Windows PowerShell rewrites the timestamps, which breaks the signature.
- If `$envelope` is empty, the script printed multiple lines. Run `$out | Out-String -Width 300` and check the output.
- For a reject, add `,"rejectionReason":"..."` before the closing brace.

**Step 8c. Check the key pair matches.** This only shows that the local files match each other. It does not prove production has the same key.
```powershell
node -e "const c=require('crypto'),f=require('fs');console.log(c.createPublicKey(c.createPrivateKey(f.readFileSync('D:/secrets3/checker.step-up.private.pem'))).export({type:'spki',format:'pem'}))"
```
Compare with `stepUpPublicKey` for `pavancharak` in `PARMANA_API_KEYS.json`.

**Step 8d. Check the nonce store (production database).** In the Supabase SQL editor:
```sql
select count(*), max(expires_at) from consumed_policy_change_step_up_nonces;
select nonce, expires_at from consumed_policy_change_step_up_nonces where nonce = '<nonce>';
```
- A row exists = the envelope passed every check and was used. The failure happened after that.
- No row = a check failed before the nonce step. Go back to 8a and 8b.
- To get the nonce: `([regex]::Match($envelope, '"nonce":"([^"]+)"')).Groups[1].Value`

**Step 8e. Check the status code.**
```powershell
try { Invoke-RestMethod ... } catch { "status: $($_.Exception.Response.StatusCode.value__)"; "body: $($_.ErrorDetails.Message)" }
```
The same code came back as 400 and as 403.

**Step 8f. Confirm the code works with real keys.** Run the repo's tests. They use real Ed25519 keys and cover approve, reject, and replay:
```powershell
npx vitest run packages/api/tests/unit/PolicyChangeStepUpVerifier.test.ts packages/api/tests/integration/pending-policy-changes-governance.integration.test.ts
```
Passing (35 of 35 for us) means the code is correct, and the problem is the clock, the keys, or the data.

**Dead ends we ruled out:**
- Re-signing the same key pair didn't help until the clock was fixed.
- Replacing the key pair entirely (the rotation) also failed until the clock was fixed.
- The Vercel CLI can't show runtime logs for a deployment (`No logs found`). Use the dashboard.

---

## 9. Runtime logs: finding an error

**Symptom:** the logs don't show what you're looking for.

**Why:** the dashboard has two log views, and they show different things.
- **Request Logs** show each HTTP call and its status. Error-level filters show nothing here for application errors.
- **Runtime Logs** show what the code printed (`console.error`, thrown exceptions). This is where the step-up and startup errors appear.

**Fix:** open **Runtime Logs**, widen the timeline (Last 1 hour), and search for a word from the error. If the search finds nothing, filter by **Error**, then scroll to the time of your request.

---

## 10. Probe (`kill-switch-probe`) fails or is red

**Symptom:** the GitHub Actions run is red.

**Why:** the GitHub secret `PARMANA_PROBE_KEY` doesn't match the probe entry in production, usually after a rotation.

**Check:** the probe run's log shows the HTTP status. `401` = wrong key. `201` = working.

**Fix:** update `PARMANA_PROBE_KEY` in **Settings → Secrets and variables → Actions** with the current probe key, then **Actions → kill-switch-probe → Run workflow**.

---

## 11. Checking which saved key is live

**Symptom:** you have several key files and don't know which one production uses.

**Why:** the production key list stores a SHA-256 hash of each key, not the key. Hash the key you have and compare.

```powershell
$k = [System.Net.NetworkCredential]::new("", (Read-Host "API key" -AsSecureString)).Password.Trim()
$hash = node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" $k
$entry = (Get-Content D:\secrets3\PARMANA_API_KEYS.json -Raw | ConvertFrom-Json) | Where-Object { $_.callerId -eq '<callerId>' }
if ($hash -eq $entry.keyHash) { 'MATCHES' } else { 'DOES NOT MATCH' }
Remove-Variable k
```
Use `callerId` = `pavancharak` (checker), `maker-wiring-check` (maker), or `kill-switch-probe` (probe).

---

## 12. Deleted a file by mistake

**Symptom:** a folder or file is gone (we lost `D:\secrets`).

**Why:** `Remove-Item -Force` skips the Recycle Bin.

**Recover, in order:**
1. **Previous Versions.** Right-click `D:\` → **Properties** → **Previous Versions**.
2. **Shadow copies** (administrator PowerShell):
   ```powershell
   vssadmin list shadows /for=D:
   cmd /c mklink /d C:\shadow "\\?\GLOBALROOT\Device\HarddiskVolumeShadowCopyN\"
   robocopy C:\shadow\<folder> C:\recovered\<folder> /E
   cmd /c rmdir C:\shadow
   ```
   `rmdir` removes only the link.
3. **Windows File Recovery** (Microsoft Store): `winfr D: "C:\recovered" /regular /n "\<folder>\*"`. Partial. Don't write to `D:` first.
4. **Password manager and Vercel.** Values set in Vercel still run in production, but Secret values can't be read back.

**Prevention:** list first (`Get-ChildItem`), then delete named files only.

---

## 13. Key files saved with bad encoding (Notepad or `Set-Content`)

**Symptom:** Notepad shows the key as CJK-looking characters, or the hash check fails for a key you know is right.

**Why:** the file was saved as UTF-16, usually from Notepad or a `Set-Content` default.

**Fix:**
```powershell
$k = [System.Net.NetworkCredential]::new("", (Read-Host "Key" -AsSecureString)).Password.Trim()
[System.IO.File]::WriteAllText('D:\secrets3\<name>.txt', $k)
Remove-Variable k
```
Check the length: `([System.IO.File]::ReadAllText('D:\secrets3\<name>.txt')).Trim().Length` should be 43.

---

## 14. `npx tsx` import error: `ERR_PACKAGE_PATH_NOT_EXPORTED ... @parmana/crypto`

**Symptom:** a local `tsx` script that imports a workspace package fails.

**Why:** the workspace packages aren't built, so their `exports` are missing.

**Fix:** `npm run build` (wait for the SDK step to finish), then re-run. Scripts that only import `packages/shared/src/config/ConfigValidation.ts` didn't need the build.

---

## 15. Production has an old diagnostic route

**Symptom:** `GET /api/diag` returned `200` with `injected env (0) from ../../.env`.

**Why:** an old build still had a diagnostic route from when we debugged startup. The route is not in the repo.

**Check:** `/api/diag` now returns `401`, the same as any path that doesn't exist, so it is behind the auth gate. To verify, compare with a nonexistent path:
```powershell
try { (Invoke-WebRequest "$env:PARMANA_URL/api/does-not-exist" -UseBasicParsing).StatusCode } catch { "nonexistent: $($_.Exception.Response.StatusCode.value__)" }
```

**Fix (optional, clean):** redeploy from `main` so the build has no leftover files.

---

## 16. AWS CLI login fails: `TOKEN_EXPIRED` / `CreateOAuth2Token`

**Symptom:** `aws` commands fail with a token error.

**Why:** the CLI's sign-in session expired.

**Workaround we used:** read the data in the AWS console (CloudTrail for role assumptions, Billing for spend). Re-run `aws sso login --profile parmana` if you need the CLI, and check the profile name first.

---

## 17. Vercel deployment protection

**Symptom:** the production URL works in a browser or with `curl`, but a preview URL asks for login.

**Why:** Deployment Protection covers preview deployments, not the production alias.

**Fix:** test against `https://parmana-api-real.vercel.app` (the alias), not a deployment URL.

---

## 18. Routine rotation (checker, maker, probe)

Use this when a key is lost, shared, or suspected exposed.

1. Generate a key pair (`--generate-step-up-key` for checkers only). Save the key to your password manager.
   ```powershell
   $c = npx tsx scripts/generate-api-key.ts --caller-id pavancharak --credential-holder-type USER --generate-step-up-key
   ```
   Keep the step-up PEM in `D:\secrets3\checker.step-up.private.pem`, written with `WriteAllText`.
2. Save each entry as `D:\secrets3\<name>-entry.json`.
3. Build the list with `WriteAllText` (section 3), and check it with the section 2 command.
4. Upload (section 3), redeploy (section 6), and check `401` (section 1).
5. Update `PARMANA_PROBE_KEY` in GitHub (section 10).
6. Test: the maker proposes, the checker rejects with a fresh envelope (section 8b). Rejecting leaves nothing live.
7. Delete the old copies after the new ones work.

**Why this order:** the list must be live before any old key stops working. Upload before deleting.

---

## 19. Quick reference: what each HTTP response means

| Response | Meaning | Next step |
|---|---|---|
| `401 authentication required` | Healthy, unauthenticated | None |
| `401` on a valid key | Key not in production list | Section 11 |
| `403 STEP_UP_AUTHORIZATION_INVALID` | Envelope rejected | Section 8 |
| `400 STEP_UP_AUTHORIZATION_INVALID` | Envelope rejected | Section 8 |
| `500 FUNCTION_INVOCATION_FAILED` | Startup failing | Sections 1 and 2 |
| `201` on `/kill-switch/probes` | Probe working | None |

---

## 20. Things we learned that change how to work

- **Vercel env changes need a redeploy** (section 6).
- **The PC clock matters** for every signed envelope (section 8a).
- **Use the dashboard for runtime logs.** The CLI returned nothing.
- **Don't batch deletes.** Check first, then delete named files.
- **Save each key before pressing Enter** on the save prompt. The clipboard is cleared after.
- **One step at a time.** Confirm each step's output before the next. Most of our detours came from skipping a check.
