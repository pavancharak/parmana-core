# Publish a branch as one signed commit on top of main.
#
# Use this for every change that goes through a pull request. Commits made
# through the GitHub API are not signed, so the verified-commits check fails.
# This script squashes the branch's content into one commit that is signed on
# this machine, then pushes it with --force-with-lease.
#
# Usage, from the repository root:
#   .\scripts\sign-and-push-branch.ps1 -Branch docs/some-branch -Message "docs: what changed"
#
# The commit runs the pre-commit hook (secret scan, lint, typecheck). The push
# runs the pre-push hook (database check and the full preflight), which takes
# several minutes. Keep Docker Desktop running for the database check.

param(
    [Parameter(Mandatory = $true)][string]$Branch,
    [Parameter(Mandatory = $true)][string]$Message
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
    & git @args
    if ($LASTEXITCODE -ne 0) {
        throw "git $($args -join ' ') failed with exit code $LASTEXITCODE"
    }
}

if ($Branch -eq "main") {
    throw "Refusing to publish to main. Give the name of a feature branch."
}

$work = "signed-" + [guid]::NewGuid().ToString("N").Substring(0, 8)

Invoke-Git fetch origin main
Invoke-Git fetch origin $Branch
Invoke-Git checkout -B $work origin/main
Invoke-Git checkout "origin/$Branch" -- .
Invoke-Git add -A

$staged = & git diff --cached --name-only
if (-not $staged) {
    Write-Host "No changes relative to main. Nothing to publish."
    Invoke-Git checkout -q -
    exit 0
}

Invoke-Git commit -S -s -m $Message
Invoke-Git push --force-with-lease origin "${work}:$Branch"

Write-Host "Published $Branch as one signed commit. Check verified-commits on the pull request."
