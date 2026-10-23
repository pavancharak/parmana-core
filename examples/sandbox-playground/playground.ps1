$Url = "https://parmana-sandbox.vercel.app"
$env:PARMANA_API_KEY = "SANDBOX_DEMO_KEY"   # the published sandbox demo key
$Headers = @{ Authorization = "Bearer $env:PARMANA_API_KEY" }

# 1. Who am I?
Invoke-RestMethod "$Url/callers/me" -Headers $Headers | ConvertTo-Json -Compress

# 2. What must a request carry?
Invoke-RestMethod "$Url/policies/in-effect?capability=sandbox:receipt" -Headers $Headers | ConvertTo-Json -Depth 5 -Compress

# 3. Send a request with no approval: refused.
$Target = "order-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
function Send-Receipt([string]$Note, [hashtable]$Signals) {
  $id = [guid]::NewGuid().ToString()
  $now = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
  $body = @{
    businessTransactionId = $id
    metadata      = @{ businessTransactionId = $id }
    authority     = @{ authorityId = "authority-1"; authorityType = "SERVICE"; principalId = "sandbox-visitor"; issuedAt = $now }
    authorization = @{ authorizationId = "authorization-1"; authorityId = "authority-1"; purpose = "Trying the Parmana sandbox"; issuedAt = $now }
    intent        = @{ intentId = "intent-1"; authorizationId = "authorization-1"; action = "sandbox:receipt"; target = $Target; parameters = @{ note = $Note }; createdAt = $now }
    policy        = @{ name = "sandbox-receipt"; version = "1.0.0"; schemaVersion = "1.0.0" }
    signals       = @{ note = $Note } + $Signals
  } | ConvertTo-Json -Depth 10
  try {
    Invoke-RestMethod -Method Post "$Url/execute" -Headers $Headers -ContentType "application/json" -Body $body -TimeoutSec 120
  } catch {
    $_.ErrorDetails.Message
  }
}
Send-Receipt "hello" @{ receiptApproved = $false }

# 4. Get a demo approval for this target.
$Approval = Invoke-RestMethod -Method Post "$Url/sandbox/approvals" -Headers $Headers -ContentType "application/json" `
  -Body (@{ capability = "sandbox:receipt"; resourceId = $Target } | ConvertTo-Json)
$Approval | ConvertTo-Json -Depth 5 -Compress

# 5. Send it again with the approval: approved, released, signed.
$Record = Send-Receipt "hello" @{ receiptApproved = $true; approvalArtifact = $Approval }
$Record.executions[0].decision.outcome
$Record.executions[0].evidence.attributes.connector.responseSummary.metadata.result.receiptId

# 6. The same approval again: refused.
Send-Receipt "again" @{ receiptApproved = $true; approvalArtifact = $Approval }
