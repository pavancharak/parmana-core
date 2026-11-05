# Parmana: current status, pending work, and where to resume

Status as of 2026-11-05. Repository: `pavancharak/parmana-core`.

## 1. Summary

The inbound-agent design is decided and recorded. The inbound check exists and runs the policy bound
to each capability. Nothing calls the check yet, and two smaller pieces are still open. The kill-switch
probe has a stale-key problem that is only partly fixed.

## 2. What is merged to main today

| PR   | What it does                                                                                 |
| ---- | -------------------------------------------------------------------------------------------- |
| #426 | CERT-In AI security audit guidelines mapping (public page)                                   |
| #434 | Gap log entries G-135 to G-141, with tracking issues #427 to #433                            |
| #435 | Gap index updated for G-130 to G-141                                                         |
| #436 | G-129 documented limit: direct agent calls are not checked (public limitations page)         |
| #437 | RFC-0024 question 3: inbound refusals and approvals are recorded as signed records           |
| #438 | RFC-0024 decisions: no bypass, same rules inbound as outbound, option A chosen               |
| #439 | RFC-0024 question 4: how no-bypass is verified (business refuses; scheduled probe)           |
| #440 | RFC-0024 questions 5 and 6: per-action policy, and what an outside request's record contains |
| #441 | RFC-0024 question list marked answered                                                       |
| #442 | RFC-0024 rewritten to the decided design                                                     |
| #443 | Migration: `inbound_decisions` holds any action (applied to production, 2026-11-05)          |
| #445 | Runtime: `execute` split into `decide` and `execute`, behaviour unchanged                    |
| #446 | Probe alert: a failed kill-switch probe opens a P1 issue; RFC-0026 drafted                   |
| #447 | Docs: inbound checks page, claims 3.30 to 3.33, gaps G-142 to G-146                          |
| #448 | Inbound check runs the bound policy (closes G-142)                                           |
| #449 | Docs updated for #448                                                                        |

## 3. Open pull request

- **#450** (G-145): the server refuses to start with the kill switch on unless `PARMANA_API_KEYS` has a
  `kill-switch-probe` entry holding exactly `kill-switch:probe`. The probe workflow checks its key with
  Parmana before each run and reports a rejected key as a key mismatch.
  - **Before it deploys:** confirm production's probe entry holds exactly `kill-switch:probe`. If it does
    not, the server will not start.

## 4. Gap status

| Gap   | Status        | Notes                                                                                                            |
| ----- | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| G-122 | open          | Kill switch: third-party check not built; two-person reset not exercised with real keys; signing waits on G-118. |
| G-129 | open          | Option A chosen. The check exists and is tested, but no business system calls it. Issue #421, P1.                |
| G-142 | resolved      | Inbound check runs the bound policy (#448).                                                                      |
| G-143 | partly closed | Policy name and version are recorded. The approver is not (`approved_by`, `approved_at`).                        |
| G-144 | open          | Facts should come from the business's records. RFC-0026 is a draft with five open questions.                     |
| G-145 | partly closed | Startup check and workflow key check in #450 (open). Rotation script and schedule still open.                    |
| G-146 | open          | No business system calls the check, and no probe checks that a direct call is refused.                           |

## 5. What is pending, in priority order

1. **Review and merge #450**, after confirming production's probe entry (see section 3).
2. **Run the kill-switch probe once by hand** after the key is confirmed, and check it passes. Nothing in
   the repository shows that it has passed since the key drifted.
3. **Answer the five RFC-0026 questions** (which source owns each fact; how a source is authenticated and
   replaced; timeouts; how old a fact may be; which capabilities need a source before approval). These
   block G-144.
4. **Decide how the approver is recorded** for inbound requests (G-143). The check has no approval step yet.
5. **Pick a pilot business system** that calls the check (G-146). This needs a real partner and a real
   system. Nothing in these repositories can do it.
6. **Write the rotation script and set a rotation owner and schedule** (G-145, the remaining part).
7. **Decide what to do with the designated branch** `ccr-be3c70c8-snx5at`, which still holds old merged
   history. Replacing it needs a force-push, which needs your approval.
8. **Optional:** a response to the DSCI consultation (policy@dsci.in); the blog and pitch work.
9. **Known gap in the claims index:** the "gap mentions" and "distinct gaps" counts were not recomputed.

## 6. Where to resume

- **Read first:** `docs/internal/rfcs/RFC-0024-Inbound-Agent-Authorization.md` (decisions and what is still
  to do) and `docs/internal/VERIFICATION-GAPS.md`, entries G-129 and G-142 to G-146.
- **Claims:** `docs/internal/CLAIMS.md`, claims 3.30 to 3.33.
- **Code:**
  - `packages/api/src/routes/inbound-checks.ts`: the inbound check.
  - `packages/api/src/app.ts`: where the check is wired to the policy and the runtime.
  - `packages/runtime/src/RuntimeEngine.ts`: `decide()`, the decide step.
  - `packages/storage/src/supabase/SupabaseInboundCheckRepository.ts`: the stored record.
  - `packages/api/src/bootstrap/assertProbeKeyEntry.ts` and `createKillSwitch.ts`: the startup check.
  - `.github/workflows/kill-switch-probe.yml`: the probe, its key check, and its alert.
- **Runbooks:** `docs/internal/runbooks/KEY-ROTATION.md` (section 6 is the probe key) and
  `docs/internal/runbooks/KILL-SWITCH-OPERATIONS.md`.
- **Issues:** #421 (G-129, P1), #427 to #433 (G-135 to G-141), #397 (G-50, approver scope).

To resume a piece of work: fetch `origin/main`, create a branch from it, and read the entry for the gap
above. For G-143, the approver path starts in `inbound-checks.ts`. For G-146, the caller is outside these
repositories, so start by choosing the pilot system.

## 7. Known issues in what is merged

- The public Inbound checks page and claim 3.30 describe the policy-backed check, as of #449. Claim 3.31
  says the migration is applied; it is applied to production, but the claim's limits are still accurate.
- The probe key in production may not match the repository secret. The workflow now reports this as a key
  mismatch, but it has not been fixed in production yet.
