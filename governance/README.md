# Policy approval log

`policy-approvals.jsonl` is a public, append only record of every policy change approved
through Parmana's maker checker process (CLAIMS.md 2.26, 2.34). Anyone can check it without the
server or the database.

## What one line holds

Each line is one approval, exactly as the production server stored and signed it, inside a
hash chain:

```json
{
  "seq": 1,
  "prevEntryHash": null,
  "record": {
    "policyName": "customer-refund",
    "policyVersion": "1.2.0",
    "proposedBy": "...",
    "approvedBy": "...",
    "contentHashAfter": "...",
    "signature": { "algorithm": "ed25519", "keyId": "default", "value": "..." },
    "...": "..."
  },
  "entryHash": "..."
}
```

- `record` is the `PolicyChangeApprovalRecord`: which policy and version, who proposed it, who
  approved it, when, and the SHA-256 of the approved policy content. It is signed by the server's
  `default` key, over the same canonical JSON the server uses.
- `entryHash` is the SHA-256 of the canonical JSON of `{ seq, prevEntryHash, record }`.
- `prevEntryHash` is the previous line's `entryHash`, and `null` on the first line.

`policy-approval-keys.json` holds the public keys the records are signed with, by `keyId`.

## What it proves

- **No approval was quietly rewritten or removed.** Changing, deleting or reordering a line
  breaks the chain from that line on. CI refuses any change to this file that does not only
  append to it.
- **Each approval was signed by the server.** A record cannot be added or edited without the
  signing key.
- **The policies in this repository are the approved ones.** Each
  `policies/{name}/{version}/policy.json` can be matched to the content hash of its latest
  logged approval.
- **The database still agrees with what was published.** `check-db` fails if a logged record
  later changed or disappeared in the database.

## What it does not prove

- That the maker and the checker are two people. It records two credentials. In the current
  production deployment one person holds both (see [THREAT-MODEL.md](../THREAT-MODEL.md), T11).
- That an approved policy is a good one.
- Anything against someone holding the signing key and write access to both the database and
  this repository's main branch. The log raises the cost: a rewrite has to change history that
  has already been published and copied.

The records name the maker and the checker by their caller IDs. Publishing the log makes those
IDs public; they cannot be removed without breaking the signatures.

## Check it

Anyone can run this. It needs no credentials and no network beyond `npm ci`. Run each command
on its own line; Windows PowerShell 5.1 does not accept `&&`.

```bash
npm ci
npm run build
npm run policy-log:verify
```

It prints the number of approvals in the log, then lists any problem under **Chain**,
**Signatures** or **Append only**, and ends with one of:

- `The log verifies: the chain is intact and every signature checks out.` Exit code 0.
- `N problem(s).` Exit code 1.

Policy files whose content is not their latest logged approval are listed under **Policy files**.
They fail the check only with `-- --require-coverage`, which the pull request gate uses (`ci.yml`,
job `verify-policy-approvals`). Add `-- --base <commit>` to also check that the log only grew since
that commit.

## Update it (maintainers)

Run this after every policy change approved in production. It appends the approvals the log does
not hold yet. It reads the production database through the read only role described below, so it
changes nothing there. The export writes only to `governance/policy-approvals.jsonl` and
`governance/policy-approval-keys.json`.

Commit the two files through a pull request. Do not edit them by hand.

### What you need

| What                                                                     | Where to find it                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A clone of the repository on an up to date `main`, Node.js 24.6 or later | `git checkout main`, then `git pull`                                                                                                                                                                                                                  |
| `CI_DATABASE_URL`                                                        | A PostgreSQL connection string for the read only role `parmana_ci_reader`, which has `SELECT` on `policy_change_approval_records` and nothing else. Ask the operator for it. Do not use the application's `DATABASE_URL`, which can change any table. |

The string is a secret. Keep it out of the repository, out of commit messages, and out of chat. The
drift check (`.github/workflows/policy-log-drift.yml`) reads the same value from the `CI_DATABASE_URL`
repository secret.

### Steps on Windows (PowerShell)

Run each line on its own, from the repository folder:

```powershell
git checkout main
git pull
git checkout -b policy-log-update
npm ci
npm run build
$env:CI_DATABASE_URL = '<read-only connection string>'
npm run policy-log:export
```

The `$env:` value lasts only for this PowerShell window. Nothing is saved to disk.

To export one policy only, add `-- --policy <name>` after the command:

```powershell
npm run policy-log:export -- --policy customer-refund
```

### Steps on macOS or Linux (bash)

```bash
git checkout main
git pull
git checkout -b policy-log-update
npm ci
npm run build
export CI_DATABASE_URL='<read-only connection string>'
npm run policy-log:export
```

### What a successful run prints

```text
Appended 1 approval(s); the log now holds 52.
governance/policy-approvals.jsonl: 52 approvals.
...
The log verifies: the chain is intact and every signature checks out.
```

The numbers depend on how many approvals exist. Running `export` again straight away appends nothing:
`Appended 0 approval(s)`. Before writing, `export` checks that every approval it is about to append
matches a policy file in this repository (the same name and version, with the same content hash). If
one does not, it stops and writes nothing. Resolve that case before you export again.

### If it fails

| Message                                                           | Meaning and what to do                                                                                                                                                                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Set CI_DATABASE_URL to the read only policy reader role`         | The variable is not set in this window. Set it again, then rerun.                                                                                                                                                           |
| `Reading approval records failed: ...`                            | The connection string is wrong, or the role cannot read the table. Check the password, and the host and user name, against the Supabase **Connect** dialog.                                                                 |
| `Database approvals that this repository's policies do not match` | A record to be appended names a policy this repository does not hold, or its approved content differs from the file. Stop. Do not commit. Find out which repository holds that policy, and whether the approval is correct. |
| `Cannot find module` or `ERR_MODULE_NOT_FOUND`                    | The packages are not built. Run `npm run build`, then rerun.                                                                                                                                                                |
| `Fetching key "default" failed: ...`                              | The production API did not return its public key. Check that `https://parmana-api-real.vercel.app/keys/default` opens in a browser, then rerun. `PARMANA_API_URL` points it at another deployment.                          |
| `The database disagrees with the log`                             | A record already published in the log changed or disappeared in the database. Stop: do not edit the log by hand and do not commit. Treat it as a security incident and record it in `04-INCIDENTS-LOG.md`.                  |
| `Signatures: ... does not verify`                                 | A record does not verify with the key in `policy-approval-keys.json`. Do not commit. Compare that key with `/keys/default` on the production API.                                                                           |
