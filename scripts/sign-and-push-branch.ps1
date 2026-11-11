# Publish a branch as one signed commit on top of the current main.
#
# Use this for every change that goes through a pull request. Commits made
# through the GitHub API are not signed, so the verified-commits check fails.
# This script squashes the branch's own commits into one commit, signs it on
# this machine, rebases it onto the current main, and pushes it with
# --force-with-lease.
#
# It squashes the branch's own changes only (commits since the merge base) and
# then replays them on the current main. It never copies a whole tree over
# main, so files merged to main since the branch was made are not reverted.
#
# If the rebase reports a conflict, the script stops and leaves the repository
# mid-rebase. Resolve the conflict, run git rebase --continue, then push with
# git push --force-with-lease origin HEAD:<branch>.
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
Invoke-Git checkout -B $work "origin/$Branch"

$base = (& git merge-base origin/main HEAD)
if ($LASTEXITCODE -ne 0 -or -not $base) {
    throw "Could not find the merge base of $Branch and main."
}

# Keep the branch's changes staged, drop its commits, and sign one commit.
Invoke-Git reset --soft $base

$staged = & git diff --cached --name-only
if (-not $staged) {
    Write-Host "No changes relative to the merge base. Nothing to publish."
    Invoke-Git checkout -q -
    exit 0
}

Invoke-Git commit -S -s -m $Message

# Replay the one signed commit on the current main.
Invoke-Git rebase origin/main

Invoke-Git push --force-with-lease "origin" "${work}:$Branch"

Write-Host "Published $Branch as one signed commit on the current main. Check verified-commits on the pull request."
