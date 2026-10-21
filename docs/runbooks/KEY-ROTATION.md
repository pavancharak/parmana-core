# Key rotation runbook

How to replace an API key, a step-up key, or the whole caller list in production, without losing access or leaving an old key live. Written from `scripts/generate-api-key.ts`, `packages/api/src/bootstrap/createCallerAuthenticator.ts` and `packages/shared/src/config/ConfigValidation.ts` (`parseApiKeys`), and from the rotation we ran in October 2026.

**Read first:** [README.md](README.md) for the rules that apply to every runbook. The failure you are investigating may be in [PRODUCTION-TROUBLESHOOTING.md](PRODUCTION-TROUBLESHOOTING.md).

---

## 1. What a key is

Each key is one entry in the production caller list, `PARMANA_API_KEYS`. The entry stores only a hash of the key:

| Field | Required | What it holds |
|---|---|---|
| `callerId` | Yes | A name for the caller. Must be unique in the list. |
| `keyHash` | Yes | SHA-256 of the raw key, as 64 lowercase hex characters. |
| `allowedCapabilities` | No | Actions the key may invoke. Unset means none. `"*"` means all. |
| `allowedPrincipalIds` | No | Principals the key may assert. Unset means only its own `callerId`. |
| `allowedTenantIds` | No | Tenants the key may use. Unset means none. |
| `credentialHolderType` | No | `USER`, `ROLE`, `SERVICE` or `ORGANIZATION`. Only `USER` keys may approve or reject policy changes. |
| `stepUpPublicKey` | For a checker | The Ed25519 public key (PEM) that verifies the checker's step-up envelopes. |

The raw key is shown once, at generation. The server never stores it, so if it is lost, the only fix is a new key.

Current roles in production (confirm with `vercel env` names, then with the hash check in section 5):

| Role | `callerId` | Type | Used for |
|---|---|---|---|
| Checker | `pavancharak` | `USER` plus `stepUpPublicKey` | Approves and rejects policy changes |
| Maker | `maker-wiring-check` | `USER` | Proposes policy changes |
| Probe | `kill-switch-probe` | `SERVICE`, capability `kill-switch:probe` | The scheduled kill-switch probe in GitHub Actions |

---

## 2. Generate a new key

The generator prints the result. It does **not** write a file, so you save the output yourself.

```powershell
# Maker or probe (no step-up key)
$out = npx tsx scripts/generate-api-key.ts --caller-id <callerId> --credential-holder-type USER
# Probe
$out = npx tsx scripts/generate-api-key.ts --caller-id kill-switch-probe --credential-holder-type SERVICE --allowed-capabilities "kill-switch:probe"
# Checker (also prints the step-up private key)
$out = npx tsx scripts/generate-api-key.ts --caller-id <callerId> --credential-holder-type USER --generate-step-up-key
```

Flags that matter:

- `--credential-holder-type USER` is required with `--generate-step-up-key`. The generator refuses the step-up key for other types.
- `--allowed-capabilities` takes a comma-separated list. Leave it out for a human key.

**Save the raw key without showing it:**
```powershell
$k = (($out | Where-Object { $_ -match '^Key\s+:' }) -replace '^Key\s+:\s*', '').Trim()
Set-Clipboard -Value $k
Read-Host "Save this key in the password manager, then press Enter"
Set-Clipboard -Value " "
Remove-Variable k
```
Expect a 43-character key. Check the length before saving it, and do not print it.

**Save the entry** (the JSON line, which starts with `{"callerId"`):
```powershell
$entry = $out | Where-Object { $_.StartsWith('{"callerId"') }
[System.IO.File]::WriteAllText('<folder>\<name>-entry.json', $entry)
```

**Save the step-up private key** (checkers only). Extract the PEM block and write it with `WriteAllText`, not `Set-Content`:
```powershell
$pem = ($out | Out-String) -replace '(?s).*(-----BEGIN PRIVATE KEY-----.*?-----END PRIVATE KEY-----).*', '$1'
[System.IO.File]::WriteAllText('<folder>\checker.step-up.private.pem', $pem)
(Get-Content '<folder>\checker.step-up.private.pem').Count   # expect 3
```

**Why `WriteAllText`:** Windows PowerShell 5's `Set-Content` and Notepad can save UTF-16 or add a BOM. A key saved that way looks correct on screen and fails every check.

---

## 3. Build the new caller list

Keep every other entry. Replace only the rotated one. Build the list with `WriteAllText` and never by piping through `ConvertTo-Json` without `-InputObject` (that unrolls the array, see the troubleshooting guide, section 3).

```powershell
$all = @(
  (Get-Content <folder>\checker-entry.json -Raw | ConvertFrom-Json),
  (Get-Content <folder>\maker-entry.json -Raw | ConvertFrom-Json),
  (Get-Content <folder>\probe-entry.json -Raw | ConvertFrom-Json)
)
[System.IO.File]::WriteAllText('<folder>\PARMANA_API_KEYS.json', (ConvertTo-Json -InputObject $all -Depth 6 -Compress))
```

Validate it with the same parser production uses. It must print `OK` with every caller:
```powershell
$env:KEYS = [System.IO.File]::ReadAllText('<folder>\PARMANA_API_KEYS.json')
npx tsx -e "import { parseApiKeys } from './packages/shared/src/config/ConfigValidation.ts'; console.log('OK', parseApiKeys(process.env.KEYS).map(e => e.callerId))"
```

A `keyHash` that is not 64 lowercase hex characters fails here, before anything is uploaded.

---

## 4. Upload, redeploy, check

```powershell
$link = "$env:USERPROFILE\parmana-vercel-link"
$value = ([System.IO.File]::ReadAllText('<folder>\PARMANA_API_KEYS.json')) -replace '\s*\r?\n\s*', ''
vercel env rm PARMANA_API_KEYS production --yes --cwd $link
$value | vercel env add PARMANA_API_KEYS production --sensitive --cwd $link
vercel redeploy <current-production-url> --target production --cwd $link
```

Then check (expect `401`):
```powershell
try { Invoke-RestMethod "$env:PARMANA_URL/policies" } catch { "$($_.Exception.Response.StatusCode.value__) $($_.ErrorDetails.Message)" }
```

**The old key stops working as soon as the new list is live.** Do the upload, then update everything that uses the old key, in this order:

1. The GitHub secret `PARMANA_PROBE_KEY` if the probe key changed (section 6).
2. Your password manager, and the files you use locally.

If the redeploy returns `500`, promote the last working deployment (troubleshooting guide, section 1), then read the Runtime Logs error.

---

## 5. Confirm a key matches production

This hashes a key you hold and compares it with the live list. It shows which key is live without printing either:

```powershell
$k = [System.Net.NetworkCredential]::new("", (Read-Host "API key" -AsSecureString)).Password.Trim()
$hash = node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" $k
$entry = (Get-Content <folder>\PARMANA_API_KEYS.json -Raw | ConvertFrom-Json) | Where-Object { $_.callerId -eq '<callerId>' }
if ($hash -eq $entry.keyHash) { 'MATCHES' } else { 'DOES NOT MATCH' }
Remove-Variable k
```

Use the list you **uploaded**. A local file can differ from production if you edited it after the upload.

---

## 6. Update the probe key in GitHub

The probe runs from GitHub Actions and reads its key from the secret `PARMANA_PROBE_KEY`. Update the secret, then run the workflow to confirm.

1. Repository **Settings → Secrets and variables → Actions**. Edit `PARMANA_PROBE_KEY`, paste the new probe key from the password manager, and save.
2. **Actions → kill-switch-probe → Run workflow.** Expect a green run.
3. A red run with `401` means the secret does not match production. Re-check section 5.

---

## 7. Test the checker and maker without changing production

A reject leaves nothing live, so use it to test both keys:

1. The maker proposes a change to an existing policy file, with a `reason`.
2. The checker signs a reject envelope and rejects the change with a `rejectionReason`.
3. Expect `status : REJECTED` and `resolvedBy` set to the checker.

Run steps 1 and 2 close together. The envelope expires after 120 seconds. Full commands are in [POLICY-CHANGE-APPROVAL.md](POLICY-CHANGE-APPROVAL.md), section 6.

---

## 8. Remove the old keys

Only after the new keys work (sections 4 to 7):

1. Confirm the new keys are in the password manager.
2. Delete the old copies on disk: the old entry files, the old key list and the old step-up PEM. Name each file. Do not delete a whole folder without listing it first.
3. Keep the one current key list in a single known folder.

---

## 9. Lost a key before it was saved

If a raw key was not saved, it cannot be recovered from the server. Generate a new one (section 2), replace the entry (sections 3 and 4), and update the probe key (section 6) if it is the probe.

If the key was saved but the file is missing, check the password manager first. Then check Previous Versions and shadow copies (troubleshooting guide, section 12).

---

## 10. Why the order matters

- **Upload before deleting.** If the new list is not live, deleting the old key locks everyone out.
- **Test with a reject, not an approve.** A reject tests the keys and the step-up envelope without changing any live policy.
- **Check the clock.** A step-up envelope stamped from a PC clock that is behind is expired on arrival. It fails with the same error as a wrong key. Run the clock check in [POLICY-CHANGE-APPROVAL.md](POLICY-CHANGE-APPROVAL.md), section 5, before you suspect the key.
