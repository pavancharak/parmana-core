# Design: short-lived OIDC credentials for the kill-switch probe

**Status:** Draft for maintainer review. Not approved. No code has been written.
**Owner:** Pavan Charak (decision). Implementation: maintainers.
**Related:** ADR-0017 decision 3 (kill switch probe), `docs/internal/runbooks/KEY-ROTATION.md` section 6, `docs/internal/runbooks/KILL-SWITCH-OPERATIONS.md`.

---

## 1. Problem

The scheduled kill-switch probe authenticates to Parmana with a static API key. The key lives in two places: the GitHub repository secret `PARMANA_PROBE_KEY`, and the hashed entry `kill-switch-probe` in the production `PARMANA_API_KEYS` list.

This causes recurring failures:

- The two copies can drift. A rotation that updates one but not the other turns the probe red with `401` every 15 minutes, and each failed run tries to open a P1 issue.
- Rotation is manual, in a runbook with several PowerShell steps, and the old key stops working as soon as the new list is live.
- The key is long-lived. A leaked copy stays usable until someone notices and rotates it.
- The probe's access is defined partly in a secret store and partly in a production environment variable, so the policy for "what this workflow may do" is not visible in code review.

Rotating the key fixes today's failure. It does not remove the class of failure.

## 2. Goals

1. The probe holds no long-lived Parmana credential. Nothing to rotate, leak or drift.
2. Each probe run gets a credential that expires within minutes and is accepted only for that workflow.
3. The probe's permitted capability (`kill-switch:probe`) is defined in code and reviewed like other code.
4. The static-key path for existing callers is unchanged.
5. A misconfiguration fails closed, and the failure is visible in one place, not as a red run every 15 minutes.

## 3. Non-goals

- Changing the probe's behaviour or the kill-switch semantics.
- Replacing static keys for the maker, checker or other human and service callers. Those are separate work.
- Changing the bypass probe (`bypass-probe.yml`). It sends no Parmana credential and is unaffected.
- Changing how the probe records results (`POST /kill-switch/probes`). Only the credential changes.

## 4. Proposal

GitHub Actions can issue an OIDC identity token to a job that requests one (`permissions: id-token: write`). The token is a signed JWT with claims describing the repository, workflow, ref and run. Parmana verifies the token against GitHub's published signing keys and accepts it as a caller identity with a fixed capability set.

### 4.1 Architecture

`CallerAuthenticator` already has a single method, `authenticate(credential)`, and receives an opaque string. Today `createCallerAuthenticator` always returns `StaticKeyAuthenticator`. The proposal adds a second implementation and a composition:

- `GitHubOidcAuthenticator` validates a JWT and returns a `CallerIdentity`.
- A composite authenticator tries OIDC first when the bearer string has JWT shape (three dot-separated base64url segments), and otherwise delegates to `StaticKeyAuthenticator`.

Nothing else in the middleware changes. The identity returned has the same shape (`callerId`, `allowedCapabilities`, `credentialHolderType`), so downstream authorisation code (`isHumanCaller`, capability checks, audit) works unchanged.

### 4.2 Token validation

The authenticator must check all of the following. Any failure returns `undefined` (unauthenticated), not an exception.

| Check               | Value required                                                                     | Why                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Signature           | Verified against GitHub's JWKS for `https://token.actions.githubusercontent.com`   | Proves the token was issued by GitHub Actions                                                           |
| `iss`               | `https://token.actions.githubusercontent.com`                                      | Issuer pin                                                                                              |
| `aud`               | A fixed Parmana audience, for example `https://parmana-api-real.vercel.app`        | Stops tokens minted for another service being replayed here                                             |
| `exp`, `iat`, `nbf` | Current time within the window; token lifetime at most 10 minutes                  | Short-lived by construction                                                                             |
| `repository_id`     | The numeric id of `pavancharak/parmana-core`                                       | Stable id, not a name that can be reused after a rename or transfer                                     |
| `ref`               | `refs/heads/main`                                                                  | The probe runs only from `main`. A branch cannot mint a probe credential                                |
| `job_workflow_ref`  | `pavancharak/parmana-core/.github/workflows/kill-switch-probe.yml@refs/heads/main` | Pins the workflow file. Other workflows in the repo, even ones with the same permissions, get no access |
| `event_name`        | `schedule` or `workflow_dispatch`                                                  | Mirrors the workflow's triggers                                                                         |

The mapping from a valid token to a `CallerIdentity`:

- `callerId`: `github-actions:kill-switch-probe`
- `allowedCapabilities`: `["kill-switch:probe"]`, fixed in code
- `credentialHolderType`: `SERVICE`
- `allowedPrincipalIds`, `allowedTenantIds`: unset, which is the existing fail-closed default

The capability set and the claim pins are constants in one module, so changing who may use this path is a code change with review.

### 4.3 JWKS handling

- Fetch GitHub's JWKS on first use and cache it. Refresh on an unknown `kid`, rate-limited to one refresh per minute.
- If the JWKS cannot be fetched and there is no cached copy, reject the token. Fail closed.
- Do not accept `alg: none` or any algorithm other than the one GitHub signs with. Pin the allowed algorithm list.

### 4.4 Revocation

The static path checks a revocation store on each request. OIDC tokens are not stored. Revocation is handled differently:

- Tokens last at most 10 minutes, so a leaked token has a short window.
- To stop the OIDC path entirely, set a kill flag in config (`PARMANA_PROBE_OIDC_ENABLED=false`). This is read on each request and needs no redeploy if the config source supports live reads; otherwise, a redeploy.
- Removing the workflow's `id-token: write` permission or the workflow itself also stops issuance.

### 4.5 Audit

The existing `CallerAuditSink` records each authentication. OIDC authentications are logged with `callerId: github-actions:kill-switch-probe`, the `run_id`, `repository_id`, and `job_workflow_ref`. These are not secrets and can be recorded as-is.

### 4.6 Changes to the workflow

`.github/workflows/kill-switch-probe.yml`:

- Add `id-token: write` to `permissions`.
- Request a token with the audience, using `actions/github-script` or `curl` against `$ACTIONS_ID_TOKEN_REQUEST_URL`.
- Use the token as the bearer credential for `/kill-switch/status`, `/execute` and `/kill-switch/probes`.
- Remove the `PARMANA_PROBE_KEY` secret check and the static key from `env`.
- Keep the existing 401/403 messages, but change them to describe the OIDC failure, not a secret mismatch.

## 5. Rollout

Each phase is reversible, and the static key remains valid until phase 4.

1. **Build and test (no production change).** Implement `GitHubOidcAuthenticator`, the composite, and unit tests with fixture JWTs signed by a test key. Test every row of the table in 4.2, including wrong `ref`, wrong `job_workflow_ref`, expired token, bad signature, unknown `kid`, and JWKS unavailable.
2. **Deploy with OIDC accepted, probe unchanged.** Production accepts both. Nothing calls the OIDC path yet, so behaviour is unchanged.
3. **Switch the workflow to OIDC on a branch, verify with `workflow_dispatch` from `main`.** Only after the change is on `main` can a run be verified, because `ref` must be `main`. So: merge the workflow change behind a repository variable that selects the credential (`PROBE_AUTH=oidc|static`), default `static`. Set `oidc` and run manually. Confirm a green run and a recorded probe with the OIDC identity in the audit log.
4. **Observe.** Require three consecutive green scheduled runs on OIDC over at least one day.
5. **Remove the static path for the probe.** Delete the `kill-switch-probe` entry from `PARMANA_API_KEYS`, delete the `PARMANA_PROBE_KEY` secret, and remove the `PROBE_AUTH` switch. Update the runbooks: KEY-ROTATION section 6 and KILL-SWITCH-OPERATIONS become "no probe key to rotate".

**Rollback:** set `PROBE_AUTH=static` in the repository variable and keep the static entry until phase 5. After phase 5, rollback means restoring the key entry and secret from the password manager.

**Ordering constraint:** `assertProbeKeyEntry` (`packages/api/src/bootstrap/assertProbeKeyEntry.ts`, called from `createKillSwitch.ts` via `assertProbeKeyEntryFromEnv`) refuses to start when the kill switch is on and `PARMANA_API_KEYS` has no `kill-switch-probe` entry holding exactly `kill-switch:probe`. Removing the static entry without changing this check stops the kill switch from starting. Phase 5 must therefore do both in one change: remove the entry, and replace the check with the OIDC probe configuration check (the pinned claims are present and OIDC is enabled). Its unit tests change in the same commit. Do not merge the entry removal alone.

## 6. Failure modes

| Situation                               | Behaviour                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| GitHub OIDC endpoint down               | Token request fails; the probe run fails visibly. Parmana is unaffected                 |
| JWKS unreachable and no cache           | Tokens rejected; probe fails with 401; Parmana still serves other callers               |
| Token from another workflow in the repo | Rejected by `job_workflow_ref` pin                                                      |
| Token minted on a branch                | Rejected by `ref` pin                                                                   |
| Repository renamed or transferred       | `repository_id` still matches; review whether `ref`/`job_workflow_ref` pins still apply |
| Config flag set to disable OIDC         | Probe fails with 401 until re-enabled; this is the intended kill path                   |

Failure should produce one alert, not repeated P1 issues. The existing "open an issue unless one is open" check in the workflow still applies.

## 7. Risks

- **New auth code in the critical path.** Mitigated by fail-closed defaults, pinned algorithms and claim checks, and by phase 2 running before any caller depends on it.
- **Trust in GitHub's OIDC issuer.** Accepted as the trust root for this path. Checked: no workflow in this repo logs in to a cloud provider with OIDC (no `configure-aws-credentials`, `google-github-actions/auth` or `azure/login`). The four workflows that request `id-token: write` (`release.yml`, `server-image.yml`, `cli-image.yml`, `scorecard.yml`) use it for signing, not for accessing a service. So there is no existing Parmana-side OIDC verification to reuse, and this path is new code.
- **Pins that are too tight.** Renaming the workflow file or changing the default branch breaks the probe. The pins are constants, so updating them is a reviewed change.
- **A compromised `main` branch.** Anyone who can push to `main` can change the workflow and mint a probe token. This is no worse than today, where anyone with that access can read `PARMANA_PROBE_KEY` from a workflow run. Branch protection on `main` is a prerequisite and should be checked.

## 8. Open questions for maintainers

1. Is the `ref` pin to `refs/heads/main` acceptable, or should the probe also be allowed from a protected release tag?
2. Is a live config flag for disabling OIDC available in production, or is a redeploy the only kill path?
3. Should the OIDC identity also be allowed for `POST /execute` with other capabilities later, or stay fixed to `kill-switch:probe`? This doc assumes fixed.
4. Who owns the JWKS cache policy and the claim-pin constants after this lands?
5. Branch protection on `main` is **not enabled**. The GitHub API returns `404 Branch not protected` for `pavancharak/parmana-core` `main`. Section 7 depends on it, so enabling it (required reviews, no direct push, required status checks) is a prerequisite for this design, and should happen regardless of the design.

## 9. Test plan

- Unit: each validation row in 4.2, the algorithm pin, JWKS cache and refresh rate limit, JWKS-unavailable path, composite routing (JWT shape vs static key).
- Integration: a staging run of the workflow against a non-production Parmana with the same config.
- Production verification: phase 3 manual run, plus three scheduled runs in phase 4, checked in the audit log.

## 10. What this doc does not decide

It does not change the static-key policy for other callers, the kill-switch semantics, or the bypass probe. It does not pick the implementation library for JWT verification; that should be chosen in review against the existing dependency policy.
