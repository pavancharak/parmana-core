# Production deploy, check and rollback runbook

How production is deployed on Vercel (`parmana-api-real`), how to confirm a deployment is healthy, and how to roll back. The general deployment guide is `docs/site/deployment/production.mdx`. This page covers the Vercel specifics we hit.

Set these in each new PowerShell window:

```powershell
$env:PARMANA_URL = "https://parmana-api-real.vercel.app"
$link = "$env:USERPROFILE\parmana-vercel-link"
```

---

## 1. Two entry points, one rule

| File                         | Runs on                    | Builds the app with                      |
| ---------------------------- | -------------------------- | ---------------------------------------- |
| `api/index.ts`               | Vercel                     | `createApp` from `packages/api/dist/...` |
| `packages/api/src/server.ts` | Node (self-hosted, Docker) | `createApp` from source                  |

Both must pass the same startup options. We have been bitten by this twice: the kill switch was wired only into `server.ts`, and `POLICY_CHANGE_CHECKERS` was missing from `api/index.ts`, so every approval was refused with `CHECKER_NOT_IN_SCOPE`.

**Rule:** after changing either file, run the architecture test:

```powershell
npx vitest run tests/architecture/vercel-entry-policy-checkers.test.ts
```

---

## 2. Deploying

Production is deployed from the GitHub repository when `main` changes. To redeploy the current production build with new environment values, use `redeploy`, not a fresh build:

```powershell
vercel ls parmana-api-real --prod --cwd $link          # first URL in the list is the current production deployment
vercel redeploy <that-url> --target production --cwd $link
```

Wait for `✓ Ready`. The alias `https://parmana-api-real.vercel.app` moves to the new deployment.

**Why redeploy and not a new build:** environment changes apply only to new deployments, and `redeploy` rebuilds from the same source with the current environment.

---

## 3. Check a deployment

Run in this order. Stop at the first failure.

**3a. The process starts and rejects unauthenticated requests:**

```powershell
try { Invoke-RestMethod "$env:PARMANA_URL/policies" } catch { "$($_.Exception.Response.StatusCode.value__) $($_.ErrorDetails.Message)" }
```

Expect `401 {"error":"authentication required"}`.

- `500 FUNCTION_INVOCATION_FAILED` = startup failed. Go to section 5.

**3b. Readiness:** `GET /ready` should return `200` with `"status":"READY"` and `"authDisabled":false`. It checks the database and that the `execution_intents` table exists.

**3c. The kill-switch probe.** Run the **kill-switch-probe** workflow in GitHub Actions. Expect a green run. A `201` from `POST /kill-switch/probes` means the probe key works.

**3d. Startup log.** In the Vercel dashboard → **Logs** → **Runtime Logs**, the startup line should show the policy approval check, the signing check and the execution-intent check all enabled (the repo's production guide names these: `policyExecutionVerifierConfigured`, `signingReadinessConfigured`, `executionIntentsConfigured`).

---

## 4. Roll back

Two options. Prefer the second on Hobby.

**Promote an earlier deployment** (works on every plan, and is what we used):

```powershell
vercel promote <older-deployment-url> --cwd $link --yes
```

The Hobby plan allows only one rollback through the dashboard. Attempts beyond that return `402`.

**Redeploy the known-good source** after fixing the problem: use section 2.

**After any rollback, check section 3a again.** A promoted deployment carries the environment values it was built with, so a rollback can also restore an old key list. Confirm which key list is live if you rotated keys in the meantime.

---

## 5. Startup fails: `FUNCTION_INVOCATION_FAILED`

The app throws while starting, so every request returns 500.

1. **Read the error.** Dashboard → **Logs** → **Runtime Logs** → filter **Error**. Note the first `Error:` line. The CLI (`vercel logs`) returned nothing for this deployment, so don't rely on it.
2. **Restore service first.** Promote the last deployment that returned 401 (section 4).
3. **Match the message to a fix:**

| Message contains                                                | Fix                                                                                           |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `No caller authentication keys are configured`                  | `PARMANA_API_KEYS` is missing or empty. Upload it (see the troubleshooting guide, section 3). |
| `PARMANA_API_KEYS ... not valid JSON` or `must be a JSON array` | The value is malformed. Re-upload the one-line version.                                       |
| `POLICY_CHANGE_CHECKERS ... not valid JSON`                     | The value must be an object (see the approval runbook, section 8).                            |
| `ENOENT` or `read-only` on the key directory                    | `PARMANA_KEY_DIR` must be `/tmp/parmana-keys` on Vercel.                                      |
| Key material error                                              | `PARMANA_KEY_MATERIAL_JSON` has the wrong shape.                                              |

---

## 6. Environment changes

1. Change the value (`vercel env rm <NAME> production --yes --cwd $link`, then `vercel env add`).
2. Redeploy (section 2).
3. Check (section 3).

**Pipe the value, don't paste it.** Use `$value | vercel env add NAME production --sensitive --cwd $link`. Vercel's paste prompt once saved an empty or partial value.

**Check the saved length, not the content.** The CLI doesn't show Secret values again. If you're unsure, remove and re-add.

---

## 7. Things that look like outages but aren't

| What you see                                          | What it is                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| Browser works, `curl` to a preview URL asks for login | Deployment Protection covers previews. Use the production alias.         |
| `vercel logs` shows `No logs found`                   | Use the dashboard Runtime Logs.                                          |
| `GET /api/diag` returns `401`                         | The route is behind the auth gate. It is not reachable without a key.    |
| `GET /api/does-not-exist` returns `401`               | The auth gate answers every path. A `401` does not prove a route exists. |

---

## 8. Keep this page current

When you change a deploy step, update this file on the same branch. The troubleshooting guide (`docs/runbooks/PRODUCTION-TROUBLESHOOTING.md`) and the approval runbook (`docs/runbooks/POLICY-CHANGE-APPROVAL.md`) link here.
