# ADR-0014 steps 2 and 3: set up the public sandbox and check it live.
# Read README.md in this folder first; it explains every stage, what each
# one should print, and what to do when it does not.
#
# Run from the repository root, in Windows PowerShell, one stage at a time:
#
#   powershell -ExecutionPolicy Bypass -File .\deploy\sandbox\setup-sandbox.ps1 -Stage Keys
#
# Stages, in order:
#   Keys                 make every sandbox key in -KeyFolder (a new folder)
#   Migrate              create the schema in the new Supabase project
#   Link                 link a local folder to the Vercel project parmana-sandbox
#   ProductionNames      list production's variable NAMES, to compare (no values)
#   SetEnv               set the sandbox's variables on parmana-sandbox
#   Deploy               redeploy parmana-sandbox and check it is ready
#   Endpoint             build and deploy the receipt endpoint
#   ProposeApprover      maker proposes the demo approver's public key
#   ApproveApprover      checker approves it, with a step up signature
#   ProposePolicy        maker proposes sandbox-receipt 1.0.0
#   ApprovePolicy        checker approves it
#   ProposeRegistration  maker proposes sandbox:receipt -> the receipt endpoint
#   ApproveRegistration  checker approves it
#   Check                the live check, with the published demo key only
#   Retention            install the daily 7 day retention job in the sandbox database
#
# The sandbox's own keys are read from -KeyFolder and never printed. The two
# database connection strings are read with hidden prompts and never stored.
# Change ids are kept between stages in $env:TEMP\parmana-sandbox-setup.json.

param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Keys", "Migrate", "Link", "ProductionNames", "SetEnv", "Deploy", "Endpoint",
    "ProposeApprover", "ApproveApprover", "ProposePolicy", "ApprovePolicy",
    "ProposeRegistration", "ApproveRegistration", "Check", "Retention")]
  [string]$Stage,

  [string]$KeyFolder = "D:\key\parmana-sandbox",
  [string]$ApiUrl = "https://parmana-sandbox.vercel.app",
  [string]$EndpointUrl = "https://parmana-sandbox-receipt.vercel.app/api/release",
  [string]$EndpointFolder = "D:\last\parmana-sandbox-receipt",
  [string]$VercelLink = "$env:USERPROFILE\parmana-sandbox-link",
  [string]$ProductionLink = "$env:USERPROFILE\parmana-vercel-link",
  [string]$Project = "parmana-sandbox",
  [string]$Scope = "pavan-dev-singh-charaks-projects",
  [string]$CorsOrigins = "https://docs.parmanasystems.com",

  # Production's Supabase project, which the sandbox must never use. The
  # repository's .env is also read, and its project refused too.
  [string]$ProductionProjectRef = "ltjadvsjlpcygborxzet"
)

$ErrorActionPreference = "Stop"
$ApiUrl = $ApiUrl.TrimEnd("/")

$Capability = "sandbox:receipt"
$PolicyName = "sandbox-receipt"
$PolicyVersion = "1.0.0"
$ApproverId = "sandbox-demo-approver"
$ApproverKeyId = "sandbox-demo-approver-key-1"
$CheckerId = "sandbox-checker"
$Here = $PSScriptRoot
$StateFile = Join-Path $env:TEMP "parmana-sandbox-setup.json"

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

function Read-Utf8([string]$path) {
  # Get-Content in Windows PowerShell 5.1 uses the local codepage.
  return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

function Key-File([string]$name) {
  $path = Join-Path $KeyFolder $name
  if (-not (Test-Path $path)) { Stop-Run "$path is missing. Run -Stage Keys first, or pass -KeyFolder." }
  return $path
}

function Key-Value([string]$name) { return (Read-Utf8 (Key-File $name)).Trim() }

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
  $key = Key-Value "sandbox-checker.key"
  $stepUpFile = Key-File "sandbox-checker.step-up.private.pem"

  Step "The change to review"
  $changes = (Invoke-Api GET "${listPath}?status=PENDING_APPROVAL" $key).changes
  $change = $changes | Where-Object { $_.$idField -eq $id } | Select-Object -First 1
  if (-not $change) { Stop-Run "Change $id is not waiting for approval. It may be approved or rejected already." }
  $change | ConvertTo-Json -Depth 20 | Write-Host

  Confirm-Word "APPROVE" "approve exactly this change"

  $signed = Invoke-Native {
    npx tsx scripts/sign-policy-change-step-up.ts --private-key-file $stepUpFile --key-id $CheckerId `
      --pending-policy-change-id $id --action approve 2>$null
  } | Where-Object { $_ -like "{*" } | Select-Object -First 1
  if (-not $signed) { Stop-Run "Signing the step up authorization failed." }

  $result = Invoke-Api POST ($approvePath -f $id) $key ('{"stepUpAuthorization":' + $signed + '}')
  Say "Status: $($result.status)" Green
}

# The Supabase project in a pooler string: the user is postgres.<project>.
function Get-ProjectRef([string]$url) {
  if ($url -match '^postgres(?:ql)?://postgres\.([a-z0-9]+)[:@]') { return $Matches[1] }
  return ""
}

# Refuses production's database, and any string that is not a Supabase
# pooler string with a port, before anything connects to it.
function Assert-SandboxDatabase([string]$url, [string]$port) {
  $ref = Get-ProjectRef $url
  if (-not $ref) { Stop-Run "That is not a Supabase pooler string (postgresql://postgres.<project>:...). Nothing was done." }

  $production = @($ProductionProjectRef)
  $envFile = Join-Path (Get-Location) ".env"
  if (Test-Path $envFile) {
    $line = (Read-Utf8 $envFile) -split "`n" | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
    if ($line) { $production += Get-ProjectRef ($line -replace '^DATABASE_URL=', '').Trim().Trim('"') }
  }
  if ($production -contains $ref) {
    Stop-Run "That string is PRODUCTION's database (project $ref). Nothing was done. Copy the string from the Connect page of the sandbox project in Supabase, not from .env."
  }
  if ($url -notmatch ":$port/") { Stop-Run "That is not the string on port $port. Nothing was done." }

  $saved = (Read-State).sandboxProjectRef
  if ($saved -and $saved -ne $ref) {
    Stop-Run "That is project $ref, but Migrate used project $saved. Use the same sandbox project. Nothing was done."
  }
  return $ref
}

function Set-VercelEnv([string]$name, [string]$value) {
  $ErrorActionPreference = "Continue"
  vercel env rm $name production --yes --cwd $VercelLink 2>&1 | Out-Null
  $value | vercel env add $name production --sensitive --cwd $VercelLink 2>&1 | Out-Null
  $code = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
  if ($code -ne 0) { Stop-Run "Setting $name failed. Nothing after it was set. Run this stage again." }
  Say "  set $name" DarkGray
}

Set-Location (Resolve-Path "$Here\..\..")

switch ($Stage) {
  "Keys" {
    Step "Make every sandbox key in $KeyFolder"
    if ((Test-Path $KeyFolder) -and (Get-ChildItem $KeyFolder | Measure-Object).Count -gt 0) {
      Stop-Run "$KeyFolder already has files. The sandbox keys exist; do not make them again."
    }
    Invoke-Native { npx tsx deploy/sandbox/make-keys.ts --out $KeyFolder 2>$null }
    if ($LASTEXITCODE -ne 0) { Stop-Run "Making the keys failed." }
    Say "Next: create the Supabase project (README step 2), then -Stage Migrate." Green
  }

  "Retention" {
    Step "Install the daily retention job in the sandbox database (deploy/sandbox/retention.sql)"
    $saved = (Read-State).sandboxProjectRef
    if (-not $saved) { Stop-Run "Migrate has not recorded the sandbox project on this machine. Nothing was done." }
    Say "Paste the SESSION pooler string of the sandbox project $saved (port 5432), never production's."
    $url = Read-Secret "Sandbox DATABASE_URL, session pooler"
    $ref = Assert-SandboxDatabase $url "5432"
    $env:DATABASE_URL = $url
    Remove-Variable url
    try {
      Invoke-Native { npx tsx deploy/sandbox/retention.ts check --project $ref }
      if ($LASTEXITCODE -ne 0) { Stop-Run "The check failed. Nothing was installed." }
      Confirm-Word "INSTALL" "install the function and the daily job (03:30 UTC, 7 days) in $ref"
      Invoke-Native { npx tsx deploy/sandbox/retention.ts install --project $ref }
      if ($LASTEXITCODE -ne 0) { Stop-Run "Installing failed. Read the line above." }
    } finally {
      Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
    }
    Say "Installed. It first deletes at 03:30 UTC, anything older than 7 days." Green
  }

  "Migrate" {
    Step "Create the schema in the sandbox database"
    Say "Paste the SESSION pooler string of the NEW sandbox project (port 5432), never production's."
    $url = Read-Secret "Sandbox DATABASE_URL, session pooler"
    $ref = Assert-SandboxDatabase $url "5432"
    $env:DATABASE_URL = $url
    Remove-Variable url
    $status = Invoke-Native { npm run --silent db:migrate -- status 2>&1 }
    $status | Select-Object -First 3 | Write-Host
    if (-not (($status | Out-String) -match "(?m)^Database: \S+ as postgres\.$ref ")) {
      Remove-Item Env:\DATABASE_URL
      Stop-Run "The migration runner did not use the string you pasted. Nothing was written."
    }
    if ($status | Where-Object { $_ -match '^applied ' }) {
      Remove-Item Env:\DATABASE_URL
      Stop-Run "This database already has migrations, so it is not a new sandbox database. Nothing was written."
    }
    Save-State "sandboxProjectRef" $ref
    Confirm-Word "APPLY" "apply every migration to the new, empty database $ref"
    Invoke-Native { npm run --silent db:migrate -- apply }
    $code = $LASTEXITCODE
    Invoke-Native { npm run --silent db:migrate -- status 2>&1 } | Select-Object -Last 2 | Write-Host
    Remove-Item Env:\DATABASE_URL
    if ($code -ne 0) { Stop-Run "The migration failed. Read the lines above." }
    Say "Next: -Stage Link." Green
  }

  "Link" {
    Step "Link $VercelLink to the Vercel project $Project"
    New-Item -ItemType Directory -Force $VercelLink | Out-Null
    Invoke-Native { vercel link --yes --project $Project --scope $Scope --cwd $VercelLink }
    if ($LASTEXITCODE -ne 0) { Stop-Run "Linking failed. Create the project first (README step 3)." }
    Say "Linked. Next: -Stage ProductionNames." Green
  }

  "ProductionNames" {
    Step "Production's variable names (no values), to compare with the sandbox's"
    if (-not (Test-Path "$ProductionLink\.vercel")) { Stop-Run "$ProductionLink is not linked to production's project." }
    Invoke-Native { vercel env ls production --cwd $ProductionLink }
    Say ""
    Say "SetEnv sets: NODE_ENV PARMANA_POLICY_DIR PARMANA_STORAGE DATABASE_URL PARMANA_KEY_DIR"
    Say "  PARMANA_KEY_MATERIAL_JSON PARMANA_API_KEYS PARMANA_SANDBOX PARMANA_SANDBOX_APPROVER_ID"
    Say "  PARMANA_SANDBOX_APPROVER_KEY_ID PARMANA_SANDBOX_APPROVER_PRIVATE_KEY PARMANA_CORS_ORIGINS"
    Say "If production has a name not listed here that is not a connector (PAYTM_, HUBSPOT_, GITHUB_, SLACK_," Yellow
    Say "PARMANA_GITHUB_VERCEL_CONNECT_CONNECTOR_ID), KMS (KEY_PROVIDER, AWS_) or email/webhook setting, stop and ask." Yellow
  }

  "SetEnv" {
    Step "Set the sandbox's variables on $Project (production environment)"
    if (-not (Test-Path "$VercelLink\.vercel")) { Stop-Run "$VercelLink is not linked. Run -Stage Link first." }
    $keys = Key-Value "PARMANA_API_KEYS.json"
    $material = Key-Value "key-material.json"
    $approverPem = Read-Utf8 (Key-File "${ApproverId}__${ApproverKeyId}.private.pem")
    $null = $keys | ConvertFrom-Json
    $null = $material | ConvertFrom-Json

    Say "Paste the TRANSACTION pooler string of the sandbox project (port 6543), never production's."
    $databaseUrl = Read-Secret "Sandbox DATABASE_URL, transaction pooler"
    $null = Get-StateValue "sandboxProjectRef" "Migrate"
    $ref = Assert-SandboxDatabase $databaseUrl "6543"
    Say "Sandbox database: project $ref" Green

    Confirm-Word "SET" "set 12 variables on $Project"
    Set-VercelEnv "NODE_ENV" "production"
    Set-VercelEnv "PARMANA_POLICY_DIR" "./policies"
    Set-VercelEnv "PARMANA_STORAGE" "supabase"
    Set-VercelEnv "DATABASE_URL" $databaseUrl
    Set-VercelEnv "PARMANA_KEY_DIR" "/tmp/parmana-keys"
    Set-VercelEnv "PARMANA_KEY_MATERIAL_JSON" $material
    Set-VercelEnv "PARMANA_API_KEYS" $keys
    Set-VercelEnv "PARMANA_SANDBOX" "true"
    Set-VercelEnv "PARMANA_SANDBOX_APPROVER_ID" $ApproverId
    Set-VercelEnv "PARMANA_SANDBOX_APPROVER_KEY_ID" $ApproverKeyId
    Set-VercelEnv "PARMANA_SANDBOX_APPROVER_PRIVATE_KEY" $approverPem
    Set-VercelEnv "PARMANA_CORS_ORIGINS" $CorsOrigins
    Remove-Variable databaseUrl, keys, material, approverPem
    Say "All 12 set. Next: -Stage Deploy." Green
  }

  "Deploy" {
    Step "Redeploy $Project with its variables"
    $lines = Invoke-Native { vercel ls $Project --scope $Scope --cwd $VercelLink 2>$null }
    $latest = ($lines | Where-Object { $_ -match "^https://" } | Select-Object -First 1)
    if (-not $latest) { Stop-Run "No deployment of $Project found. In the Vercel dashboard: $Project, Deployments, Create Deployment, branch main. Then run this stage again (README step 3)." }
    Confirm-Word "DEPLOY" "redeploy $($latest.Trim()) to production"
    Invoke-Native { vercel redeploy $latest.Trim() --target production --scope $Scope --cwd $VercelLink }
    if ($LASTEXITCODE -ne 0) { Stop-Run "The redeploy failed. Read the build log: vercel inspect --logs <url>." }

    Step "Is it ready?"
    $ready = Invoke-RestMethod "$ApiUrl/ready"
    Say "GET /ready: $($ready.status), authDisabled $($ready.authDisabled)"
    if ($ready.status -ne "READY" -or $ready.authDisabled -ne $false) { Stop-Run "Not ready, or authentication is off. Stop." }
    $key = Invoke-RestMethod "$ApiUrl/keys/default"
    Say "GET /keys/default: $($key.keyId), $($key.algorithm)" Green
    Say "Next: -Stage Endpoint."
  }

  "Endpoint" {
    Step "Build and deploy the receipt endpoint for $EndpointUrl"
    Invoke-Native { npm run --silent build 2>&1 | Out-Null }
    Invoke-Native {
      npx tsx examples/live-checks/external-connector/build-endpoint.ts --parmana-url $ApiUrl `
        --endpoint-url $EndpointUrl --out $EndpointFolder
    }
    if ($LASTEXITCODE -ne 0) { Stop-Run "Building the endpoint failed." }
    Confirm-Word "DEPLOY" "deploy $EndpointFolder to Vercel"
    # From inside the folder: with --cwd, Vercel CLI 61 read this repository's vercel.json instead.
    Push-Location $EndpointFolder
    try { Invoke-Native { vercel deploy --prod --yes --scope $Scope } } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { Stop-Run "Deploying the endpoint failed." }

    try {
      $probe = Invoke-WebRequest -Method Post -Uri $EndpointUrl -Body "{}" -ContentType "application/json" -UseBasicParsing
      Stop-Run "The endpoint answered $($probe.StatusCode) to an unsigned body. It must answer 401."
    } catch {
      $status = $_.Exception.Response.StatusCode.value__
      if ($status -ne 401) { Stop-Run "The endpoint answered HTTP $status at $EndpointUrl; expected 401. If Vercel gave it another address, pass -EndpointUrl with it and run this stage again." }
    }
    Say "The endpoint refuses an unsigned body with 401, as required. Next: -Stage ProposeApprover." Green
  }

  "ProposeApprover" {
    Step "Propose the demo approver's key (maker)"
    $body = @{
      action       = "add"
      approverId   = $ApproverId
      keyId        = $ApproverKeyId
      publicKeyPem = Read-Utf8 (Key-File "${ApproverId}__${ApproverKeyId}.public.pem")
      reason       = "ADR-0014: the public sandbox's demo approver, behind POST /sandbox/approvals."
    } | ConvertTo-Json
    $result = Invoke-Api POST "/approval-issuers/changes" (Key-Value "sandbox-maker.key") $body
    Save-State "approverChangeId" $result.changeId
    Say "Proposed: $($result.changeId), $($result.status)" Green
  }

  "ApproveApprover" {
    $id = Get-StateValue "approverChangeId" "ProposeApprover"
    Approve-Change "/approval-issuers/changes" "changeId" "/approval-issuers/changes/{0}/approve" $id
  }

  "ProposePolicy" {
    Step "Propose $PolicyName $PolicyVersion (maker)"
    $policy = Read-Utf8 "$Here\policy.json"
    $body = '{"reason":"ADR-0014: the public sandbox policy.","proposedContent":' + $policy + '}'
    $result = Invoke-Api POST "/policies/$PolicyName/$PolicyVersion/pending-changes" (Key-Value "sandbox-maker.key") $body
    Save-State "policyChangeId" $result.pendingPolicyChangeId
    Say "Proposed: $($result.pendingPolicyChangeId), $($result.status)" Green
  }

  "ApprovePolicy" {
    $id = Get-StateValue "policyChangeId" "ProposePolicy"
    Approve-Change "/policies/pending-changes" "pendingPolicyChangeId" "/policies/pending-changes/{0}/approve" $id
  }

  "ProposeRegistration" {
    Step "Propose $Capability -> $EndpointUrl (maker)"
    $body = @{
      action            = "register"
      capability        = $Capability
      endpointUrl       = $EndpointUrl
      policy            = $PolicyName
      allowedParameters = @("note")
      timeoutMs         = 10000
      reason            = "ADR-0014: the sandbox receipt endpoint. It acts on nothing and answers with a receipt."
    } | ConvertTo-Json
    $result = Invoke-Api POST "/external-connectors/changes" (Key-Value "sandbox-maker.key") $body
    Save-State "registrationChangeId" $result.changeId
    Say "Proposed: $($result.changeId), $($result.status), stored as $($result.endpointUrl)" Green
    if ($result.endpointUrl -ne $EndpointUrl) {
      Say "The stored URL differs from the endpoint's audience. Rebuild the endpoint with the stored URL (-Stage Endpoint -EndpointUrl ...)." Yellow
    }
  }

  "ApproveRegistration" {
    $id = Get-StateValue "registrationChangeId" "ProposeRegistration"
    Approve-Change "/external-connectors/changes" "changeId" "/external-connectors/changes/{0}/approve" $id
  }

  "Check" {
    Step "The live check, with the published demo key only"
    Invoke-Native { npm run --silent build 2>&1 | Out-Null }
    $env:PARMANA_URL = $ApiUrl
    $env:PARMANA_API_KEY = Key-Value "sandbox-visitor.key"
    $record = Join-Path $Here "evidence\check-record.json"
    Invoke-Native { npx tsx deploy/sandbox/check.ts --out $record }
    $exit = $LASTEXITCODE
    Remove-Item Env:\PARMANA_API_KEY
    if ($exit -ne 0) { Stop-Run "The check did not pass. Read the lines above, and README.md, When it fails." }
    Say "Passed. $record holds no secret; it is the evidence for docs/CLAIMS.md." Green
  }
}
