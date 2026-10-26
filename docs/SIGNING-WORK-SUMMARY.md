# Signed commits: what we did, why, and what it gives us

## Why

Commits from the maintainer's Windows machine were not signed. GitHub therefore could not show them as **Verified**, and a reviewer had no way to tell from the commit alone that it came from the maintainer's key. The first commit that needed signing was `docs/claims-checks` at `2027647`.

## What we did

1. Confirmed GnuPG was missing on the machine, then installed Gpg4win.
2. Generated an RSA 4096 key for `Pavan Dev Singh Charak <charak1987@gmail.com>`. The public key is on the GitHub account. The secret key and its passphrase stay on the machine and in the password manager.
3. Pointed Git at the Gpg4win binary. Git for Windows bundles its own `gpg`, which has a separate home directory and does not see the key, so signing failed with `No secret key` until this was set.
4. Turned signing on globally with `commit.gpgsign`.
5. Re-signed `docs/claims-checks`. The commit is now `4a38921`, and GitHub shows it as **Verified**.
6. Wrote `docs/runbooks/SIGNING-COMMITS.md`, which covers setup, the failures we hit, checking signatures, routine use, and key renewal and revocation. Added it to the runbook index.
7. Added `*.asc`, `*.gpg`, `*.rev` and `gpg-revocation*` to `.gitignore`, so key exports and revocation certificates cannot be committed by accident.
8. Opened PR #151 with those two changes. Its commits were first authored under an assistant identity, which failed the DCO check, so they were re-authored with the maintainer's name and email and a matching `Signed-off-by` line. They were then re-signed. PR #151 is merged.

## What it gives us

- Commits from this machine show as **Verified** on GitHub. A reviewer can see they came from the maintainer's key.
- New commits are signed by default. The `commit.gpgsign` setting makes this the default.
- The runbook records the setup, the Windows-specific failures, and the fixes. The next setup, or a key rotation, should not need the same trial and error.
- The `.gitignore` rules make it harder to commit key material by accident.

## Problems we hit, and the fixes

- **`No secret key` although the key exists.** Git was calling its bundled `gpg`. Setting `gpg.program` to the Gpg4win binary fixed it.
- **Pre-commit preflight blocked amends.** Causes were stale `dist/` output and Postgres not running on `127.0.0.1:55432`. Rebuilding the workspace and starting the database fixed them.
- **DCO check failed on PR #151.** Commits were authored under an assistant identity. Re-authoring them with the maintainer's name and email and a matching sign-off fixed it.

## Open items

- The `docs/signing-runbook` branch still exists on `origin` and in the local clone. It can be deleted, since PR #151 is merged.
- Key expiry: check it with `gpg --list-keys EA52495306CAD70F`. An expired key makes new commits show as unverified.
- Keep a revocation certificate in the password manager. The runbook explains how to generate one.
