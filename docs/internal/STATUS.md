# Parmana: current status, pending work and where to resume

Status as of 2026-11-05. Repository: `pavancharak/parmana-core`.

## 1. Summary

The inbound-agent design is decided and recorded (RFC-0024). The inbound check exists, runs the policy
bound to each capability, and is tested. Nothing calls it yet. Several evidence-review gaps and the
kill-switch probe have been closed today. Open work is listed in section 5.

## 2. Open pull requests

- **#459** (G-148): every decision names the evaluation method and version it was made with. Needs an
  approving review.

Everything else from today is merged. See section 3.

## 3. Merged to main today

| PR   | What it does                                                                             |
| ---- | ---------------------------------------------------------------------------------------- |
| #426 | CERT-In AI security audit guidelines mapping (public page)                               |
| #434 | Gap log entries G-135 to G-141, with tracking issues #427 to #433                        |
| #435 | Gap index updated for G-130 to G-141                                                     |
| #436 | G-129 documented limit: direct agent calls are not checked (public limitations page)     |
| #437 | RFC-0024 question 3: inbound refusals and approvals are recorded                         |
| #438 | RFC-0024 decisions: no bypass, same rules inbound as outbound, option A chosen           |
| #439 | RFC-0024 question 4: how no-bypass is verified                                           |
| #440 | RFC-0024 questions 5 and 6: per-action policy; what an outside request's record contains |
| #441 | RFC-0024 question list marked answered                                                   |
| #442 | RFC-0024 rewritten to the decided design                                                 |
| #443 | Migration: `inbound_decisions` holds any action (applied to production, 2026-11-05)      |
| #445 | Runtime: `execute` split into `decide` and `execute`, behaviour unchanged                |
| #446 | Probe alert: a failed kill-switch probe opens a P1 issue; RFC-0026 drafted               |
| #447 | Docs: inbound checks page, claims 3.30 to 3.33, gaps G-142 to G-146                      |
| #448 | Inbound check runs the bound policy (closes G-142)                                       |
| #449 | Docs updated for #448                                                                    |
| #450 | Probe startup check and workflow key check (G-145, partly closed)                        |
| #455 | This status document, first version                                                      |
| #456 | Gap log entries G-147 to G-150, with issues #451 to #454                                 |
| #457 | Release refuses authorizations with no signals hash (closes G-149, issue #453)           |
| #458 | Refusal-notification claim corrected (closes G-150, issue #454)                          |

## 4. Gap status

| Gap   | Status                        | Notes                                                                                                                                 |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| G-122 | open                          | Kill switch: third-party check not built; two-person reset not exercised with real keys; signing waits on G-118.                      |
| G-129 | open                          | Option A chosen. The check exists and is tested, but no business system calls it. Issue #421, P1.                                     |
| G-142 | closed                        | Inbound check runs the bound policy (#448).                                                                                           |
| G-143 | partly closed                 | Policy name and version are recorded. The approver is not (`approved_by`, `approved_at`). Issue #397 is related to approver scope.    |
| G-144 | open                          | Facts should come from the business's records. RFC-0026 is a draft with five open questions.                                          |
| G-145 | partly closed                 | Startup check and workflow key check (#450). Rotation script and schedule still open.                                                 |
| G-146 | open                          | No business system calls the check, and no probe checks that a direct call is refused.                                                |
| G-147 | open                          | Missing signals evaluate as false, so absent evidence looks like a refusal. Needs a new outcome; a design decision first. Issue #451. |
| G-148 | closed (#459, awaiting merge) | Decisions name the evaluation method and version. Issue #452.                                                                         |
| G-149 | closed                        | Release refuses authorizations with no signals hash (#457). Issue #453 closed.                                                        |
| G-150 | closed                        | Refusal-notification claim corrected (#458). Issue #454.                                                                              |

## 5. What is pending, in priority order

1. **Review and merge #459** (G-148).
2. **Decide the G-147 outcome.** Missing signals should produce "insufficient evidence," not a refusal. This changes what clients see, so confirm the wording first.
3. **Confirm production's probe entry** holds exactly `kill-switch:probe`, then run the kill-switch probe by hand and check it passes (PR #450 is merged, so the server now refuses to start without that entry).
4. **Answer the five RFC-0026 questions** (which source owns each fact; how a source is authenticated and replaced; timeouts; how old a fact may be; which capabilities need a source before approval). These block G-144.
5. **Decide how the approver is recorded** for inbound requests (G-143). The check has no approval step yet.
6. **Pick a pilot business system** that calls the check (G-146). Nothing in these repositories can do it.
7. **Write the rotation script and name a rotation owner and schedule** (G-145, the remaining part).
8. **Decide what to do with the designated branch** `ccr-be3c70c8-snx5at`, which still holds old merged history. Replacing it needs a force-push, which needs your approval.
9. **Optional:** a response to the DSCI consultation (policy@dsci.in); the blog and pitch work.
10. **Known gap in the claims index:** the "gap mentions" and "distinct gaps" counts were not recomputed.

## 6. Where to resume

- **Read first:** `docs/internal/rfcs/RFC-0024-Inbound-Agent-Authorization.md` and `docs/internal/VERIFICATION-GAPS.md`, entries G-122, G-129 and G-142 to G-150.
- **Claims:** `docs/internal/CLAIMS.md`, claims 2.3, 2.42, 2.47 and 3.30 to 3.33. Updates from today are dated in each section.
- **Runbooks:**
  - `docs/internal/runbooks/KEY-ROTATION.md`, section 6: the probe key, the startup check and the workflow check.
  - `docs/internal/runbooks/PRODUCTION-DEPLOY-AND-ROLLBACK.md`, section 9: changes that refuse requests that used to pass. Check these before the next deploy.
- **Code:**
  - `packages/api/src/routes/inbound-checks.ts` and `packages/api/src/app.ts`: the inbound check and its wiring.
  - `packages/runtime/src/RuntimeEngine.ts`: `decide()`, the decide step.
  - `packages/execution-gateway/src/ExecutionGateway.ts`: the release-time checks, including the refusal of unhashed authorizations (G-149).
  - `packages/policy/src/PolicyEngine.ts`: `POLICY_EVALUATION_METHOD` (G-148).
  - `packages/api/src/bootstrap/assertProbeKeyEntry.ts` and `createKillSwitch.ts`: the startup check (G-145).
  - `.github/workflows/kill-switch-probe.yml`: the probe, its key check, and its alert.
- **Issues:** #421 (G-129, P1), #427 to #433 (G-135 to G-141), #451 (G-147), #397 (G-50, approver scope).

To resume a piece of work: fetch `origin/main`, create a branch from it, and read the gap entry above. For
G-147, start with the outcome wording in `docs/internal/VERIFICATION-GAPS.md`. For G-146, the caller is
outside these repositories, so start by choosing the pilot system.
