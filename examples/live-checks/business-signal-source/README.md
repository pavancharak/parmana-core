# Live check: a business signal source in production

RFC-0023 phase 2 lets an operator register any business system as a source of facts, so Parmana asks it, never the
agent (`docs/CLAIMS.md` 2.54); phase 4 carries what the decision rests on to the system that acts, as signed
`conditions` (2.56). Both are built, tested and deployed, but no source has answered a production decision
(`docs/VERIFICATION-GAPS.md` G-92). This check proves it against the real server, with a demo source and an action
that change nothing anywhere:

| #   | Request (each with a valid signed approval)                   | Required                                                                                                                                                 |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Invoice `INV-LC-PAID`, the agent declares nothing             | `APPROVED`; the record holds a Trusted Signal from `livecheck-erp` saying `true` with `sourceProofVerified: true`; the release carries it as a condition |
| 2   | Invoice `INV-LC-UNPAID`                                       | Refused by the policy; validation `VALID`: the source answered, `false`                                                                                  |
| 3   | Invoice `INV-LC-UNPAID`, the agent claims `invoicePaid: true` | Refused, `INVALID`: the source's value differs from the agent's                                                                                          |
| 4   | Invoice `INV-LC-NONE`                                         | Refused, `MISSING_DATA`: the source has no such invoice                                                                                                  |

## Status

**Passed in production on 2026-10-11**, against `https://parmana-api-real.vercel.app`, with the demo source
`livecheck-erp` at `https://parmana-signal-check.vercel.app/api/signals` (key id `livecheck-erp-1`), policy
`livecheck-signal` 1.0.0 and capability `livecheck:signal`. The three registrations were proposed by `checker-pavan`
and approved by `maker-pavan` with a step up authorization; the maker checker rule holds either way round.

| #   | Request                                               | Transaction                            | Answer                                                                                                                                                                     |
| --- | ----------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Invoice `INV-LC-PAID`, the agent declares nothing     | `d736681f-8d86-4e24-bcf3-66debfa6ac23` | `APPROVED` in 29.4 s, released once (receipt `RC-d736681f`), `VALID`; Trusted Signal: livecheck-erp says INV-LC-PAID = true, `sourceProofVerified: true`; verifies offline |
| 2   | Invoice `INV-LC-UNPAID`                               | `266278b4-7683-43fd-97e7-aa724c6cca9a` | Refused in 10.8 s by rule `reject-otherwise`; `VALID`: the source answered `false`, signed and verified                                                                    |
| 3   | `INV-LC-UNPAID`, the agent claims `invoicePaid: true` | `1fd2274c-65e2-47c4-bda5-4dd57b198277` | Refused in 9.2 s, `INVALID`: "the request proposed true, but source livecheck-erp reports false"                                                                           |
| 4   | Invoice `INV-LC-NONE`                                 | `173c6f4f-f9d7-46e0-a712-9d9f39a274cd` | Refused in 9.2 s, `MISSING_DATA`: "no invoice INV-LC-NONE"                                                                                                                 |

Each request carried a valid signed approval from `manager-pavan-key-1`. The four records are kept by the operator
(`record-*.json`, no secret). Not checked in this run: the `release_acted` log line of the release check endpoint
for request 1, which shows the `conditions` the release carried.

Cleaned up the same day: `livecheck:signal` and the source `livecheck-erp` revoked through maker checker (proposed by
`checker-pavan`, approved by `maker-pavan`), and the source's private key deleted from the operator's machine. The
Vercel project stays; without a registration Parmana no longer asks it.

Before deployment, the bundle `build-endpoint.ts` makes answered Parmana's own query client
(`HttpBusinessSignalSource`) locally, run as Vercel runs it.

## What it uses

| Part        | What                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| The source  | `endpoint.ts`: example 08's handler answering from a fixed table, deployed as Vercel project `parmana-signal-check`                        |
| Its address | `https://parmana-signal-check.vercel.app/api/signals`, registered as source `livecheck-erp`                                                |
| Its key     | An Ed25519 key pair made for this check: the public key registered with Parmana, the private key only in Vercel's `SOURCE_PRIVATE_KEY_PEM` |
| Policy      | `policy.json`, `livecheck-signal` 1.0.0: `invoicePaid` sourced from `livecheck-erp`, and a signed approval for the target                  |
| Capability  | `livecheck:signal`, registered as an external connector to the release check endpoint (`../external-connector`)                            |
| Agent key   | `livecheck-agent`, allowed only `livecheck:grant` and `livecheck:signal` (made in `../authority-grant`, stage 3)                           |
| Scripts     | `../governance.ts` for the maker checker steps, `send.ts` for the agent's requests                                                         |

## Before you start

- In the repository root: `npm ci`, then `npm run build`.
- The maker key, the checker key and the checker's step up private key file; the approver private key file.
- The Vercel CLI, logged in, scope `pavan-dev-singh-charaks-projects`.
- The agent key `livecheck-agent` (`../authority-grant/README.md`, stage 3). If you have not run that check, run its
  stage 3 alone.

Set these once, in one Windows PowerShell window, from the repository root:

```powershell
$env:PARMANA_URL = "https://parmana-api-real.vercel.app"
function Use-Key([string]$label) {
  $env:PARMANA_API_KEY = [System.Net.NetworkCredential]::new("", (Read-Host "$label API key" -AsSecureString)).Password.Trim()
  "  $label key: $($env:PARMANA_API_KEY.Length) characters"
}
$g = "examples/live-checks/governance.ts"
$here = "examples/live-checks/business-signal-source"
$sourceUrl = "https://parmana-signal-check.vercel.app/api/signals"
$keyDir = "$env:USERPROFILE\parmana-signal-check-key"
$deployDir = Join-Path (Split-Path (Get-Location)) "parmana-signal-check"   # next to the repository, not inside it
$stepUp = "$env:USERPROFILE\parmana-checker\step-up.private.pem"
$stepUpId = "checker-pavan"
$approver = "$env:USERPROFILE\parmana-approver\manager-pavan__manager-pavan-key-1.private.pem"
$approverArgs = @("--approver-key-file", $approver, "--approver-id", "manager-pavan", "--approver-key-id", "manager-pavan-key-1")
```

## 1. Make the source's key and deploy the source

```powershell
New-Item -ItemType Directory -Force $keyDir | Out-Null
node -e "const c=require('crypto');const k=c.generateKeyPairSync('ed25519');const f=require('fs');f.writeFileSync(process.argv[1]+'/private.pem',k.privateKey.export({format:'pem',type:'pkcs8'}));f.writeFileSync(process.argv[1]+'/public.pem',k.publicKey.export({format:'pem',type:'spki'}))" $keyDir

npx tsx "$here/build-endpoint.ts" --parmana-url $env:PARMANA_URL --endpoint-url $sourceUrl --key-id livecheck-erp-1 --out $deployDir
$repo = Get-Location
Set-Location $deployDir   # deploy from inside the folder: run from the repository, Vercel applies its vercel.json
vercel link --yes --project parmana-signal-check --scope pavan-dev-singh-charaks-projects
Remove-Item .env.local -ErrorAction SilentlyContinue
Get-Content "$keyDir\private.pem" -Raw | vercel env add SOURCE_PRIVATE_KEY_PEM production --sensitive
vercel deploy --prod --yes --scope pavan-dev-singh-charaks-projects
Set-Location $repo

try { Invoke-WebRequest -Method Get $sourceUrl -UseBasicParsing | Out-Null; "source: 2xx (WRONG)" } catch { "source: $($_.Exception.Response.StatusCode.value__)" }
```

**Expect:** `Built ...`, `Audience: https://parmana-signal-check.vercel.app/api/signals`, the project linked (it is
created if new), the variable added, a production deployment `✓ Ready`, then `source: 405`: the function itself
answers (a `401` there would be Vercel's own login protection, not the source).

**If not:** if `vercel link` says the project does not exist, create it with
`vercel project add parmana-signal-check --scope pavan-dev-singh-charaks-projects` and link again. If the source is
built for one address and Parmana signs for another, it refuses every query; read `signal_refused` lines in its logs.
If Vercel gives the project another address, build again with that address as `--endpoint-url` and use it
from here on. If the last line is `401`, turn off Vercel Authentication under the project's Settings, Deployment Protection. If it
is `404` or the deploy says `api/index.ts` does not match, the deploy ran from the repository folder: run it from
inside `$deployDir`. Anything but `405`: stop, do not register it.

`private.pem` is a secret: keep `$keyDir` out of the repository, and delete it after the check (the copy in Vercel is
enough). It signs only this demo source's answers.

## 2. Rebuild the release check endpoint, so its log shows the conditions

The release check endpoint (`../external-connector`) now logs the `conditions` a release carries. The deployment from
2026-10-01 does not; rebuild and deploy it once:

```powershell
$releaseDir = Join-Path (Split-Path (Get-Location)) "parmana-release-check"
npx tsx examples/live-checks/external-connector/build-endpoint.ts --parmana-url $env:PARMANA_URL --endpoint-url https://parmana-release-check.vercel.app/api/release --out $releaseDir
$repo = Get-Location; Set-Location $releaseDir
vercel deploy --prod --yes --scope pavan-dev-singh-charaks-projects
Set-Location $repo
```

**Expect:** `✓ Ready`. (If the folder was never linked, Vercel asks; choose the existing project
`parmana-release-check`.)

## 3. Register the source, the policy and the capability

```powershell
Use-Key "Maker"
npx tsx $g propose-source --name livecheck-erp --endpoint-url $sourceUrl --public-key-file "$keyDir\public.pem" --key-id livecheck-erp-1
npx tsx $g propose-policy --file "$here/policy.json"
npx tsx $g propose-connector --capability livecheck:signal --endpoint-url https://parmana-release-check.vercel.app/api/release --policy livecheck-signal --allowed-parameters invoiceId,note
```

**Expect:** three `Proposed: <id>, PENDING_APPROVAL` lines. Copy the three ids: source, policy, connector.

```powershell
Use-Key "Checker"
npx tsx $g approve --kind source --id <source id> --step-up-key-file $stepUp --step-up-key-id $stepUpId
npx tsx $g approve --kind policy --id <policy id> --step-up-key-file $stepUp --step-up-key-id $stepUpId
npx tsx $g approve --kind connector --id <connector id> --step-up-key-file $stepUp --step-up-key-id $stepUpId
```

**Expect:** each change shown, then `Status: APPROVED`, three times. Approve the source first: a policy naming a source
that is not registered refuses every request.

## 4. The four requests

```powershell
Use-Key "livecheck-agent"
npx tsx "$here/send.ts" --case paid @approverArgs --out "$here/record-1-paid.json"
npx tsx "$here/send.ts" --case unpaid @approverArgs --out "$here/record-2-unpaid.json"
npx tsx "$here/send.ts" --case mismatch @approverArgs --out "$here/record-3-mismatch.json"
npx tsx "$here/send.ts" --case unknown @approverArgs --out "$here/record-4-unknown.json"
```

**Expect, request 1:** `sourced: {"invoicePaid":...}`, `APPROVED` in about 25 to 35 seconds, the endpoint's answer
with `success: true`, `Verifies offline : true`, `Validation : VALID`, `Trusted Signal : livecheck-erp says INV-LC-PAID
= true, ... source proof verified: true`, then `As required`.

**Expect, requests 2 to 4:** `REFUSED`, with validation `VALID`, `INVALID` and `MISSING_DATA` in that order, then
`As required` each time.

**If request 1 times out, do not send it again.** Read its record first: `GET /trust-records/<id>` with the agent key.

## 5. The two endpoints' side

- Vercel logs of `parmana-signal-check`: one `signal_answered` line per request, naming its transaction and the
  invoice, with `value` `true`, `false`, `false`, and `status` `not_found` for the last; no `signal_refused`.
- Vercel logs of `parmana-release-check`: exactly one `release_acted` line for this check, for request 1, with
  `conditions` holding `invoicePaid` from `livecheck-erp`, value `true`, and a `validUntil` about 5 minutes after the
  answer. Requests 2 to 4 were refused before anything was released.

## 6. Afterwards

```powershell
Use-Key "Maker"
npx tsx $g propose-revoke --kind connector --capability livecheck:signal
npx tsx $g propose-revoke --kind source --name livecheck-erp
Use-Key "Checker"
npx tsx $g approve --kind connector --id <id> --step-up-key-file $stepUp --step-up-key-id $stepUpId
npx tsx $g approve --kind source --id <id> --step-up-key-file $stepUp --step-up-key-id $stepUpId
Remove-Item Env:\PARMANA_API_KEY
Remove-Item -Recurse $keyDir
```

Then remove `livecheck-agent` (delete `%USERPROFILE%\parmana-entries\livecheck-agent.json` and run the deploy part of
`../authority-grant/README.md` stage 3 again), and delete the Vercel project `parmana-signal-check` or leave it: it
answers only queries signed by Parmana for its own address, and only about the demo invoices.

The four `record-*.json` files hold no secret. Keep them as the evidence.

## When it fails

| You see                                                                               | Meaning and fix                                                                                                      |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `EXTERNAL_ENDPOINT_ADDRESS_REFUSED` when proposing or approving                       | The host did not resolve only to public addresses at that moment. Run the step again; if it persists, stop.          |
| `is not under a policy that sources invoicePaid`                                      | The policy in stage 3 is not approved.                                                                               |
| Request 1 refused with `SOURCE_UNAVAILABLE`                                           | The source is not approved, not deployed, or answers wrongly: read `parmana-signal-check`'s logs (`signal_refused`). |
| `signal_refused`: "the query is not meant for this endpoint"                          | The source was built for another address than it is registered under. Build again with the registered address.       |
| `signal_refused`: "the query is not signed by Parmana"                                | The bundle has another Parmana public key, for example after a key rotation. Build and deploy it again.              |
| Request 1 refused with `VALIDATION_EXPIRED`                                           | The source's clock or the request is late by more than 60 seconds. Send it again as a new request.                   |
| `authentication required`, `NON_HUMAN_CALLER_DENIED`, `STEP_UP_AUTHORIZATION_INVALID` | As in `../authority-grant/README.md`, "When it fails".                                                               |
| `WRONG: required ...`                                                                 | A rule did not hold. Stop, keep the output and the record file, and report it.                                       |
