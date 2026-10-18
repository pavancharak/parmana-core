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

Policy files whose content is not their latest logged approval are listed under **Policy files
(not enforced yet)**. They do not fail the check unless you add `-- --require-coverage`. Add
`-- --base <commit>` to also check that the log only grew since that commit.

## Update it (maintainers)

Run this after every policy change approved in production, and once now to fill the log for the
first time. It reads the production database with the read only role, so it changes nothing
there.

### What you need

| What                                                                     | Where to find it                                                                                                                                                                      |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A clone of the repository on an up to date `main`, Node.js 24.6 or later | `git checkout main`, then `git pull`                                                                                                                                                  |
| `SUPABASE_URL`                                                           | Supabase dashboard, production project, **Project Settings**, **Data API**: **Project URL**, for example `https://abcdefghijkl.supabase.co`                                           |
| `SUPABASE_ANON_KEY`                                                      | Same project, **Project Settings**, **API Keys**: the **Publishable key** (starts with `sb_publishable_`), or the legacy **anon public** key. Never the secret or `service_role` key. |

These are the same two values stored as the `SUPABASE_URL` and `SUPABASE_ANON_KEY` secrets the
`verify-policy-approvals` CI job uses. GitHub does not show stored secrets again, so copy them
from the Supabase dashboard. The anon key can only read the approval records table
(`supabase/migrations/20260818150000_add_ci_read_only_policy_for_approval_records.sql`).

### Steps on Windows (PowerShell)

Run each line on its own, from the repository folder:

```powershell
git checkout main
git pull
git checkout -b policy-log-update
npm ci
npm run build
$env:SUPABASE_URL = "https://YOUR-PROJECT.supabase.co"
$env:SUPABASE_ANON_KEY = "sb_publishable_YOUR-KEY"
npm run policy-log:export
```

The two `$env:` values last only for this PowerShell window. Nothing is saved to disk.

### Steps on macOS or Linux (bash)

```bash
git checkout main
git pull
git checkout -b policy-log-update
npm ci
npm run build
export SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
export SUPABASE_ANON_KEY="sb_publishable_YOUR-KEY"
npm run policy-log:export
```

### What a successful run prints

```text
Appended 14 approval(s); the log now holds 14.
governance/policy-approvals.jsonl: 14 approvals.
...
The log verifies: the chain is intact and every signature checks out.
```

The numbers depend on how many approvals exist. A list under **Policy files (not enforced yet)**
does not stop the update; it shows policy files whose content differs from their latest
approval, and is worth reading. Running `export` again straight away appends nothing:
`Appended 0 approval(s)`.

### If it fails

| Message                                        | Meaning and what to do                                                                                                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Set SUPABASE_URL and SUPABASE_ANON_KEY`       | One of the two values is not set in this window. Set both again, then rerun.                                                                                                                               |
| `Reading approval records failed: ...`         | The URL or key is wrong, or the key is not the anon or publishable one. Copy both again from the dashboard.                                                                                                |
| `Cannot find module` or `ERR_MODULE_NOT_FOUND` | The packages are not built. Run `npm run build`, then rerun.                                                                                                                                               |
| `Fetching key "default" failed: ...`           | The production API did not return its public key. Check that `https://parmana-api-real.vercel.app/keys/default` opens in a browser, then rerun. `PARMANA_API_URL` points it at another deployment.         |
| `The database disagrees with the log`          | A record already published in the log changed or disappeared in the database. Stop: do not edit the log by hand and do not commit. Treat it as a security incident and record it in `04-INCIDENTS-LOG.md`. |
| `Signatures: ... does not verify`              | A record does not verify with the key in `policy-approval-keys.json`. Do not commit. Compare that key with `/keys/default` on the production API.                                                          |

### Review and commit

1. Check what changed:

   ```bash
   git status
   git diff --stat
   ```

   Only `governance/policy-approvals.jsonl` should change, and on the first run also
   `governance/policy-approval-keys.json`. Existing lines in the log must not change; new lines
   are added at the end.

2. On the first run, or whenever `policy-approval-keys.json` changes, compare the key with the
   one the production API serves. On Windows: `curl.exe -s https://parmana-api-real.vercel.app/keys/default`.
   The `pem` value it returns must be the same text as in `policy-approval-keys.json`.

3. Commit and open a pull request:

   ```bash
   git add governance/policy-approvals.jsonl governance/policy-approval-keys.json
   git commit -m "Update the policy approval log"
   git push -u origin policy-log-update
   ```

   Open the pull request on GitHub. The **Verify the policy approval log** step in CI checks the
   chain, the signatures and that the log only grew. Merge when CI passes.

### Check that the log is up to date

With the same two values set:

```bash
npm run policy-log:check-db
```

It prints `The log matches the database (N approvals).` and exits 0, or says how many
approvals the log is behind and exits 1. It writes nothing.
