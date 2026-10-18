# Writes the sandbox demo key into the docs, in place of the placeholder
# SANDBOX_DEMO_KEY (ADR-0014 section 4: the demo key is published on purpose).
#
#   powershell -ExecutionPolicy Bypass -File D:\last\parmana\deploy\sandbox\publish-demo-key.ps1
#
# Before it writes anything it asks the live sandbox who the key is, and stops
# unless the answer is caller sandbox-visitor, allowed only sandbox:receipt, so
# a maker, checker or production key can never be published by mistake. It
# never prints the key. It also adds the key to the .gitleaks.toml allowlist,
# with the reason, as for the local demo key.

param(
  [string]$KeyFile = "D:\key\parmana-sandbox\sandbox-visitor.key",
  [string]$ApiUrl = "https://parmana-sandbox.vercel.app",
  [string]$Repo = "D:\last\parmana"
)

$ErrorActionPreference = "Stop"
$Placeholder = "SANDBOX_DEMO_KEY"
$Utf8 = New-Object System.Text.UTF8Encoding $false

function Stop-Run([string]$message) {
  Write-Host $message -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $KeyFile)) { Stop-Run "No key file at $KeyFile. Nothing was changed." }
$key = ([System.IO.File]::ReadAllText($KeyFile)).Trim()
if ($key -eq "" -or $key -match "\s") { Stop-Run "The key file is empty or holds more than one value. Nothing was changed." }

try {
  $me = Invoke-RestMethod "$ApiUrl/callers/me" -Headers @{ Authorization = "Bearer $key" }
} catch {
  Stop-Run "The sandbox refused that key ($($_.Exception.Message)). Nothing was changed."
}
$allowed = @($me.allowedCapabilities)
if ($me.callerId -ne "sandbox-visitor" -or $me.unrestrictedCapabilities -ne $false -or
    $allowed.Count -ne 1 -or $allowed[0] -ne "sandbox:receipt") {
  Stop-Run "That key is $($me.callerId) on $ApiUrl, not the sandbox demo key. Nothing was changed."
}
Write-Host "The sandbox says this key is sandbox-visitor, allowed only sandbox:receipt."

Push-Location $Repo
try {
  $self = "deploy/sandbox/publish-demo-key.ps1"
  $files = @(git grep -l $Placeholder | Where-Object { $_ -ne $self })
  if ($files.Count -eq 0) { Stop-Run "No file holds $Placeholder. Nothing was changed." }

  foreach ($file in $files) {
    $text = [System.IO.File]::ReadAllText((Join-Path $Repo $file), $Utf8)
    [System.IO.File]::WriteAllText((Join-Path $Repo $file), $text.Replace($Placeholder, $key), $Utf8)
    Write-Host "  wrote the key into $file"
  }

  $config = Join-Path $Repo ".gitleaks.toml"
  $toml = [System.IO.File]::ReadAllText($config, $Utf8)
  if (-not $toml.Contains($key)) {
    $anchor = "  # Fake mock-connector credential in tutorial 57"
    if (-not $toml.Contains($anchor)) { Stop-Run "Could not find where to add the allowlist entry in .gitleaks.toml. Add it by hand." }
    $entry = "  # The public sandbox's demo key (ADR-0014 section 4), published on purpose in the`n" +
             "  # docs and the OpenAPI x-default. Caller sandbox-visitor, allowed only sandbox:receipt,`n" +
             "  # an action that acts on nothing, on https://parmana-sandbox.vercel.app only.`n" +
             "  # Production refuses it with 401. Written by deploy/sandbox/publish-demo-key.ps1.`n" +
             "  '''$([regex]::Escape($key))''',`n`n"
    [System.IO.File]::WriteAllText($config, $toml.Replace($anchor, $entry + $anchor), $Utf8)
    Write-Host "  added the key to the .gitleaks.toml allowlist"
  }
} finally {
  Pop-Location
}

Write-Host "Done: $($files.Count) files. The key was not printed. Next: commit and push the branch." -ForegroundColor Green
