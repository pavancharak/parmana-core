# Creates the Parmana signing key for one environment, using the AWS CLI.
# Run once per environment. It does NOT create an alias: Terraform does that.
#
# Usage:
#   .\create-signing-key.ps1 -Environment prod
param(
    [Parameter(Mandatory = $true)][string]$Environment,
    [string]$Region = "ap-south-1"
)

$ErrorActionPreference = "Stop"

Write-Host "Creating ED25519 signing key for environment '$Environment' in $Region"

$keyArn = aws kms create-key `
    --region $Region `
    --key-spec ECC_NIST_EDWARDS25519 `
    --key-usage SIGN_VERIFY `
    --description "Parmana $Environment signing key (ED25519)" `
    --tags "TagKey=purpose,TagValue=parmana-$Environment" "TagKey=environment,TagValue=$Environment" "TagKey=managed_by,TagValue=script" `
    --query "KeyMetadata.Arn" --output text

if ($LASTEXITCODE -ne 0) { throw "create-key failed" }

Write-Host ""
Write-Host "Key created:"
Write-Host $keyArn
Write-Host ""
Write-Host "Put this in prod.tfvars as signing_key_arn, then run terraform plan."