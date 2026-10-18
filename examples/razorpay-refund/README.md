# Demo: an AI agent refunds a Razorpay payment, under Parmana

An agent asks for a refund of a Razorpay payment. Parmana decides; a manager's signed approval and the agent's grant
are both required; only then is the refund released, signed, to a small endpoint that calls Razorpay. Every decision,
approved or refused, leaves a signed record that verifies offline.

**Test mode only.** The endpoint refuses to start with a live Razorpay key (`rzp_live_...`). No real money moves.

| Request                                                       | Result                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1. No manager approval                                        | Refused by the policy; Razorpay is never called                        |
| 2. Approval for this payment and ₹1, within the agent's grant | Approved; refunded once in Razorpay; the record verifies offline       |
| 3. Approval for ₹8, but the agent's grant allows up to ₹5     | Refused, `NOT_AUTHORIZED`: a manager's signature cannot lift the limit |
| 4. The approval from request 2 sent again                     | Refused: an approval is used once                                      |

## How it fits together

- `policy.json`: `razorpay-refund` 1.0.0. Needs a grant (`requireAuthorityGrant`) and a signed manager approval for
  this payment (the request's `target`) covering this amount (`parameters.amount`, in paise: 100 is ₹1).
- `endpoint.ts` and `razorpay.ts`: the external connector endpoint, a Vercel function. It verifies Parmana's signed
  release (signature, audience, expiry), then refunds with Razorpay's API. It acts once per decision: each refund
  carries Parmana's transaction id as its Razorpay `receipt`, and the endpoint checks for that receipt before refunding.
  Parmana never holds the Razorpay keys; the endpoint does.
- `build-endpoint.ts`: bundles the endpoint with Parmana's public key and its own URL written in.
- `send.ts`: the agent's side, one case per run.
- `tests/`: the endpoint and policy against a fake Razorpay (`npx vitest run examples/razorpay-refund`).

## Before you start

- **Razorpay test keys.** In the Razorpay dashboard switch to **Test Mode**, then Account & Settings → API Keys →
  Generate Test Key. Keep the key id (`rzp_test_...`) and secret in the password manager. Never paste them in chat.
- **A test payment**, captured. In Test Mode: Payment Links → Create, ₹10, open the link and pay with a test method
  (for UPI, `success@razorpay`; or a test card from Razorpay's test-card page). Then Transactions → Payments: copy
  its id, `pay_...`, and check its status is **captured**.
- The maker and checker keys and their step-up keys, and the approver key (credential recovery runbook).
- Run everything in one Windows PowerShell window, from the repository root, after `npm run build`.

```powershell
$env:PARMANA_URL = "https://parmana-api-real.vercel.app"
function Use-Key([string]$label) {
  $env:PARMANA_API_KEY = [System.Net.NetworkCredential]::new("", (Read-Host "$label API key" -AsSecureString)).Password.Trim()
  "  $label key: $($env:PARMANA_API_KEY.Length) characters"
}
$g = "examples/live-checks/governance.ts"
$here = "examples/razorpay-refund"
$stepUp = "$env:USERPROFILE\parmana-checker\step-up.private.pem"
$stepUpId = "checker-pavan"
$approver = "$env:USERPROFILE\parmana-approver\manager-pavan__manager-pavan-key-1.private.pem"
$approverArgs = @("--approver-key-file", $approver, "--approver-id", "manager-pavan", "--approver-key-id", "manager-pavan-key-1")
$payment = "pay_..."   # the captured test payment id
```

Each `approve` step prints the change and waits for you to type `APPROVE`. Paste an approve line on its own.

## 1. Build and deploy the endpoint

```powershell
npx tsx "$here/build-endpoint.ts" --parmana-url $env:PARMANA_URL `
  --endpoint-url https://parmana-razorpay-demo.vercel.app/api/refund --out ..\parmana-razorpay-demo
cd ..\parmana-razorpay-demo
npx vercel link --yes --project parmana-razorpay-demo
foreach ($name in "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET") {
  $v = [System.Net.NetworkCredential]::new("", (Read-Host "$name (test mode)" -AsSecureString)).Password.Trim()
  $v | npx vercel env add $name production --sensitive
  Remove-Variable v
}
npx vercel deploy --prod --yes
cd ..\parmana
```

Deploy from inside `..\parmana-razorpay-demo`, never from the repository folder.

**Expect:** the production address `https://parmana-razorpay-demo.vercel.app`. If Vercel gives another address, build
again with that address as `--endpoint-url` and deploy again: a release made for any other address is refused.

**Check:**

```powershell
try { Invoke-RestMethod -Method Post https://parmana-razorpay-demo.vercel.app/api/refund -ContentType "application/json" -Body "{}" } catch { $_.ErrorDetails.Message }
```

**Expect:** `{"errors":["the body is not { release, signature }"]}`. The endpoint refuses anything Parmana did not sign.

## 2. The policy

```powershell
Use-Key "Maker"
npx tsx $g propose-policy --file "$here/policy.json"
Use-Key "Checker"
npx tsx $g approve --kind policy --id <id> --step-up-key-file $stepUp --step-up-key-id $stepUpId
```

**Expect:** `Proposed: <id>, PENDING_APPROVAL`, then the policy, then `Status: APPROVED`.

## 3. The capability `razorpay:refund`, released to the endpoint

```powershell
Use-Key "Maker"
npx tsx $g propose-connector --capability razorpay:refund --endpoint-url https://parmana-razorpay-demo.vercel.app/api/refund --policy razorpay-refund --allowed-parameters amount
Use-Key "Checker"
npx tsx $g approve --kind connector --id <id> --step-up-key-file $stepUp --step-up-key-id $stepUpId
```

**Expect:** `Proposed: <id>, PENDING_APPROVAL`, then `Status: APPROVED`.

## 4. The agent's key, allowed only `razorpay:refund`

The key goes straight to the clipboard and is never shown. Then every entry in `parmana-entries` is deployed, as in the
credential recovery runbook.

```powershell
$id = "razorpay-demo-agent"
$out = npx tsx scripts/generate-api-key.ts --caller-id $id --allowed-capabilities "razorpay:refund"
$out | Where-Object { $_.StartsWith('{"callerId"') } | Set-Content "$env:USERPROFILE\parmana-entries\$id.json" -Encoding ascii
$k = (($out | Where-Object { $_ -match '^Key\s+:' }) -replace '^Key\s+:\s*', '').Trim(); Remove-Variable out
"key length: $($k.Length)"; Set-Clipboard -Value $k; Remove-Variable k
Read-Host "Saved in the password manager as 'razorpay-demo-agent'? Press Enter"; Set-Clipboard -Value " "

$link = "$env:USERPROFILE\parmana-vercel-link"
$entries = @(Get-ChildItem "$env:USERPROFILE\parmana-entries\*.json" | ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json })
$entries | ForEach-Object { "{0}  capabilities={1}" -f $_.callerId, ($_.allowedCapabilities -join ",") }
$value = ConvertTo-Json -InputObject $entries -Depth 5 -Compress
vercel env rm PARMANA_API_KEYS production --yes --cwd $link
$value | vercel env add PARMANA_API_KEYS production --sensitive --cwd $link
vercel redeploy (vercel ls parmana-api-real --prod --cwd $link 2>$null | Select-Object -First 1) --target production --cwd $link
```

**Expect:** `key length: 43`, a line `razorpay-demo-agent  capabilities=razorpay:refund` and nothing you do not recognise,
then `✓ Ready`.

## 5. The agent's grant: up to ₹5 (500 paise) per refund, for 7 days

```powershell
Use-Key "Maker"
npx tsx $g propose-grant --caller-id razorpay-demo-agent --capability razorpay:refund --max-amount 500 --valid-days 7
Use-Key "Checker"
npx tsx $g approve --kind grant --id <id> --step-up-key-file $stepUp --step-up-key-id $stepUpId
```

**Expect:** the grant with `"parameters.amount": { "max": 500 }`, then `Status: APPROVED`.

## 6. The demo: four requests

```powershell
Use-Key "razorpay-demo-agent"
$approvalFile = Join-Path $env:TEMP "razorpay-approval.json"
npx tsx "$here/send.ts" --case no-approval --payment $payment --amount 100 --out "$here/record-1-no-approval.json"
npx tsx "$here/send.ts" --case approved --payment $payment --amount 100 @approverArgs --save-approval $approvalFile --out "$here/record-2-approved.json"
npx tsx "$here/send.ts" --case over-limit --payment $payment --amount 800 @approverArgs --out "$here/record-3-over-limit.json"
npx tsx "$here/send.ts" --case replay --payment $payment --amount 100 --approval-file $approvalFile --out "$here/record-4-replay.json"
Remove-Item $approvalFile
```

**Expect:** each run ends with `PASS`.

- Request 1: `REFUSED`, rule `reject-manager-approval-required`.
- Request 2: `APPROVED` in about 25 to 35 seconds, `Razorpay answered` with a `refundId` (`rfnd_...`), `amount` 100,
  `alreadyRefunded` false, then `Verifies offline : true`.
- Request 3: `REFUSED`, `Authority : NOT_AUTHORIZED`, naming the limit 500.
- Request 4: `REFUSED`, rule `signal-state-verification-violation`: the approval is spent and no longer matches the verified state (`managerApproved=true != verified managerApproved=false`). It is not a separate "used" rule. The same refusal is checked offline in `docs/evaluation/agentrust-refund/README.md` and `docs/CLAIMS.md` 3.23.

**If request 2 times out, do not send it again.** The refund may have run; read its record first:
`GET /trust-records/<transaction id>` with the agent key. A second send would need a new approval anyway, and the
endpoint would answer from Razorpay's existing refund instead of refunding twice.

**Show it:** in the Razorpay dashboard (Test Mode) → Refunds: one ₹1 refund on the payment, its receipt equal to the
transaction id `send.ts` printed for request 2. Nothing for requests 1, 3 and 4.

## 7. After the demo

```powershell
Use-Key "Maker"
npx tsx $g propose-revoke --kind grant --caller-id razorpay-demo-agent --capability razorpay:refund
npx tsx $g propose-revoke --kind connector --capability razorpay:refund
Use-Key "Checker"
npx tsx $g approve --kind grant --id <id> --step-up-key-file $stepUp --step-up-key-id $stepUpId
npx tsx $g approve --kind connector --id <id> --step-up-key-file $stepUp --step-up-key-id $stepUpId
```

Then delete `razorpay-demo-agent.json` from `parmana-entries` and deploy the keys again (step 4, second block), and
delete the test keys in the Razorpay dashboard if you no longer need them.

## What it does not show

- **No live money.** Test mode only, by design of the endpoint.
- **Eligibility is not checked against an order system.** Parmana's business signal sources can do that; this demo
  does not connect one. The manager's approval and the agent's grant decide.
- **What Razorpay answered is the endpoint's claim.** The signed record proves what Parmana decided and released, and
  what the endpoint reported; Razorpay's own dashboard is the record of the refund.
- **Limits are per refund.** Daily limits are designed, not built.
