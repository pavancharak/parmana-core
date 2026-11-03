# Resume: connector migration out of parmana-core

Written 2 November 2026, end of day. Read this first when you come back.

ADR-0018 (accepted 2 November 2026, PR #294) moves each vendor connector out of parmana-core into `parmana-connectors`, one at a time. Each step has three parts: the module in `parmana-connectors`, the registration in core (maker and checker), then the removal from core.

## Where things stand (updated 3 November 2026)

- **Moved out and merged:** Zerodha (PR #295), Slack (PR #296), Paytm (PR #297). Razorpay, Paytm, Slack, GitHub, HubSpot and Zerodha (paper only) are all on `main` in `parmana-connectors`.
- **Still in core:** GitHub and HubSpot.
- **Coverage lost on purpose (operator approved):**
  - seven tests that checked core's execution gate through the Paytm connector (proof-audit tests 1 to 4 and their helper, and three integration tests);
  - the approval-email integration test (its unit tests remain);
  - the offline check (`docker-compose.offline-check.yml` and `docker/local/offline-check/`), which ran a Paytm refund through the whole stack.
    Rewriting the gate tests against a core test connector is open.
- **Nothing is live:** no live traffic, no vendor credentials in production, no live money.

## Do these first tomorrow

1. **Razorpay registration in core.** You are the maker. Mamta is the checker and approves with her own key. This needs the Razorpay preview signed-release test first (see `parmana-connectors/RESUME.md`).

2. **Check the live registrations** in the running core, and record which connectors are registered before removing any more.

## Remaining steps, in order

- **GitHub:** registration approved, then removal PR from core.
- **HubSpot:** registration approved, then removal PR from core.
- **Core gate tests:** rewrite the removed gate tests against a core test connector, if you want core's gate proven by its own tests again.

## Notes

- `main` already has the unsigned Slack commit `ff324c5` (PR #296). The signed copy is on the Slack branch as `f56e60c`. Leave the history alone unless you decide otherwise.
- Deleting security-sensitive tests triggers a permission check. Ask in the session for approval before deleting tests again.
- The migration's full status and the open decisions are in `parmana-connectors/STEPS.md`.
