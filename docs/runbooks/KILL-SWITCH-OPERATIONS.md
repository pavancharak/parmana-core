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

- **Probe scheduler goes live.** The workflow is on branch `ci/kill-switch-probe`, not merged. To finish: create a key in production with only `kill-switch:probe`, add it to GitHub as the repository secret `PARMANA_PROBE_KEY`, run the workflow once by hand, then merge the branch.
- **Signed status and audit events (G-118).** Waits for the build-bound signing key.
- **Third-party check.** Needs a non-production deployment and an outside party.
- **Two-person reset in production.** Enabled, but not yet exercised with two real operator keys.
- **Key rotation.** Rotate the keys pasted during setup, and remove the old ones from `PARMANA_API_KEYS`.
