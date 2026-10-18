# The public sandbox: setup and live check (ADR-0014 steps 2 and 3)

The sandbox is the same code as production, deployed separately, with its own database, its own signing keys and its own
approver, whose only action acts on nothing. It backs the docs playground. Read
`docs/adr/ADR-0014-Public-Sandbox-And-Docs-Playground.md` first.

Nothing here touches production. Every stage below writes only to the new Supabase project, the new Vercel projects
`parmana-sandbox` and `parmana-sandbox-receipt`, and the new key folder `D:\key\parmana-sandbox`. The one stage that
reads production (`ProductionNames`) lists variable names only, never values.

## What gets created

| Part                 | Where                                                  | What it is                                                                |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| Keys                 | `D:\key\parmana-sandbox` (never in the repository)     | Signing keys, the maker, checker and visitor API keys, the demo approver  |
| Database             | A new Supabase project, Mumbai (see step 2)            | Every migration applied; nothing shared with production                   |
| The API              | Vercel project `parmana-sandbox`, from this repository | `https://parmana-sandbox.vercel.app`, `PARMANA_SANDBOX=true`              |
| The receipt endpoint | Vercel project `parmana-sandbox-receipt`               | `https://parmana-sandbox-receipt.vercel.app/api/release`, acts on nothing |
| Governance           | In the sandbox, through maker checker                  | The demo approver, policy `sandbox-receipt` 1.0.0, the registration       |

## Files

| File                   | Purpose                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `setup-sandbox.ps1`    | Every stage, for Windows PowerShell. Sandbox keys are read from the key folder and never printed.                    |
| `make-keys.ts`         | Makes every sandbox key as files in one new folder (stage `Keys`).                                                   |
| `policy.json`          | `sandbox-receipt` 1.0.0. Checked by `tests/architecture/sandbox-policy.test.ts`.                                     |
| `check.ts`             | The live check, with the published demo key only (stage `Check`).                                                    |
| `publish-demo-key.ps1` | Writes the demo key into the docs in place of their placeholder, after the sandbox confirms it is `sandbox-visitor`. |

## The stages

Run every command from `D:\last\parmana`, in Windows PowerShell, one at a time. Each stage prints what it
did; stop at the first one that does not print what the table says.

### 1. Make the keys

```powershell
powershell -ExecutionPolicy Bypass -File D:\last\parmana\deploy\sandbox\setup-sandbox.ps1 -Stage Keys
```

Expect: `Wrote 8 files to D:\key\parmana-sandbox`, listing them, and `No key was printed.`

### 2. Create the Supabase project (in the browser)

In the Supabase dashboard: **New project**, a name such as `parmana-playground`, region **South Asia (Mumbai)**, a new
database password. **Do not use the existing Supabase project named `parmana-sandbox`: despite its name, it is
production's database** (project `ltjadvsjlpcygborxzet`); never pause or delete it. The sandbox set up on 2026-10-02 uses
project `zkrfrfyokkpfwghoohne`. When it is ready, open **Connect** and keep the page open: stage 4 needs the **Session pooler** string
(port 5432) and stage 7 the **Transaction pooler** string (port 6543), each with the password filled in. These are the
sandbox's, not production's.

**Copy both strings from the sandbox project's Connect page, never from the repository's `.env` file:** `.env` holds
production's database. Stages 4 and 7 refuse production's project, a string on the wrong port, a database that already
has migrations, and, at stage 7, a different project from the one stage 4 used. Each refusal happens before anything
connects.

### 3. Create the Vercel project (in the browser)

In the Vercel dashboard, team `pavan-dev-singh-charaks-projects`: **Add New**, **Project**, import
`pavancharak/parmana`, name it **`parmana-sandbox`**. Vercel offers **Services** and a suggested
`vercel.json` because it sees several folders: do not use them. Set **Application Preset** to **Other** (the repository's
own `vercel.json` defines the build, as for production), accept the "Possible configuration mismatch" warning, keep
every other setting, **Deploy**. Check that the project's **Domains** shows `parmana-sandbox.vercel.app`.

If **Domains** says "No Deployment", create the first one: **Deployments**, **Create Deployment**, branch `main`. Stage
8 redeploys an existing deployment and stops when there is none. A deployment made before stage 7 has no variables and
will not answer yet; that is expected. If Vercel gave another address, pass it as `-ApiUrl` to every stage
below.

From now on Vercel deploys the sandbox on every merge to `main`, as it does production.

### 4 to 16

```powershell
powershell -ExecutionPolicy Bypass -File D:\last\parmana\deploy\sandbox\setup-sandbox.ps1 -Stage Migrate
```

Then the same command with each stage below, in this order.

| #   | Stage                 | Needs                                           | Expect                                                                                                                                            |
| --- | --------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4   | `Migrate`             | The sandbox's **session** pooler string, pasted | `Database: ... as postgres.<the sandbox project>`, every migration pending; after `APPLY`, `33 applied, 0 pending`                                |
| 5   | `Link`                | The Vercel CLI, logged in                       | `Linked.`                                                                                                                                         |
| 6   | `ProductionNames`     | `%USERPROFILE%\parmana-vercel-link`             | Production's variable names. Read the yellow lines and stop if one is unexplained                                                                 |
| 7   | `SetEnv`              | The **transaction** pooler string, pasted       | Twelve `set ...` lines, then `All 12 set.`                                                                                                        |
| 8   | `Deploy`              |                                                 | After `DEPLOY`, `GET /ready: READY, authDisabled False` and `GET /keys/default: default, ed25519`                                                 |
| 9   | `Endpoint`            |                                                 | After `DEPLOY`, `The endpoint refuses an unsigned body with 401, as required.`                                                                    |
| 10  | `ProposeApprover`     |                                                 | `Proposed: <id>, PENDING_APPROVAL`                                                                                                                |
| 11  | `ApproveApprover`     |                                                 | The change shown, then after `APPROVE`, `Status: APPROVED`                                                                                        |
| 12  | `ProposePolicy`       |                                                 | `Proposed: <id>, PENDING_APPROVAL`                                                                                                                |
| 13  | `ApprovePolicy`       |                                                 | The policy shown, then `Status: APPROVED`                                                                                                         |
| 14  | `ProposeRegistration` |                                                 | `Proposed: <id>, PENDING_APPROVAL, stored as https://parmana-sandbox-receipt.vercel.app/api/release`                                              |
| 15  | `ApproveRegistration` |                                                 | The registration shown, then `Status: APPROVED`                                                                                                   |
| 16  | `Check`               |                                                 | Nine lines with no `WRONG`, then `All nine behaved as required.`                                                                                  |
| 17  | `Retention`           | The **session** pooler string, pasted           | A check listing what a 0 day period would delete (a preview that undoes itself), then after `INSTALL`, `Installed. Job parmana-sandbox-retention` |

Stage 16 is ADR-0014 step 3. It uses only the visitor key, as a docs reader will, and checks: the key's scope, the
policy in effect, a refusal with no approval, a demo approval, an approved request released to the receipt endpoint
whose record verifies offline, a reused approval refused, a long note refused, another capability refused by the demo
approver, and browser access for the docs site only. Its record is saved to `deploy/sandbox/evidence/check-record.json`.

## When it fails

| You see                                                                    | Meaning and fix                                                                                                                                       |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `D:\key\parmana-sandbox already has files`                                 | The keys exist. Do not make them again; go on with the next stage.                                                                                    |
| `Database:` names a host you do not recognise                              | Wrong string. Type anything but `APPLY`, and paste the sandbox project's session pooler string.                                                       |
| `That string is PRODUCTION's database`                                     | You pasted production's string, probably from `.env`. Copy the string from the sandbox project's Connect page.                                        |
| `This database already has migrations`                                     | The string is not the new sandbox project's. Nothing was written. Check which project you copied it from.                                             |
| `That is not the string on port ...`                                       | Stage 4 needs the session pooler (5432), stage 7 the transaction pooler (6543).                                                                       |
| Stage 8: `Not ready`, or the redeploy fails                                | Read the function log: `vercel logs --project parmana-sandbox --scope pavan-dev-singh-charaks-projects`. A startup refusal names the variable to fix. |
| `PARMANA_SANDBOX=true refuses to start while a built in connector`         | A connector variable is set on `parmana-sandbox`. Remove it in the project's settings, then stage 8 again.                                            |
| Stage 9: `expected 401`                                                    | Vercel gave the endpoint another address. Run stage 9 again with `-EndpointUrl https://<its address>/api/release`, and use the same in stage 14.      |
| `HTTP 403 ... STEP_UP_AUTHORIZATION_INVALID`                               | More than 120 seconds passed between showing the change and approving it. Run the stage again.                                                        |
| `HTTP 400 ... EXTERNAL_ENDPOINT_ADDRESS_REFUSED`                           | The endpoint's host did not resolve only to public addresses at that moment. Run the stage again; if it persists, stop.                               |
| Stage 16: `2. Policy in effect` wrong, or `409 NO_APPROVED_POLICY_VERSION` | Stage 13 was not approved.                                                                                                                            |
| Stage 16: `503 CONNECTOR_NOT_REGISTERED`                                   | Stage 15 was not approved.                                                                                                                            |
| Stage 16: `5.` refused with `issuer` in the reason                         | Stage 11 was not approved: the server does not trust the demo approver yet.                                                                           |
| Stage 16: `9. Browser access` wrong                                        | `PARMANA_CORS_ORIGINS` is wrong or missing. Stage 7, then stage 8.                                                                                    |

## Afterwards

- Keep `evidence/check-record.json` (no secret) for the `docs/CLAIMS.md` entry.
- `sandbox-visitor.key` is the demo key the docs publish (ADR-0014 step 4). The docs hold a placeholder
  until `publish-demo-key.ps1` writes the key in. Every other file in `D:\key\parmana-sandbox` stays
  private.
- Retention (ADR-0014 open question 3, accepted: 7 days, daily) is stage 17: `retention.sql` installs the function
  `parmana_sandbox_retention(days)` and a `pg_cron` job that runs it at 03:30 UTC with 7 days. It deletes requests,
  their records, audit events, expired nonces and handbook leads older than that, children first; it keeps governance.
  It refuses any database without the active `sandbox:receipt` registration, and it is not a migration, so it never
  reaches production. A period under 7 days is refused unless a second argument confirms it, and every run that
  deletes writes a row to `sandbox_retention_runs`. After the 2026-10-02 deletion (`docs/VERIFICATION-GAPS.md` G-86),
  the job is paused: before reinstalling, read G-86, and after the next 03:30 UTC run read
  `select * from sandbox_retention_runs order by ran_at desc limit 1;` in the sandbox project.
