# Open items: connector migration and open-source readiness

Status as of 3 November 2026.

## Open-source readiness

- [ ] **Stale files:** decide on `REPO-CONTENTS.md`, `cryptosettings.md`, `sandbox-governance-runbook.md` and `sandbox-retirement-report.md`. Recommendation: move them to `docs/archive/`.
- [ ] **Docs index:** update `docs/README.md` to map the new folders.
- [ ] **Content review:** check each document for stale dates, dead links and duplicated sections. Not started.
- [ ] **Repository visibility:** confirm whether the repository is public on GitHub.
- [ ] **Fresh-clone test:** run the set-up in `CONTRIBUTING.md` on a clean machine.
- [ ] **Two loose files:** decide on `skills-lock.json` (tracked but gitignored) and `latency-test.cjs`.
- [x] Done: operator-only files gitignored, personal email and AWS account ID replaced, docs reorganised, `CONTRIBUTING.md` rewritten.

## Key-list ceremony

The ceremony replaces the live `PARMANA_API_KEYS` list and removes two callers: `paytm-refund-agent` and `razorpay-demo-agent`. It needs five people, each on their own machine:

| Person   | Role                             | Holds a key                                       |
| -------- | -------------------------------- | ------------------------------------------------- |
| Pavan    | Maker                            | Yes                                               |
| Mamta    | Checker                          | Yes, plus a new step-up key (her old one is lost) |
| Asha     | Operator A                       | Yes                                               |
| Mohinder | Operator B                       | Yes                                               |
| Shalini  | Assembler, runs the Vercel steps | No                                                |

- [ ] Mamta generates a new step-up key on her own machine.
- [ ] Decide how to handle the kill-switch drill (section 13.2), since its demo key is removed.
- [ ] Run the steps in `docs/runbooks/CEREMONY-FIVE-PEOPLE.md`, sections 5 to 11.
- [ ] Record the removals and the drill decision in the ceremony log (section 15).

## Razorpay

- [ ] **Confirm the registration mechanism with Mamta.** Ask whether a registration is the policy approval in `docs/runbooks/POLICY-CHANGE-APPROVAL.md`, or a different process through `/external-connectors/changes`. Nothing else starts until she agrees.
- [ ] **Decide who registers Razorpay.** The runbook lists this as open.
- [ ] **Run the preview test:** redeploy the preview on Vercel, then follow the local core steps in the connectors `RESUME.md`. The Vercel daily limit may have reset since 30 October.
- [ ] **Register Razorpay only,** after the mechanism is confirmed and the preview test passes. Mamta approves the registration.

## Connectors

GitHub, HubSpot and Slack have been removed from parmana-core, but their registrations were never approved. Before any of them is proposed for registration, decide whether it should run at all.

- [ ] **GitHub:** decide whether it should run. Repeated merges fail at GitHub rather than merging twice.
- [ ] **HubSpot:** decide whether it should run.
- [ ] **Slack:** decide whether it should run. Slack gives no receipt, so a repeated release posts again.

Live money stays off for every connector until its own approval.

## Optional, not blocking

- [ ] **Gate tests:** rewrite the seven core gate tests removed with Paytm, against a core test connector. Core's gate has no proof of its own until this is done.
- [ ] **SDK samples:** decide whether the four sample vendor connectors in `packages/connector-sdk` (Oracle, Salesforce, SAP, Workday) stay in core. They are not in the migration order.
- [ ] **Verifier:** open the parmana-verifier `dilithium3` PR. The work has no PR and needs re-signing. Tracked in parmana-verifier issues #27 and #28.
