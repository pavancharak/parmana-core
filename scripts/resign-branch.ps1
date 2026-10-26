# Re-signs every commit on the current branch that is not on origin/main,
# then force-pushes the branch with a lease on the remote tip it started from.
#
# For your own unmerged feature branches only. Refuses to run on main or on a
# detached HEAD. Each re-signed commit runs the pre-commit preflight, so a
# multi-commit branch takes several minutes.
#
# Usage (from the repo root, on the branch to sign):
#   .\scripts\resign-branch.ps1

$ErrorActionPreference = "Stop"

$branch = git branch --show-current
if (-not $branch) {
    Write-Error "HEAD is detached. Check out the branch you want to re-sign first."
    exit 1
}
if ($branch -eq "main") {
    Write-Error "Refusing to rewrite main. Check out your feature branch first."
    exit 1
}

git fetch origin
if ($LASTEXITCODE -ne 0) { exit 1 }

$remote = git rev-parse "origin/$branch" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "origin/$branch does not exist. Push the branch first."
    exit 1
}

git rebase origin/main --exec "git commit --amend --no-edit -S"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Rebase stopped. Fix the problem, then run: git rebase --continue (or git rebase --abort)."
    exit 1
}

git push --force-with-lease="${branch}:$remote" origin $branch
if ($LASTEXITCODE -ne 0) { exit 1 }

git log --format="%h %G? %an <%ae> %s" origin/main..HEAD
