# Live check: one real refund, end to end (not yet run)

Every credential changed on 2026-10-11: the maker, checker and agent API keys, the approver key
(`manager-pavan-key-1`) and the database password. Each was tested on its own (`GET /callers/me`, `GET /ready`), but no
real action has run through all of them together since. This check does that with one real refund of 1 INR, and is
step 4 of `docs/REMAINING-WORK.md` section L.

It proves, in one pass: the agent key authenticates and is limited to `paytm:refund`; the server names the policy in
effect; a request without a signed approval is refused; the new approver key signs an approval the server accepts;
the release reaches `parmana-paytm-agent` and Paytm; and the Execution Trust Record verifies offline.

**It moves real money.** 1 INR goes back to the customer of the order you name. Use an order you own.

## Status

| Date | Result      |
| ---- | ----------- |
| —    | Not run yet |

Record the result here when it runs: the `businessTransactionId`, how long Part B took, whether Paytm shows the
refund, and whether Part C verified. Then update `docs/REMAINING-WORK.md` section L, step 4.

## Before you start

- A paid Paytm order of at least 1 INR: its **Order ID** and **Transaction ID**, from the Paytm merchant dashboard.
- The `paytm-refund-agent` API key, from the password manager.
- The approver private key `%USERPROFILE%\parmana-approver\manager-pavan__manager-pavan-key-1.private.pem`.
- Windows PowerShell, in the repository root, after `npm ci` and `npx tsc -b`.

Rules: run each part whole and in the same window; never paste a key or the approval file anywhere; if a part does
not print what **Expect** says, stop there.

## Part A: without an approval, which must be refused

```powershell
$url = "https://parmana-api-real.vercel.app"
$orderId = Read-Host "Paytm Order ID"
$txnId   = Read-Host "Paytm Transaction ID"
$amount  = 1
$agentKey = [System.Net.NetworkCredential]::new("", (Read-Host "paytm-refund-agent API key" -AsSecureString)).Password.Trim()
"agent key length: $($agentKey.Length)"
$h = @{ Authorization = "Bearer $agentKey" }

# The policy to declare, from the server, never hard coded
$inEffect = Invoke-RestMethod "$url/policies/in-effect?capability=paytm:refund" -Headers $h
$inEffect.policy | Format-List

# Builds the request as JSON text. The approval, when given, is inserted as its
# raw file text: re-encoding it through PowerShell can rewrite its date strings
# and break its signature.
function New-RefundJson([bool]$approved, [string]$approvalJson) {
  $now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
  $tx = [guid]::NewGuid().ToString(); $auth = [guid]::NewGuid().ToString(); $authz = [guid]::NewGuid().ToString()
  $signals = [ordered]@{ refundEligible = $true; fraudCheckPassed = $true; refundAmount = $amount; managerApproved = $approved }
  if ($approvalJson) { $signals.approvalArtifact = "__APPROVAL__" }
  $body = [ordered]@{
    businessTransactionId = $tx
    metadata      = @{ businessTransactionId = $tx; sourceSystem = "refund-live-check" }
    authority     = @{ authorityId = $auth; authorityType = "SERVICE"; principalId = "paytm-refund-agent"; issuedAt = $now }
    authorization = @{ authorizationId = $authz; authorityId = $auth; purpose = "End to end refund live check"; issuedAt = $now }
    intent        = @{ intentId = [guid]::NewGuid().ToString(); authorizationId = $authz; action = "paytm:refund"; target = $orderId
                       parameters = @{ orderId = $orderId; transactionId = $txnId; amount = $amount; refundReason = "Parmana end to end live check" }
                       createdAt = $now }
    policy        = @{ name = $inEffect.policy.name; version = $inEffect.policy.version; schemaVersion = $inEffect.policy.schemaVersion }
    signals       = $signals
  }
  $json = ConvertTo-Json $body -Depth 20 -Compress
  if ($approvalJson) { $json = $json.Replace('"__APPROVAL__"', $approvalJson.Trim()) }
  return @{ id = $tx; json = $json }
}

$a = New-RefundJson $false $null
try {
  Invoke-RestMethod -Method Post "$url/execute" -Headers $h -ContentType "application/json" `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($a.json)) -TimeoutSec 120
} catch { $_.ErrorDetails.Message }
```

**Expect:** `agent key length: 43`; the policy `customer-refund`, `1.2.0`, `1.0.0` (or a newer version, if one was
approved since); then a `POLICY_DENIED` refusal, because there is no signed approval.

**If not:** `authentication required` means the agent key is wrong (see the credential recovery runbook, kept off
this repository). Any other answer: stop and read it.

## Part B: sign the approval, then the real 1 INR refund

```powershell
$approvalFile = Join-Path $env:TEMP "refund-approval.json"
npx tsx scripts/sign-approval.ts `
  --private-key-file "$env:USERPROFILE\parmana-approver\manager-pavan__manager-pavan-key-1.private.pem" `
  --approver-id manager-pavan --key-id manager-pavan-key-1 `
  --capability paytm:refund --resource-id $orderId --max-amount $amount `
  --ttl-seconds 900 --out $approvalFile

$b = New-RefundJson $true ([System.IO.File]::ReadAllText($approvalFile))
"businessTransactionId: $($b.id)"
$sw = [System.Diagnostics.Stopwatch]::StartNew()
try {
  Invoke-RestMethod -Method Post "$url/execute" -Headers $h -ContentType "application/json" `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($b.json)) -TimeoutSec 120 | ConvertTo-Json -Depth 6
} catch { $_.ErrorDetails.Message }
"took $([int]$sw.Elapsed.TotalSeconds) s"
Remove-Item $approvalFile
```

**Expect:** a response showing the refund executed, in about 25 to 35 seconds (`docs/VERIFICATION-GAPS.md` G-84), and
1 INR refunded in the Paytm dashboard.

**If it times out, do not send it again.** The refund may have run. Do Part C first: the record says what happened.
An approval is single use, so a second send needs a new one anyway.

## Part C: verify the signed record offline

The record and the key are saved byte for byte as the server sent them, not re-encoded, so the signature check sees
exactly what was signed.

```powershell
$dir = Join-Path $env:TEMP "refund-check"
New-Item -ItemType Directory -Force $dir | Out-Null
$recordFile = Join-Path $dir "record-$($b.id).json"
Invoke-WebRequest "$url/trust-records/$($b.id)" -Headers $h -UseBasicParsing -OutFile $recordFile
(Invoke-RestMethod "$url/keys/default").pem | Set-Content (Join-Path $dir "default.pem") -Encoding ascii
npx tsx scripts/verify-trust-record.ts $recordFile "default=$(Join-Path $dir 'default.pem')"
Remove-Variable agentKey, h
```

**Expect:** the script reports the record valid. If it names a key id other than `default`, fetch that key with
`GET /keys/<keyId>` and pass it as `<keyId>=<file>`.

## What it does not check

- The business validation features (RFC-0023): `customer-refund` declares no `signalSources` and does not require an
  authority grant, so this refund is decided as before. Once steps 2 and 3 of `docs/REMAINING-WORK.md` section L are
  done, run it again: the decision's `assessment.authority.grant` should then name the grant.
- A refund above the approval's `--max-amount`, a reused approval, or another order: those refusals are covered by
  tests and by the external connector live check (`examples/live-checks/external-connector`).
