# Resume: connector migration out of parmana-core

Written 2 November 2026, end of day. Read this first when you come back.

ADR-0018 (accepted 2 November 2026, PR #294) moves each vendor connector out of parmana-core into `parmana-connectors`, one at a time. Each step has three parts: the module in `parmana-connectors`, the registration in core (maker and checker), then the removal from core.

## Where things stand

- **Moved out and merged:** Zerodha (removed from core, PR #295), Slack (removed, PR #296). Razorpay, Paytm, Slack, GitHub, HubSpot and Zerodha (paper only) are all on `main` in `parmana-connectors`.
- **In progress:** Paytm removal. Branch `claude/remove-paytm-from-core`, commit `1e98c81`, pushed but not signed and not yet a PR.
- **Still in core:** GitHub and HubSpot.
- **Lost coverage:** seven tests that checked core's execution gate through the Paytm connector (proof-audit tests 1 to 4 and their helper, and three integration tests) were removed with your approval. Core's gate is still covered by the remaining tests. Rewriting them against a core test connector is open.
- **Nothing is live:** no live traffic, no vendor credentials in production, no live money.

## Do these first tomorrow

1. **Sign and open the Paytm removal PR.** From `D:\last\parmana-core`:

   ```bash
   git fetch origin main
   git fetch origin claude/remove-paytm-from-core
   git checkout claude/remove-paytm-from-core
   git config user.signingkey EA52495306CAD70F
   git rebase --exec "git commit --amend --no-edit -S -s" origin/main
   git log --format="%h %G? %s" origin/main..HEAD
   git push --force-with-lease origin claude/remove-paytm-from-core
   ```

   The `git log` should show one commit with `G`. Then ask Claude to open the PR, and merge it once the checks pass.

2. **Razorpay registration in core.** You are the maker. Mamta is the checker and approves with her own key. This needs the Razorpay preview signed-release test first (see `parmana-connectors/RESUME.md`).

3. **Check the live registrations** in the running core, and record which connectors are registered before removing any more.

## Remaining steps, in order

- **GitHub:** registration approved, then removal PR from core.
- **HubSpot:** registration approved, then removal PR from core.
- **Core gate tests:** rewrite the seven removed tests against a core test connector, if you want core's gate proven by its own tests again.

## Notes

- `main` already has the unsigned Slack commit `ff324c5` (PR #296). The signed copy is on the Slack branch as `f56e60c`. Leave the history alone unless you decide otherwise.
- Deleting security-sensitive tests triggers a permission check. Ask in the session for approval before deleting tests again.
- The migration's full status and the open decisions are in `parmana-connectors/STEPS.md`.
