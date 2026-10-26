<#
Sets up the Razorpay refund agent end to end, without copy-paste.

Run from the parmana-core checkout:
  powershell -ExecutionPolicy Bypass -File examples\razorpay-agent-studio\setup-windows.ps1

It does the system steps only:
  1. Checks the key entries that must survive the update are present.
  2. Creates the agent key (razorpay-demo-agent) and the Agent Studio token.
  3. Stores both encrypted for your Windows user (DPAPI). Nothing is printed.
  4. Sets AGENT_STUDIO_TOKEN, PARMANA_URL and PARMANA_API_KEY in Vercel.
  5. Rebuilds the MCP bundle and deploys it.
  6. Replaces Parmana's live key list from the entries folder, once it has
     checked that every required entry is in it.
  7. Redeploys parmana-api-real and runs the checks.

It does NOT create maker or checker keys, and it does NOT approve the
policy, connector or grant. Those stay manual (README steps 2, 3 and 5).
#>

$ErrorActionPreference = "Stop"

$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Bundle = Join-Path (Split-Path $Repo -Parent) "parmana-agent-studio-mcp"
$Link = Join-Path $env:USERPROFILE "parmana-vercel-link"
$Entries = Join-Path $env:USERPROFILE "parmana-entries"
$Secrets = Join-Path $env:USERPROFILE "parmana-secrets"
$ParmanaUrl = "https://parmana-api-real.vercel.app"
$McpUrl = "https://parmana-agent-studio-mcp.vercel.app"
$AgentId = "razorpay-demo-agent"
$Required = @("maker-pavan", "checker-pavan", "paytm-refund-agent", $AgentId)

function Save-Secret([string]$Name, [string]$Value) {
  New-Item -ItemType Directory -Force $Secrets | Out-Null
  ConvertTo-SecureString $Value -AsPlainText -Force |
    ConvertFrom-SecureString |
    Set-Content (Join-Path $Secrets "$Name.dpapi") -Encoding ascii
}

function Read-Secret([string]$Name) {
  $secure = Get-Content (Join-Path $Secrets "$Name.dpapi") | ConvertTo-SecureString
  [System.Net.NetworkCredential]::new("", $secure).Password
}

function Set-VercelSecret([string]$Name, [string]$Value) {
  cmd /c "npx vercel env rm $Name production --yes >nul 2>&1"
  $Value | & npx vercel env add $Name production --sensitive
  if ($LASTEXITCODE -ne 0) { throw "Could not add $Name to Vercel." }
}

# 1. Preflight: stop before anything changes if a required piece is missing.
foreach ($id in $Required) {
  if (-not (Test-Path (Join-Path $Entries "$id.json"))) {
    throw "Missing $id.json in $Entries. Stopping: the key list would lose it."
  }
}
if (-not (Test-Path $Link)) { throw "Missing $Link (linked to parmana-api-real)." }
if (-not (Test-Path $Bundle)) { throw "Missing $Bundle (the MCP bundle folder)." }

Set-Location $Repo
if (-not (Test-Path "typescript\dist")) {
  npm ci --ignore-scripts
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build failed." }
}

# 2 and 3. Agent key and Agent Studio token, stored encrypted.
$out = npx tsx scripts/generate-api-key.ts --caller-id $AgentId --allowed-capabilities "razorpay:refund"
if ($LASTEXITCODE -ne 0) { throw "Key generation failed." }
$entryLine = $out | Where-Object { $_.StartsWith('{"callerId"') }
$agentKey = (($out | Where-Object { $_ -match '^Key\s+:' }) -replace '^Key\s+:\s*', '').Trim()
if (-not $entryLine -or $agentKey.Length -ne 43) {
  throw "Key generation did not give an entry and a 43-character key."
}
$entryLine | Set-Content (Join-Path $Entries "$AgentId.json") -Encoding ascii
Save-Secret "razorpay-demo-agent.key" $agentKey

$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$mcpToken = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
Save-Secret "agent-studio-token" $mcpToken
Remove-Variable out, entryLine

# 4. Vercel secrets for the MCP project.
Set-Location $Bundle
Set-VercelSecret "AGENT_STUDIO_TOKEN" $mcpToken
Set-VercelSecret "PARMANA_URL" $ParmanaUrl
Set-VercelSecret "PARMANA_API_KEY" $agentKey
Remove-Variable agentKey, mcpToken

# 5. Rebuild the bundle, add the vercel.json and public/ fixes, deploy.
Set-Location $Repo
npx tsx examples/razorpay-agent-studio/build-mcp.ts --out $Bundle
if ($LASTEXITCODE -ne 0) { throw "Bundle build failed." }

@'
{
  "buildCommand": "echo prebuilt",
  "installCommand": "echo no install",
  "functions": { "api/mcp.mjs": { "maxDuration": 60 } }
}
'@ | Set-Content (Join-Path $Bundle "vercel.json") -Encoding ascii
New-Item -ItemType Directory -Force (Join-Path $Bundle "public") | Out-Null
Set-Content (Join-Path $Bundle "public\index.html") "Parmana Agent Studio MCP" -Encoding ascii
Remove-Item (Join-Path $Bundle ".env.local") -ErrorAction SilentlyContinue

Set-Location $Bundle
npx vercel deploy --prod --yes
if ($LASTEXITCODE -ne 0) { throw "MCP deploy failed." }

# 6. Replace Parmana's key list, after checking the entries.
$entries = @(Get-ChildItem (Join-Path $Entries "*.json") | ForEach-Object {
  Get-Content $_.FullName -Raw | ConvertFrom-Json
})
foreach ($id in $Required) {
  if ($entries.callerId -notcontains $id) { throw "$id is missing from the entries after the update." }
}
$entries | ForEach-Object {
  "{0}  capabilities={1}" -f $_.callerId, ($_.allowedCapabilities -join ",")
}
$value = ConvertTo-Json -InputObject $entries -Depth 5 -Compress
cmd /c "npx vercel env rm PARMANA_API_KEYS production --yes --cwd `"$Link`" >nul 2>&1"
# Write the value to a file and redirect it. Piping into the CLI from
# PowerShell stored an invalid value during setup, and Parmana then refused
# every key. The file holds hashes only, and it is deleted afterwards.
$valueFile = Join-Path $env:TEMP "parmana-api-keys.json"
Set-Content -Path $valueFile -Value $value -NoNewline -Encoding ascii
try {
  cmd /c "npx vercel env add PARMANA_API_KEYS production --sensitive --cwd `"$Link`" < `"$valueFile`""
  if ($LASTEXITCODE -ne 0) { throw "Could not set PARMANA_API_KEYS. Parmana may reject all keys: fix this first." }
} finally {
  Remove-Item $valueFile -Force -ErrorAction SilentlyContinue
}

# 7. Redeploy the newest production deployment of parmana-api-real, then check.
Set-Location $Link
$row = npx vercel ls parmana-api-real | Where-Object { $_ -match 'https://\S+' -and $_ -match 'Production' } | Select-Object -First 1
$url = [regex]::Match($row, 'https://\S+').Value
if (-not $url) { throw "Could not find the newest production deployment of parmana-api-real." }
npx vercel redeploy $url --target production
if ($LASTEXITCODE -ne 0) { throw "Parmana redeploy failed." }

$mcpToken = Read-Secret "agent-studio-token"
$agentKey = Read-Secret "razorpay-demo-agent.key"
$listBody = Join-Path $env:TEMP "mcp-tools-list.json"
'{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | Set-Content $listBody -Encoding ascii

$noToken = & curl.exe -s -o NUL -w "%{http_code}" -X POST "$McpUrl/api/mcp" -H "Content-Type: application/json" -d "{}"
$withToken = & curl.exe -s -o NUL -w "%{http_code}" -X POST "$McpUrl/api/mcp" -H "Authorization: Bearer $mcpToken" -H "Content-Type: application/json" --data-binary "@$listBody"
$agentCheck = & curl.exe -s -o NUL -w "%{http_code}" "$ParmanaUrl/callers/me" -H "Authorization: Bearer $agentKey"
Remove-Item $listBody -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "MCP without token  : $noToken   (expect 401)"
Write-Host "MCP with token     : $withToken (expect 200)"
Write-Host "Agent key on Parmana: $agentCheck (expect 200)"
Write-Host ""
Write-Host "Next (manual): README steps 2, 3 and 5, with the maker and checker keys."