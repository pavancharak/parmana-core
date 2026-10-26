# Kill switch: operations runbook

Status as of 2026-10-20: **live in production** at `https://parmana-api-real.vercel.app`, with the switch **not tripped**. Decision record: [ADR-0017](../adr/ADR-0017-Operator-Kill-Switch.md). Gap: G-122 in [VERIFICATION-GAPS.md](../VERIFICATION-GAPS.md).

This runbook is for the people who operate Parmana. It never contains keys. Do not paste API keys, database URLs or Vercel values into chat, tickets or this file.

## What is running

| Setting                                   | Production value                                 | Where it is set                 |
| ----------------------------------------- | ------------------------------------------------ | ------------------------------- |
| `KILL_SWITCH_ENABLED`                     | `true`                                           | Vercel, Production, type Config |
| `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR` | `true`                                           | Vercel, Production, type Config |
| `DATABASE_URL`                            | set (already used by the audit and nonce stores) | Vercel, Production, type Secret |

The switch state lives in the `kill_switch_state` table. Probe results live in `kill_switch_probe`. Both were created by migrations `20261020120000_add_kill_switch_state.sql` and `20261020130000_kill_switch_reset_and_probes.sql`, which are applied to production. Check with `npx tsx scripts/migrate-database.ts status`: both should be listed as applied.

If `KILL_SWITCH_ENABLED` is `true` and the database cannot be read, **every** authorization and approval request is refused with `503 KILL_SWITCH_ACTIVE`. That is the fail-closed design (ADR-0017), not a fault to route around.

## Routes and capabilities

| Route                             | Who can call it              | Result                                                                                                                                                            |
| --------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /kill-switch/trip`          | key with `kill-switch:trip`  | `200` with the state. Stops execution and approvals.                                                                                                              |
| `POST /kill-switch/reset`         | key with `kill-switch:reset` | First request `202` (pending). A second request from a **different** key with `kill-switch:reset` gives `200` and lifts the stop. The same key again gives `409`. |
| `GET /kill-switch/status?nonce=…` | any valid key                | The state, with your nonce echoed. `signed` is `false`.                                                                                                           |
| `POST /kill-switch/probes`        | key with `kill-switch:probe` | `201` with the recorded probe.                                                                                                                                    |

A key without the capability gets `403 CAPABILITY_NOT_ALLOWED`. A request with no key gets `401`.

## How to check production

Set the host once, then run:

```
$URL = "https://parmana-api-real.vercel.app"
curl.exe -s "$URL/ready"
curl.exe -s -H "Authorization: Bearer <your-key>" "$URL/kill-switch/status?nonce=check-1"
```

Expected today: `/ready` returns `{"status":"READY", ...}`. The status returns `"active":false` with your nonce and `"signed":false`.

`Cannot GET /kill-switch/status` means the running deployment does not have the kill switch routes. See "Deployment" below.

## Tripping and resetting

Trip only when a stop is needed. Give a real reason; the request is refused without one.

Reset needs two different people. Each uses their own named key:

1. Operator A calls reset with their reason. The answer is `202` and `outcome: "pending"`.
2. Operator B calls reset with their own key and reason. The answer is `200` and `outcome: "reset"`.

Operator A cannot finish their own reset (`409`). A new trip cancels a pending reset.

## Deployment

Production is deployed from the code on `main`. Before any `vercel deploy --prod`:

1. Check the local checkout is current: `git switch main` then `git pull origin main`, and `git log -1 --oneline` should show the commit you expect.
2. `Select-String -Path api\index.ts -Pattern "createKillSwitch"` should print two lines. If it prints nothing, the checkout is old and the routes will be missing (`Cannot GET`).

`vercel deploy --prod` uploads the working folder, not the Git history. An old checkout deploys old code, even when `main` is current.

### Turning the switch on or off

```
vercel env add KILL_SWITCH_ENABLED production        # choose Config, value: true
vercel env rm KILL_SWITCH_ENABLED production --yes   # turn it off
vercel deploy --prod                                 # variables are read at startup
```

Settings are read once when the deployment starts, so every change needs a new deployment.

The reset setting must be exactly `true` or `false`. Anything else (including a key or a blank value) stops the function on startup with `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR must be "true" or "false"`. Every request then fails with `500`, and `/ready` fails too.

To restore service quickly after a bad change: `vercel env rm KILL_SWITCH_ENABLED production --yes`, then `vercel deploy --prod`. Removing the enable setting turns the switch off, and the function starts again.

Verify a change with `vercel env ls production` (both names should appear as Config), `vercel ls parmana-api-real` (the top Production row should be Ready and newer than the change), and `/ready`.

## What happened on 2026-10-20 (deployment record)

1. The migrations were applied with `apply`, and `status` then showed 40 applied and 0 pending.
2. The kill switch was first wired into `server.ts` only. Production runs `api/index.ts`, so the switch did nothing there. Fixed in `707e8dc`.
3. The reset setting was set to an API key by mistake. Every request then failed on startup with a `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR` error. Fixed by setting it to `true`.
4. The enable setting was removed while the service was down, to restore it. Restored after the reset setting was fixed.
5. A deploy from an old local checkout served `Cannot GET /kill-switch/status`. Fixed by deploying from `main`.
6. The final check returned `{"active":false,"version":0,"nonce":"verify-1","signed":false}`.

Two keys were pasted into chat during setup. Treat both as exposed, and rotate them.

## Decisions made on 2026-10-20

- **Probe retention:** every probe row is kept. Nothing is deleted, so the one-year minimum always holds.
- **Probe host:** a GitHub Actions workflow, `.github/workflows/kill-switch-probe.yml`, runs every 15 minutes. It sends one request to `/execute` with a probe key, and records the result with `POST /kill-switch/probes`. The run fails when a probe does not match the switch state. The workflow needs the repository secret `PARMANA_PROBE_KEY`.
- **Signing (G-118):** status and audit events stay unsigned until a signing key tied to the build exists. Signing with the gateway key now was rejected, because the review requirement in ADR-0017 asks for a build-bound key.

## Still open

Status as of 2026-10-26. Each item says what is done, what is open, and who decides the next step. These items are **deferred**: they are recorded here so they can be picked up later. None of them blocks the current service.

- **Probe scheduler: running.** The workflow runs every 15 minutes and was verified green on 2026-10-26 (run #42). Its key is the repository secret `PARMANA_PROBE_KEY`. To rotate: generate a new probe key, replace its entry in `PARMANA_API_KEYS`, redeploy, then update the secret. Do not reuse a key that has been pasted into chat.
- **Probe history retention: guard built, not scheduled.** The ADR (decision 3) requires probe rows to be kept for at least one year. Nothing deletes them today, so the minimum holds. `PostgresKillSwitchProbePruner` (merged in PR #138) deletes only probes at least one year old, and refuses any other cutoff before it runs a query. Open: nothing calls it yet. Owner: the maintainers. Next step: decide when and where the job runs, then schedule it.
- **Signed status and audit events (G-118): open.** Status responses are unsigned (`signed: false`) until a signing key tied to the running build exists. Open: provision that key and sign the status response. Owner: the maintainers. Until then, the status endpoint must say its responses are unsigned.
- **Third-party check: open.** ADR-0017 requires an independent party to check that the switch works, and to keep the evidence. It cannot be closed from inside the repository.
  - What it needs: a non-production deployment of this repository, with its own database, its own keys, and its own `PARMANA_API_KEYS`. It must never run against `parmana-api-real`, because tripping production stops real traffic.
  - The steps the outside party runs: trip the switch, confirm a refusal with a fresh nonce, reset with two operators, and confirm the request is accepted again. The result is signed evidence. The signing is not built yet (see G-118), so the evidence is unsigned until then.
  - Owner: the operator, who chooses the outside party and provides the non-production deployment. Next step: name the party and the deployment, then run the steps above.
- **Two-person reset in production: open.** The reset has been tested with two keys held by one person, which proves the mechanics but not the control. The control needs two different named operators, each with their own `callerId` and key, neither sharing a key.
  - What it needs: two people, each named, each issued a key under the process in ADR-0017 decision 2, and each recorded in `PARMANA_API_KEYS`.
  - The test to run afterwards: the maker trips, the maker requests a reset (`202`), the maker's own confirmation is refused (`409`), and the second operator confirms (`200`). See the credential section below for the commands.
  - Owner: the operator, who names the second operator. Next step: name that person.
- **Key rotation: open.** Rotate the keys that were pasted into chat during setup, and remove the old entries from `PARMANA_API_KEYS`. Owner: the operator.

## Credentials: generate, store, deploy and test

This section is for operators. It never contains a key, a key hash, or a database URL. Keys are shown once by the generator and must go straight into a password manager.

### What is required

| Where                      | Name                                      | Value                                                                                                | Used by                            |
| -------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Vercel, Production, Secret | `PARMANA_API_KEYS`                        | JSON array of `{callerId, keyHash, allowedCapabilities, credentialHolderType}` entries. Hashes only. | the API, to check every bearer key |
| GitHub repo secret         | `PARMANA_PROBE_KEY`                       | the `kill-switch-probe` key itself (plaintext)                                                       | the probe workflow                 |
| Vercel, Production, Config | `KILL_SWITCH_ENABLED`                     | `true`                                                                                               | turns the switch on                |
| Vercel, Production, Config | `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR` | `true`                                                                                               | requires two operators to reset    |

The `PARMANA_API_KEYS` value must list every caller that needs access. Setting it replaces the whole list, so a caller left out loses access.

### Callers and capabilities

| `callerId`                            | `allowedCapabilities`                   | `credentialHolderType` | Role                                  |
| ------------------------------------- | --------------------------------------- | ---------------------- | ------------------------------------- |
| a named operator (the maker)          | `kill-switch:trip`, `kill-switch:reset` | `USER`                 | trips the switch and requests a reset |
| a second named operator (the checker) | `kill-switch:reset`                     | `USER`                 | confirms the reset                    |
| `kill-switch-probe`                   | `kill-switch:probe`                     | (omit)                 | the scheduled probe                   |

Use two different people for the maker and the checker. Two keys held by one person pass the system check, but they do not give the two-person control. Give each person their own `callerId`, and do not share a key.

### Generate a key

Run from a current checkout of `main` (`git pull origin main`, then `npm ci`):

```
npm run generate:api-key -- --caller-id <callerId> --allowed-capabilities <cap1,cap2> [--credential-holder-type USER]
```

- The script prints the `Key` once, plus a `Key hash` and a JSON entry. Save the key in a password manager before doing anything else.
- A key is 43 characters long. A shorter value means a character was lost when it was copied: copy again.
- Keep the key out of chat, tickets and shared notes. Give each key to its owner privately.

### Build and check the Vercel value

1. Collect the entries (one per caller) from the generator output. Each `keyHash` must match `^[0-9a-f]{64}$`.
2. Build the JSON array in a file. Check that it parses before setting it.
3. Set the value with a file redirect, not a PowerShell pipe. A pipe produced an invalid value during setup and the server would not start:

   ```
   vercel env rm PARMANA_API_KEYS production --yes
   cmd /c "vercel env add PARMANA_API_KEYS production < <path-to-file>"
   ```

   Or use the dashboard: open the variable, choose Edit, paste the validated JSON, and save.

4. `vercel env rm` does not revoke a credential. To revoke, remove the entry and redeploy.

### Set the GitHub secret

Set `PARMANA_PROBE_KEY` to the `kill-switch-probe` key, either:

- in the browser: Settings, Secrets and variables, Actions, `PARMANA_PROBE_KEY`, Update secret; or
- with the GitHub CLI: `gh secret set PARMANA_PROBE_KEY --repo pavancharak/parmana-core`, which prompts for the value.

Delete any secret that no workflow uses, such as an old `PARMANA_API_KEYS` repo secret, with `gh secret delete <name> --repo pavancharak/parmana-core` or in Settings.

### Deploy

Deploy from a checkout of `main` that is up to date:

```
git switch main
git pull origin main
git status
vercel deploy --prod
```

`vercel deploy` uploads the working folder, not the git history. A stale folder deploys stale code. `vercel redeploy <url>` rebuilds an existing deployment's source, so it does not ship new code.

After any change to a variable, deploy again: variables are read when a deployment starts.

### Test

1. Health check. Expect `{"status":"READY","authDisabled":false}`:

   ```
   curl.exe -s "https://parmana-api-real.vercel.app/ready"
   ```

2. Route check without a key. Expect `401`; `404` means the deployed code is stale:

   ```
   curl.exe -s -o NUL -w "%{http_code}" "https://parmana-api-real.vercel.app/kill-switch/status?nonce=check"
   ```

3. Probe. Run the "Kill switch probe" workflow from the Actions tab (Run workflow, branch `main`). A green run means the probe key is accepted and the result was recorded.

4. Two-person reset. This trips production: executions and approvals are refused until the reset completes. Only do it with the owner's go-ahead. Read the key files, send each request with its body in a file (inline JSON quoting breaks in PowerShell), then:

   - maker: `POST /kill-switch/trip` returns `200` with `active: true`
   - maker: `POST /kill-switch/reset` returns `202` with `outcome: pending`
   - maker: the same call again returns `409 SAME_OPERATOR_CANNOT_CONFIRM_RESET`
   - checker: `POST /kill-switch/reset` returns `200` with `outcome: reset`
   - anyone: `GET /kill-switch/status?nonce=<value>` returns `active: false`

   Run the test with two different people. A single operator proves only that the mechanics work.

### Common failures

| Symptom                                                                                             | Cause                                                  | Fix                                                                  |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| every route returns 500 `FUNCTION_INVOCATION_FAILED`; logs say `PARMANA_API_KEYS is not valid JSON` | malformed value                                        | rebuild the JSON and set it with the file redirect, then deploy      |
| `/ready` returns 500 with no clear log line                                                         | a kill-switch setting is not exactly `true` or `false` | check `vercel env ls production` and correct it, then deploy         |
| `Cannot GET /kill-switch/status`                                                                    | the deployed code is older than the kill-switch routes | deploy from current `main`                                           |
| `401 authentication required`                                                                       | the key is wrong, truncated, or not stored             | check the key length (43) and the `callerId` entry                   |
| `400 Malformed JSON body`                                                                           | inline JSON quoting                                    | send the body with `--data-binary "@file"`                           |
| probe workflow fails with 401                                                                       | `PARMANA_PROBE_KEY` does not match the stored hash     | set the secret to the current probe key, then run the workflow again |
| `git pull` refuses to run                                                                           | uncommitted local changes                              | commit or stash them, then pull                                      |

## Probe history retention

ADR-0017 (decision 3) requires probe history to be kept for at least one year. The rows live in `kill_switch_probe`.

The code is in `packages/api/src/killSwitch/PostgresKillSwitchProbePruner.ts` (merged in PR #138):

- `probeRetentionCutoff(now)` returns the instant exactly one year before `now`.
- `assertPruneCutoffAllowed(cutoff, now)` throws if the cutoff is invalid, or if it is more recent than one year before `now`. Nothing is deleted when it throws.
- `PostgresKillSwitchProbePruner.pruneBefore(cutoff, now)` runs the guard first, then deletes probes probed before the cutoff, and returns how many were deleted.

To delete probes that are at least one year old:

```ts
const pruner = new PostgresKillSwitchProbePruner(pool);
const deleted = await pruner.pruneBefore(probeRetentionCutoff(new Date()));
```

Nothing calls the pruner yet. Scheduling it is deferred (see "Still open"). Until it is scheduled, no probe rows are deleted.

## Branch housekeeping

Only delete a remote branch when its work is already in `main`. Git cannot always confirm this, because squash-merged branches keep their own commits. Before any deletion, save the branch names and their commit SHAs to a file, so each branch can be restored.

Restore one branch from its saved SHA:

```powershell
git push origin <sha>:refs/heads/<branch-name>
```

Restore every branch in a saved file, where each line is `<sha> <branch-name>`:

```powershell
Get-Content <file> | ForEach-Object {
  $sha, $name = $_ -split ' '
  git push origin "${sha}:refs/heads/$name"
}
```

Check that a deleted branch is gone:

```powershell
git ls-remote --heads origin <branch-name>
```

An empty result means the branch is gone. A deletion never touches `main`.
