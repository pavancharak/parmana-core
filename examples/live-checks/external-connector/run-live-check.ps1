# ADR-0013 step 6: live check of an external connector against a Parmana
# server. Read README.md in this folder first; it explains every stage, what
# each one should print, and what to do when it does not.
#
# Run from the repository root, in Windows PowerShell, one stage at a time:
#
#   powershell -ExecutionPolicy Bypass -File .\examples\live-checks\external-connector\run-live-check.ps1 -Stage ProposePolicy
#
# Stages, in order:
#   ProposePolicy        maker proposes livecheck-receipt 1.0.0
#   ApprovePolicy        checker reviews and approves it, with a step up signature
#   ProposeRegistration  maker proposes livecheck:receipt -> the check endpoint
#   ApproveRegistration  checker reviews and approves it, with a step up signature
#   AgentKey             a key for livecheck-agent, added to PARMANA_API_KEYS, API redeployed
#   Send                 approver signs one approval; the agent sends three requests
#   Verify               fetch one transaction's record and verify it offline (-BusinessTransactionId)
#   ProposeRevoke        maker proposes revoking the registration (after the check)
#   ApproveRevoke        checker approves the revoke
#
# Keys are read with hidden prompts and never printed, stored or logged.
# Change ids are kept between stages in $env:TEMP\parmana-live-check.json.

param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("ProposePolicy", "ApprovePolicy", "ProposeRegistration", "ApproveRegistration",
    "AgentKey", "Send", "Verify", "ProposeRevoke", "ApproveRevoke")]
  [string]$Stage,

  [string]$ApiUrl = "https://parmana-api-real.vercel.app",
  [string]$EndpointUrl = "https://parmana-release-check.vercel.app/api/release",

  # Checker: the step up private key file, and the label it signs with.
  [string]$StepUpKeyFile,
  [string]$CheckerKeyId = "reviewer-charak1987",

  # AgentKey: the current PARMANA_API_KEYS array (hashes only), the folder
  # linked to the API's Vercel project, and the Vercel scope.
  [string]$KeysFile,
  [string]$VercelLink = "$env:USERPROFILE\parmana-vercel-link",
  [string]$Scope = "pavan-dev-singh-charaks-projects",

  # Send: the action approver's private key and ids.
  [string]$ApproverKeyFile,
  [string]$ApproverId = "manager-charak1987",
  [string]$ApproverKeyId = "manager-charak1987-key-2",

  # Verify: the transaction whose record to fetch and verify.
  [string]$BusinessTransactionId
)

$ErrorActionPreference = "Stop"
$ApiUrl = $ApiUrl.TrimEnd("/")

$Capability = "livecheck:receipt"
$PolicyName = "livecheck-receipt"
$PolicyVersion = "1.0.0"
$Here = $PSScriptRoot
$StateFile = Join-Path $env:TEMP "parmana-live-check.json"

function Say([string]$text, [string]$color = "Gray") { Write-Host $text -ForegroundColor $color }
function Step([string]$text) { Write-Host ""; Write-Host "== $text" -ForegroundColor Cyan }
function Stop-Run([string]$text) { Write-Host ""; Write-Host $text -ForegroundColor Red; exit 1 }

function Confirm-Word([string]$word, [string]$what) {
  Write-Host ""
  $answer = Read-Host "Type $word to $what (anything else stops here)"
  if ($answer -cne $word) { Say "Stopped. Nothing further was done." Yellow; exit 0 }
}

function Read-Secret([string]$prompt) {
  for ($try = 1; $try -le 3; $try++) {
    $secure = Read-Host "$prompt (right click to paste)" -AsSecureString
    $value = [System.Net.NetworkCredential]::new("", $secure).Password.Trim()
    if ($value.Length -gt 0) { Say "  received $($value.Length) characters" DarkGray; return $value }
    Say "  Nothing was received. Paste with a right click, then press Enter." Yellow
  }
  Stop-Run "Nothing was received three times. Stopped."
}

# Native tools write progress to stderr, which Windows PowerShell 5.1 turns
# into an error under "Stop". Run them under "Continue" and check the exit code.
function Invoke-Native([scriptblock]$block) {
  $ErrorActionPreference = "Continue"
  & $block
}

function Read-State {
  if (Test-Path $StateFile) { return Get-Content $StateFile -Raw | ConvertFrom-Json }
  return New-Object PSObject
}

function Save-State([string]$name, [string]$value) {
  $state = Read-State
  $state | Add-Member -NotePropertyName $name -NotePropertyValue $value -Force
  $state | ConvertTo-Json | Set-Content $StateFile -Encoding UTF8
}

function Get-StateValue([string]$name, [string]$stage) {
  $value = (Read-State).$name
  if (-not $value) { Stop-Run "No $name saved. Run -Stage $stage first." }
  return $value
}

function Invoke-Api([string]$method, [string]$path, [string]$key, [string]$body) {
  $params = @{ Method = $method; Uri = "$ApiUrl$path"; Headers = @{ Authorization = "Bearer $key" } }
  if ($body) {
    $params.ContentType = "application/json"
    $params.Body = [System.Text.Encoding]::UTF8.GetBytes($body)
  }
  try {
    return Invoke-RestMethod @params
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    $detail = $_.ErrorDetails.Message
    Stop-Run "$method $path answered HTTP $status. $detail"
  }
}

function Approve-Change([string]$listPath, [string]$idField, [string]$approvePath, [string]$id) {
  if (-not $StepUpKeyFile -or -not (Test-Path $StepUpKeyFile)) {
    Stop-Run "Pass -StepUpKeyFile with the checker's step up private key file."
  }
  $key = Read-Secret "Checker API key"

  Step "The change to review"
  $changes = (Invoke-Api GET "${listPath}?status=PENDING_APPROVAL" $key).changes
  $change = $changes | Where-Object { $_.$idField -eq $id } | Select-Object -First 1
  if (-not $change) { Stop-Run "Change $id is not waiting for approval. It may be approved or rejected already." }
  $change | ConvertTo-Json -Depth 20 | Write-Host

  Confirm-Word "APPROVE" "approve exactly this change"

  $signed = Invoke-Native {
    npx tsx scripts/sign-policy-change-step-up.ts --private-key-file $StepUpKeyFile --key-id $CheckerKeyId `
      --pending-policy-change-id $id --action approve 2>$null
  } | Where-Object { $_ -like "{*" } | Select-Object -First 1
  if (-not $signed) { Stop-Run "Signing the step up authorization failed." }

  $result = Invoke-Api POST ($approvePath -f $id) $key ('{"stepUpAuthorization":' + $signed + '}')
  Say "Status: $($result.status)" Green
  Remove-Variable key
}

Set-Location (Resolve-Path "$Here\..\..\..")

switch ($Stage) {
  "ProposePolicy" {
    Step "Propose $PolicyName $PolicyVersion (maker)"
    # Read as UTF-8: Get-Content in Windows PowerShell 5.1 uses the local codepage.
    $policy = [System.IO.File]::ReadAllText("$Here\policy.json", [System.Text.Encoding]::UTF8)
    $key = Read-Secret "Maker API key"
    $body = '{"reason":"ADR-0013 step 6: the live check of an external connector.","proposedContent":' + $policy + '}'
    $result = Invoke-Api POST "/policies/$PolicyName/$PolicyVersion/pending-changes" $key $body
    Save-State "policyChangeId" $result.pendingPolicyChangeId
    Say "Proposed: $($result.pendingPolicyChangeId), $($result.status)" Green
    Say "Next: the checker runs -Stage ApprovePolicy."
  }

  "ApprovePolicy" {
    $id = Get-StateValue "policyChangeId" "ProposePolicy"
    Approve-Change "/policies/pending-changes" "pendingPolicyChangeId" "/policies/pending-changes/{0}/approve" $id
    Say "Next: the maker runs -Stage ProposeRegistration."
  }

  "ProposeRegistration" {
    Step "Propose $Capability -> $EndpointUrl (maker)"
    try {
      $probe = Invoke-WebRequest -Method Post -Uri $EndpointUrl -Body "{}" -ContentType "application/json" -UseBasicParsing
      Stop-Run "The endpoint answered $($probe.StatusCode) to an unsigned body. It must answer 401. Do not register it."
    } catch {
      $status = $_.Exception.Response.StatusCode.value__
      if ($status -ne 401) { Stop-Run "The endpoint answered HTTP $status to an unsigned body; expected 401. Do not register it." }
      Say "The endpoint refuses an unsigned body with 401, as required." Green
    }
    $key = Read-Secret "Maker API key"
    $body = '{"action":"register","capability":"' + $Capability + '","endpointUrl":"' + $EndpointUrl +
      '","policy":"' + $PolicyName + '","allowedParameters":["note"],"timeoutMs":10000,' +
      '"reason":"ADR-0013 step 6: live check endpoint. It acts on nothing and answers with a receipt."}'
    $result = Invoke-Api POST "/external-connectors/changes" $key $body
    Save-State "registrationChangeId" $result.changeId
    Say "Proposed: $($result.changeId), $($result.status), stored as $($result.endpointUrl)" Green
    if ($result.endpointUrl -ne $EndpointUrl) {
      Say "The stored URL differs from the endpoint's audience. Rebuild the endpoint with the stored URL before sending." Yellow
    }
    Say "Next: the checker runs -Stage ApproveRegistration."
  }

  "ApproveRegistration" {
    $id = Get-StateValue "registrationChangeId" "ProposeRegistration"
    Approve-Change "/external-connectors/changes" "changeId" "/external-connectors/changes/{0}/approve" $id
    Say "Next: -Stage AgentKey."
  }

  "AgentKey" {
    Step "A key for livecheck-agent, allowed only $Capability"
    if (-not $KeysFile -or -not (Test-Path $KeysFile)) { Stop-Run "Pass -KeysFile with the current PARMANA_API_KEYS.json (the whole array)." }
    if (-not (Test-Path "$VercelLink\.vercel")) { Stop-Run "$VercelLink is not linked to the API's Vercel project." }

    $current = [System.IO.File]::ReadAllText($KeysFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    $ids = @($current | ForEach-Object { $_.callerId })
    Say "PARMANA_API_KEYS.json has $($ids.Count) entries: $($ids -join ', ')"
    if ($ids -contains "livecheck-agent") { Stop-Run "livecheck-agent is already in the file. Remove it first, or use the key you have." }

    $out = Invoke-Native { npx tsx scripts/generate-api-key.ts --caller-id livecheck-agent --allowed-capabilities $Capability 2>$null }
    $keyLine = $out | Select-String -Pattern '^Key\s+:\s+(\S+)$' | Select-Object -First 1
    $entry = $out | Where-Object { $_.StartsWith('{"callerId"') } | Select-Object -First 1
    if ($null -eq $keyLine -or $null -eq $entry) { Stop-Run "generate-api-key printed something unexpected." }

    Say ""
    Say "The agent's raw key, shown once. Copy it to your secret store now:" Yellow
    Say $keyLine.Matches[0].Groups[1].Value White
    Read-Host "Press Enter when it is stored; the screen is cleared"
    Clear-Host

    $all = [System.IO.File]::ReadAllText($KeysFile, [System.Text.Encoding]::UTF8).Trim()
    if (-not $all.EndsWith("]")) { Stop-Run "$KeysFile is not a JSON array." }
    $updated = $all.Substring(0, $all.Length - 1).TrimEnd() + "," + $entry + "]"
    $null = $updated | ConvertFrom-Json
    Copy-Item $KeysFile "$KeysFile.before-livecheck" -Force
    [System.IO.File]::WriteAllText($KeysFile, $updated, (New-Object System.Text.UTF8Encoding($false)))
    Say "Wrote $KeysFile with $($ids.Count + 1) entries (the old file is $KeysFile.before-livecheck)." Green

    Confirm-Word "SET" "set PARMANA_API_KEYS in production to this file"
    $ErrorActionPreference = "Continue"
    vercel env rm PARMANA_API_KEYS production --yes --cwd $VercelLink 2>&1 | Out-Null
    $updated | vercel env add PARMANA_API_KEYS production --sensitive --cwd $VercelLink 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Stop-Run "Setting PARMANA_API_KEYS failed. Production still runs the old deployment. Run this stage again with -KeysFile $KeysFile.before-livecheck restored." }
    $ErrorActionPreference = "Stop"

    Confirm-Word "REDEPLOY" "redeploy the API to production"
    $lines = Invoke-Native { vercel ls parmana-api-real --prod --scope $Scope --cwd $VercelLink 2>$null }
    $latest = ($lines | Where-Object { $_ -match "^https://" } | Select-Object -First 1)
    if (-not $latest) { Stop-Run "No production deployment found to redeploy." }
    Invoke-Native { vercel redeploy $latest.Trim() --target production --scope $Scope --cwd $VercelLink }
    if ($LASTEXITCODE -ne 0) { Stop-Run "The redeploy failed. Run: vercel redeploy $latest --target production" }
    Say "Redeployed. Next: -Stage Send." Green
  }

  "Send" {
    if (-not $ApproverKeyFile -or -not (Test-Path $ApproverKeyFile)) { Stop-Run "Pass -ApproverKeyFile with the action approver's private key." }
    $target = "live-check-" + (Get-Date -Format "yyyyMMdd-HHmmss")

    Step "The approver signs one approval for $Capability on $target"
    $approvalFile = Join-Path $env:TEMP "parmana-live-check-approval.json"
    Invoke-Native {
      npx tsx scripts/sign-approval.ts --private-key-file $ApproverKeyFile --approver-id $ApproverId `
        --key-id $ApproverKeyId --capability $Capability --resource-id $target --out $approvalFile 2>$null
    } | Where-Object { $_ -like "Signed approval*" } | Write-Host
    if (-not (Test-Path $approvalFile)) { Stop-Run "Signing the approval failed." }

    Step "The agent sends three requests"
    $env:PARMANA_URL = $ApiUrl
    $env:PARMANA_API_KEY = Read-Secret "livecheck-agent API key"
    $record = Join-Path $Here "live-check-record.json"
    Invoke-Native {
      npx tsx examples/live-checks/external-connector/send.ts --approval $approvalFile --target $target --out $record
    }
    $exit = $LASTEXITCODE
    Remove-Item Env:\PARMANA_API_KEY
    Remove-Item $approvalFile -ErrorAction SilentlyContinue
    if ($exit -ne 0) { Stop-Run "The check did not pass. Read the lines above, and README.md, When it fails." }
    Say "Passed. Send $record (it holds no secret) for the evidence, and check the endpoint's logs." Green
  }

  "Verify" {
    if (-not $BusinessTransactionId) { Stop-Run "Pass -BusinessTransactionId." }
    Step "Fetch and verify the record of $BusinessTransactionId"
    $env:PARMANA_URL = $ApiUrl
    $env:PARMANA_API_KEY = Read-Secret "livecheck-agent API key"
    $record = Join-Path $Here "live-check-record-$BusinessTransactionId.json"
    Invoke-Native {
      npx tsx examples/live-checks/external-connector/send.ts --verify $BusinessTransactionId --out $record
    }
    $exit = $LASTEXITCODE
    Remove-Item Env:\PARMANA_API_KEY
    if ($exit -ne 0) { Stop-Run "The record could not be fetched or did not verify. Read the lines above." }
    Say "Verified. The record is $record (it holds no secret)." Green
  }

  "ProposeRevoke" {
    Step "Propose revoking $Capability (maker)"
    $key = Read-Secret "Maker API key"
    $body = '{"action":"revoke","capability":"' + $Capability + '","reason":"ADR-0013 step 6 live check done."}'
    $result = Invoke-Api POST "/external-connectors/changes" $key $body
    Save-State "revokeChangeId" $result.changeId
    Say "Proposed: $($result.changeId), $($result.status)" Green
  }

  "ApproveRevoke" {
    $id = Get-StateValue "revokeChangeId" "ProposeRevoke"
    Approve-Change "/external-connectors/changes" "changeId" "/external-connectors/changes/{0}/approve" $id
  }
}
