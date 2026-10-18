# Live check: authority grants in production

RFC-0023 phase 3 lets an operator say which agent may have which action decided, within which limits, until when
(`docs/CLAIMS.md` 2.55). It is built, tested and deployed, but no grant has been made in production and no production
policy requires one (`docs/VERIFICATION-GAPS.md` G-93). This check proves it against the real server, with an action
that changes nothing anywhere:

| #   | Request (each with a valid signed approval) | Required                                                                          |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | Before any grant                            | Refused, `NOT_AUTHORIZED`, rule `authority-not-authorized`                        |
| 2   | With a grant up to 100, for 50              | `APPROVED`, released once, the grant named in the signed record, verifies offline |
| 3   | With the same grant, for 500                | Refused, `NOT_AUTHORIZED`: above the grant's limit                                |
| 4   | After the grant is revoked, for 50          | Refused, `NOT_AUTHORIZED`, rule `authority-not-authorized`                        |

Every request carries a valid signed approval for its own target, so each refusal shows the grant decides it: a signed
approval cannot cure missing authority.

## Status

**Passed in production on 2026-10-11**, against `https://parmana-api-real.vercel.app`, with
grant `4b60507f-adb8-4fe0-82b3-a83c41e09022` (`livecheck-agent`, `livecheck:grant`, `parameters.amount` max 100,
valid until 2026-10-18), proposed by `maker-pavan` and approved by `checker-pavan`, then revoked the same way:

| #   | Request              | Transaction                            | Answer                                                                                                                          |
| --- | -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Before any grant, 50 | `8a75374c-150d-4cea-b57a-abb3a92bcac6` | Refused in 8.5 s, `authority-not-authorized`: "livecheck-agent" holds no authority grant for "livecheck:grant".                 |
| 2   | Within the grant, 50 | `da96002b-66ec-44cf-88da-0f29997e4711` | `APPROVED` in 28.5 s, released once (receipt `RC-da96002b`), `AUTHORIZED` with the grant in the signed record, verifies offline |
| 3   | Over the grant, 500  | `87770ab4-ac7c-4768-94a9-46df2367782b` | Refused in 8.6 s, `NOT_AUTHORIZED`: "parameters.amount is 500, above the granted maximum 100."                                  |
| 4   | After the revoke, 50 | `41ec047d-bf64-48f4-b718-a419c7575e8d` | Refused in 8.9 s, `authority-not-authorized`: "livecheck-agent" holds no authority grant for "livecheck:grant".                 |

Each request carried a valid signed approval from `manager-pavan-key-1`. The four records are kept by the operator
(`record-*.json`, no secret). Not checked in this run: the endpoint's Vercel log line for request 2.

Cleaned up the same day: grant `4b60507f-adb8-4fe0-82b3-a83c41e09022` revoked (request 4) and the capability
`livecheck:grant` revoked through maker checker; the policy version stays approved, unused.

## What it uses

| Part         | What                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Policy       | `policy.json`, `livecheck-grant` 1.0.0: `requireAuthorityGrant`, a signed approval for the target, and an amount above 0      |
| Capability   | `livecheck:grant`, registered as an external connector to the existing check endpoint                                         |
| The endpoint | `https://parmana-release-check.vercel.app/api/release` (`../external-connector`): it verifies the release and acts on nothing |
| Agent key    | `livecheck-agent`, allowed only `livecheck:grant` and `livecheck:signal` (shared with `../business-signal-source`)            |
| Scripts      | `../governance.ts` for the maker checker steps, `send.ts` for the agent's requests                                            |

## Before you start

- In the repository root: `npm ci`, then `npm run build` (the scripts use the SDK from this repository).
- The maker key, the checker key and the checker's step up private key file.
- The approver private key file (`manager-pavan-key-1`).
- The Vercel CLI, logged in, and the API's link folder `%USERPROFILE%\parmana-vercel-link`.
- The check endpoint answers an unsigned body with `401`:

  ```powershell
  try { Invoke-WebRequest -Method Post https://parmana-release-check.vercel.app/api/release -Body "{}" -ContentType "application/json" -UseBasicParsing } catch { $_.Exception.Response.StatusCode.value__ }
  ```

  **Expect:** `401`. Anything else: rebuild and deploy it (`../external-connector/README.md`, "Build and deploy the
  endpoint") before going on.

Run everything in one Windows PowerShell window, from the repository root. Set these once:

```powershell
$env:PARMANA_URL = "https://parmana-api-real.vercel.app"
function Use-Key([string]$label) {
  $env:PARMANA_API_KEY = [System.Net.NetworkCredential]::new("", (Read-Host "$label API key" -AsSecureString)).Password.Trim()
  "  $label key: $($env:PARMANA_API_KEY.Length) characters"
}
$g = "examples/live-checks/governance.ts"
$here = "examples/live-checks/authority-grant"
$stepUp = "$env:USERPROFILE\parmana-checker\step-up.private.pem"
$stepUpId = "checker-pavan"
$approver = "$env:USERPROFILE\parmana-approver\manager-pavan__manager-pavan-key-1.private.pem"
$approverArgs = @("--approver-key-file", $approver, "--approver-id", "manager-pavan", "--approver-key-id", "manager-pavan-key-1")
```

Each `approve` step prints the change and waits for you to type `APPROVE`. Read it first.

## 1. The policy

```powershell
Use-Key "Maker"
npx tsx $g propose-policy --file "$here/policy.json"
```

**Expect:** `Proposed: <id>, PENDING_APPROVAL`. Copy the id.

```powershell
Use-Key "Checker"
npx tsx $g approve --kind policy --id <id> --step-up-key-file $stepUp --step-up-key-id $stepUpId
```

**Expect:** the proposed policy, then `Status: APPROVED`.

## 2. The capability

```powershell
Use-Key "Maker"
npx tsx $g propose-connector --capability livecheck:grant --endpoint-url https://parmana-release-check.vercel.app/api/release --policy livecheck-grant --allowed-parameters amount,note
Use-Key "Checker"
npx tsx $g approve --kind connector --id <id> --step-up-key-file $stepUp --step-up-key-id $stepUpId
```

**Expect:** `Proposed: <id>, PENDING_APPROVAL`, then `Status: APPROVED`.

## 3. The agent key (skip if `livecheck-agent` already exists)

The key goes straight to the clipboard and is never shown. Then every entry in `parmana-entries` is deployed, as in
the credential recovery runbook.

```powershell
$id = "livecheck-agent"
$out = npx tsx scripts/generate-api-key.ts --caller-id $id --allowed-capabilities "livecheck:grant,livecheck:signal"
$out | Where-Object { $_.StartsWith('{"callerId"') } | Set-Content "$env:USERPROFILE\parmana-entries\$id.json" -Encoding ascii
$k = (($out | Where-Object { $_ -match '^Key\s+:' }) -replace '^Key\s+:\s*', '').Trim(); Remove-Variable out
"key length: $($k.Length)"; Set-Clipboard -Value $k; Remove-Variable k
Read-Host "Saved in the password manager as 'livecheck-agent'? Press Enter"; Set-Clipboard -Value " "

$link = "$env:USERPROFILE\parmana-vercel-link"
$entries = @(Get-ChildItem "$env:USERPROFILE\parmana-entries\*.json" | ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json })
$entries | ForEach-Object { "{0}  capabilities={1}" -f $_.callerId, ($_.allowedCapabilities -join ",") }
$value = ConvertTo-Json -InputObject $entries -Depth 5 -Compress
vercel env rm PARMANA_API_KEYS production --yes --cwd $link
$value | vercel env add PARMANA_API_KEYS production --sensitive --cwd $link
vercel redeploy (vercel ls parmana-api-real --prod --cwd $link 2>$null | Select-Object -First 1) --target production --cwd $link
```

**Expect:** `key length: 43`, one line per key including `livecheck-agent  capabilities=livecheck:grant,livecheck:signal`
and nothing you do not recognise, then `✓ Ready`.

## 4. Request 1: before any grant

```powershell
Use-Key "livecheck-agent"
npx tsx "$here/send.ts" --case no-grant --amount 50 @approverArgs --out "$here/record-1-no-grant.json"
```

**Expect:** `grant required: true`, `REFUSED`, rule `authority-not-authorized`, `Authority : NOT_AUTHORIZED`, then
`As required`.

## 5. The grant: up to 100 per request, for 7 days

```powershell
Use-Key "Maker"
npx tsx $g propose-grant --caller-id livecheck-agent --capability livecheck:grant --max-amount 100 --valid-days 7
Use-Key "Checker"
npx tsx $g approve --kind grant --id <id> --step-up-key-file $stepUp --step-up-key-id $stepUpId
```

**Expect:** `Proposed: <id>, PENDING_APPROVAL`, the grant with `"parameters.amount": { "max": 100 }`, then
`Status: APPROVED`.

## 6. Requests 2 and 3: within and over the limit

```powershell
Use-Key "livecheck-agent"
npx tsx "$here/send.ts" --case within --amount 50 @approverArgs --out "$here/record-2-within.json"
npx tsx "$here/send.ts" --case over --amount 500 @approverArgs --out "$here/record-3-over.json"
```

**Expect, request 2:** `APPROVED` in about 25 to 35 seconds, the endpoint's answer with `success: true`,
`Verifies offline : true`, `Authority : AUTHORIZED`, `Grant checked` naming `livecheck-agent`, `livecheck:grant` and
the limit, then `As required`.

**Expect, request 3:** `REFUSED`, `Authority : NOT_AUTHORIZED` with a reason naming the limit, then `As required`.

**If request 2 times out, do not send it again.** Read its record first (`send.ts` printed the transaction id):
`GET /trust-records/<id>` with the agent key.

## 7. Request 4: after the revoke

```powershell
Use-Key "Maker"
npx tsx $g propose-revoke --kind grant --caller-id livecheck-agent --capability livecheck:grant
Use-Key "Checker"
npx tsx $g approve --kind grant --id <id> --step-up-key-file $stepUp --step-up-key-id $stepUpId
Use-Key "livecheck-agent"
npx tsx "$here/send.ts" --case revoked --amount 50 @approverArgs --out "$here/record-4-revoked.json"
```

**Expect:** `Status: APPROVED` for the revoke, then `REFUSED`, rule `authority-not-authorized`, then `As required`.

## 8. The endpoint's side

In the Vercel logs of `parmana-release-check`: exactly one `release_acted` line for this check, naming request 2's
transaction and `livecheck:grant`, and no `release_refused`.

## 9. Afterwards

```powershell
Use-Key "Maker"
npx tsx $g propose-revoke --kind connector --capability livecheck:grant
Use-Key "Checker"
npx tsx $g approve --kind connector --id <id> --step-up-key-file $stepUp --step-up-key-id $stepUpId
Remove-Item Env:\PARMANA_API_KEY
```

Keep `livecheck-agent` if the business signal source check comes next. Otherwise delete
`%USERPROFILE%\parmana-entries\livecheck-agent.json` and run the deploy part of stage 3 again: the key stops working.

The four `record-*.json` files hold no secret. Keep them as the evidence.

## When it fails

| You see                                                    | Meaning and fix                                                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `authentication required`                                  | The key is wrong or truncated (43 characters), or stage 3's redeploy is not finished.                            |
| `NON_HUMAN_CALLER_DENIED`                                  | The maker or checker step used the agent key. Run `Use-Key` with the right one.                                  |
| `SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE`                     | The checker step used the maker key.                                                                             |
| `STEP_UP_AUTHORIZATION_INVALID`                            | The step up key file or `$stepUpId` does not match the checker's key, or 120 seconds passed. Run the step again. |
| `AUTHORITY_SELF_GRANT_DENIED`                              | The maker or checker key is `livecheck-agent`. Use the human keys.                                               |
| `is not under a policy with requireAuthorityGrant`         | Stage 1 is not approved.                                                                                         |
| `CAPABILITY_NOT_BOUND`, `503 CONNECTOR_NOT_REGISTERED`     | Stage 2 is not approved.                                                                                         |
| `This key may not use livecheck:grant` or `403` on execute | The agent key does not allow `livecheck:grant`; redo stage 3.                                                    |
| `WRONG: required ...`                                      | A rule did not hold. Stop, keep the output and the record file, and report it.                                   |
