# Signing commits on Windows (GPG)

Commits from the maintainer's Windows machine are signed with a GPG key, so GitHub shows them as **Verified**. This runbook covers the one-time setup, the Windows-specific problems we hit, how to check a signature, and how to renew or replace the key.

## Current state

- Identity: `Pavan Dev Singh Charak <charak1987@gmail.com>`
- Key ID: `EA52495306CAD70F`
- Fingerprint: `167D31744CE05C3517DD1D86EA52495306CAD70F`
- Type: RSA 4096. The primary key is certify and sign. The encryption subkey is `2FC37694484DBE74`.
- Proof: commit `4a38921` on `docs/claims-checks` shows **Verified** on GitHub.

Only the public key is ever shared. The secret key stays in the GnuPG home directory, and the passphrase stays in the password manager.

## One-time setup

1. Install Gpg4win from https://gpg4win.org and accept the defaults. Close and reopen PowerShell afterwards.
2. Confirm the install: `gpg --version`.
3. Generate the key: `gpg --full-generate-key`. Choose `RSA and RSA` (option 1), size `4096`, the expiry you want, the name and email above. Type the passphrase into the dialog and store it in the password manager.
4. Get the key ID: `gpg --list-secret-keys --keyid-format=long`. Use the ID after `sec   rsa4096/`, which is the primary key, not the `ssb` subkey.
5. Add the public key to GitHub. Run `gpg --armor --export EA52495306CAD70F`, then paste the whole block, from `-----BEGIN PGP PUBLIC KEY BLOCK-----` to `-----END PGP PUBLIC KEY BLOCK-----`, at https://github.com/settings/gpg/new. Never export the secret key.
6. Point Git at the Gpg4win binary and turn signing on:

   ```powershell
   git config --global gpg.program "C:\Program Files\GnuPG\bin\gpg.exe"
   git config --global user.signingkey EA52495306CAD70F
   git config --global commit.gpgsign true
   ```

7. Check that the key signs:

   ```powershell
   echo "test" | gpg --clearsign --local-user EA52495306CAD70F
   ```

   This asks for the passphrase and prints a signed block.

## Problems we hit

- **`gpg: skipped "...": No secret key`, but `gpg --list-secret-keys` lists the key.** Git is running a different `gpg`. Git for Windows bundles its own copy, which has a separate home directory and no secret keys. Check which binary Git uses with `git config --global --get gpg.program`, and set it to the Gpg4win path above.
- **`gpg: directory '...\.gnupg' created`** during signing. The same cause: Git's `gpg` started with an empty home directory.
- **`error: gpg.ssh.allowedSignersFile needs to be configured`** from `git log --show-signature`. Something sets `gpg.format` to `ssh`. Find it with `git config --show-origin --get-all gpg.format` and remove it with `git config --global --unset gpg.format` if it is not intended.
- **`The term 'gpg' is not recognized`** right after installing. PowerShell did not pick up the new PATH. Close the terminal and open a new one.
- **`Invalid selection`** when generating the key. The prompt wants the number of the option, not its name. Type `1`, not `RSA and RSA`.
- **`fatal: failed to write commit object`** after a failed sign. The commit was not written. Fix the signing problem, then run the amend again. Nothing on the remote changed.

## Verifying

- Locally: `git log -1 --show-signature` should print `Good signature from "Pavan Dev Singh Charak <charak1987@gmail.com>"`.
- On GitHub: the commit page shows **Verified**. If it shows **Unverified**, the public key is not on the account, or its email does not match a verified email on the account.

## Routine

- Commits from this machine are signed by default because of `commit.gpgsign`. Skip signing for one commit only with `--no-gpg-sign`, and only with a reason.
- Amending or rebasing a pushed commit rewrites its SHA. Push with `--force-with-lease=<branch>:<expected-sha>`, so the push fails if someone else pushed in the meantime. Never use `--force` alone.
- The pre-commit hook runs the full preflight, including the test suite, and needs the local Postgres on `127.0.0.1:55432`. Start it with `docker compose up -d postgres` and `docker compose run --rm migrate` before amending.
- Rebuild before amending if the hook reports stale `dist/` output: `npm run build`.

## Key lifecycle

- Check the expiry with `gpg --list-keys EA52495306CAD70F`. Extend the expiry or make a new key before it lapses. An expired key makes new commits show as unverified.
- If the key or its passphrase may be exposed, revoke the key on GitHub at https://github.com/settings/keys, generate a new key, add its public part to GitHub, and update `git config --global user.signingkey`. Follow `KEY-ROTATION.md` for anything the rotation touches beyond Git.
- Keep a revocation certificate. Generate it when the key is created with `gpg --gen-revoke EA52495306CAD70F`, and store it in the password manager, not in the repo.
