# Runbook: authority grants for the inbound refund pilot

Scope: giving a partner's caller key the right to ask for inbound refund decisions, through
maker and checker approval. Applies to the test service. RFC-0025.

## Roles

- **Maker** (proposes the grant): a caller with a USER credential holder. In the test run this
  was Pavan.
- **Checker** (approves): a different caller with a USER credential holder and a step-up key. In
  the test run this was Mamta. The maker and the checker must be different callers.
- **Partner**: the caller the grant is for. In the test run this was `partner-a`. The grant names
  it in `callerId`.

## Keys

- Each caller has an entry in `PARMANA_API_KEYS` on the service. The entry holds only the SHA-256
  hash of the raw key, plus `credentialHolderType` and, for a checker, `stepUpPublicKey`.
- Generate an entry with `npx tsx scripts/generate-api-key.ts -- --caller-id <id>`. Add
  `--credential-holder-type USER` for a human. Add `--generate-step-up-key` for a checker. The
  script prints each secret once. The raw key goes to its owner; the step-up private key goes to
  the checker. Neither is stored anywhere by the script.
- The service reads `PARMANA_API_KEYS` as one JSON array. Replace the whole value. Never paste
  an entry into the middle of an existing value.
- Check a raw key against its entry without printing it:

  ```powershell
  $h = [System.BitConverter]::ToString((New-Object System.Security.Cryptography.SHA256Managed).ComputeHash([System.Text.Encoding]::UTF8.GetBytes($key))).Replace("-","").ToLower()
  "hash matches: $($h -eq 'THE_ENTRY_KEYHASH')"
  ```

## Propose (maker)

```powershell
$key = "MAKER_RAW_KEY"
$body = '{"action":"grant","callerId":"partner-a","capability":"inbound:refund","limits":{"parameters.amountInr":{"max":1000}},"validFrom":"2026-11-02T00:00:00Z","validUntil":"2026-12-02T00:00:00Z","reason":"Pilot test grant"}'
Invoke-RestMethod -Method Post -Uri https://parmana-core.onrender.com/authority-grants/changes -Headers @{Authorization="Bearer $key"} -ContentType "application/json" -Body $body
```

The response carries `changeId` and `status: PENDING_APPROVAL`.

## Approve (checker)

Sign and approve in one step. The signature expires after 120 seconds.

```powershell
$key = "CHECKER_RAW_KEY"
$changeId = "THE_CHANGE_ID"
$out = npx tsx scripts/sign-policy-change-step-up.ts --private-key-file PATH_TO_STEP_UP_PRIVATE_KEY --key-id mamta --pending-policy-change-id $changeId --action approve
$json = ($out | Where-Object { $_ -match '^\{"payload"' })
$approve = '{"stepUpAuthorization": ' + $json + '}'
try { Invoke-RestMethod -Method Post -Uri "https://parmana-core.onrender.com/authority-grants/changes/$changeId/approve" -Headers @{Authorization="Bearer $key"} -ContentType "application/json" -Body $approve } catch { $_.Exception.Message; if ($_.Exception.Response) { (New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } }
```

`--key-id` is the checker's caller id. The response shows `status: APPROVED` and `resolvedBy`.

## Checks

- Read the grants: `GET /authority-grants` with the maker's or checker's key.
- A proposal by a caller for itself returns 403 (`AUTHORITY_SELF_GRANT_DENIED`).
- A pending change disappears if the store is in memory and the service restarts. Check
  `PARMANA_STORAGE` first, and approve before any redeploy.

## Troubleshooting

| Symptom                                    | Cause                                                                        | Fix                                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 401 `authentication required`              | Key does not match a stored hash, or the service has not picked up the entry | Check the hash with the command above. Check that `PARMANA_API_KEYS` holds the entry, and that the deploy is Live. |
| 404 `Authority grant change ... not found` | The change was lost, or the id is wrong                                      | Propose again. Set `PARMANA_STORAGE=postgres`.                                                                     |
| 403 `AUTHORITY_SELF_GRANT_DENIED`          | The key used belongs to the grantee                                          | Use the maker's own key.                                                                                           |
| 401 on approve, with a fresh signature     | Signature expired, or the step-up key does not match the checker entry       | Sign and approve in one step. Check that the checker entry has the matching `stepUpPublicKey`.                     |
| Invalid `PARMANA_API_KEYS` error at start  | The value is not a JSON array of `{callerId, keyHash}`                       | Replace the whole value with a valid array.                                                                        |
