# Runbook: enabling a policy version 2 capability

This runbook says how one capability (for example `erp:pay-invoice`) goes from "built" to "decides on a deployment". It is for the owner and operators of a Parmana deployment. Read it from start to end before the first capability is enabled. It does not enable anything by itself.

The SDK methods for decisions and reviews are in 4.1.0 and later (`decidePolicyV2`, `policyV2Review`, `decidePolicyV2Review`; `decide_policy_v2`, `policy_v2_review`, `decide_policy_v2_review`). The SDKs do not yet expose the register writes described below. Those are done with HTTP calls, or from the console, by people with the right roles.

## 1. The three gates

A decision for a capability is allowed only if all three gates pass, in this order:

1. **Deployment allowlist.** The deployment must have `PARMANA_POLICY_V2_DECISIONS=true`, a database configured, and the capability listed in `PARMANA_POLICY_V2_CAPABILITIES`. If the capability is not listed, the decision returns HTTP 404 with the error code `not_enabled`. This gate is a configuration change.
2. **An approved policy version in the register.** The policy version for the capability must be proposed and approved in the register. Without one, the decision is refused with `NO_APPROVED_POLICY`.
3. **The go-live gate.** The approved policy version goes live only when the go-live gate passes. The gate is a checklist, and it is run by a gate owner who is not the owner or the successor of the action.

Gates 2 and 3 are governance steps. Gate 1 is the only one a deployment setting controls. Listing a capability in gate 1 does not make it decide anything unless gates 2 and 3 have passed.

## 2. Settings

| Setting                                                      | Required                             | Meaning                                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `PARMANA_POLICY_V2_DECISIONS`                                | Yes                                  | `true` turns policy version 2 on. `false` or unset turns it off. Any other value stops the server from starting.                              |
| `PARMANA_POLICY_V2_CAPABILITIES`                             | Yes, when decisions are on           | A comma-separated list of capabilities, for example `erp:pay-invoice`. At least one is required.                                              |
| `PARMANA_POLICY_V2_BOOTSTRAP_OWNER`                          | First start only                     | The person who becomes the first Parmana owner. It takes effect only while the register has no owner. Setting it again later changes nothing. |
| `PARMANA_POLICY_V2_SWEEP_SECONDS`                            | No                                   | How often the sweeps run, in seconds, from 1 to 86400. Unset uses the default.                                                                |
| `PARMANA_POLICY_V2_SMTP_URL`, `PARMANA_POLICY_V2_EMAIL_FROM` | Only for email alerts                | The SMTP channel for alerts. Without them, alerts appear on the console only.                                                                 |
| `PARMANA_POLICY_V2_SNS_EVENTS`                               | Only for SES bounce reports          | `true` turns on the Amazon SNS bounce endpoint. Off by default.                                                                               |
| `PARMANA_POLICY_V2_EVENTS_SECRET`                            | Only for the neutral events endpoint | Turns on the events endpoint. Off unless set.                                                                                                 |

Set these in the deployment's configuration, never in the repository, and never in chat.

## 3. Before you start: decisions that must already be made

Each item needs a named person or a written decision. Do not guess any of them.

- **The capability**, and what it does. For example, `erp:pay-invoice` pays a vendor invoice.
- **The action's owner** (`owner`) and **successor** (`successor`). The owner and successor cannot run the go-live gate for the action.
- **Two gate owners** who are neither the owner nor the successor, and who hold the `operator` role. They run the go-live gate.
- **The reviewers** for the action. The go-live gate needs at least two reviewers who are neither the owner nor the successor.
- **The thresholds and tiers** the policy uses, and who approves them.
- **Whether the policy reads sourced values.** A sourced value comes from a registered source. No source integration is connected in this build, so a policy that reads a sourced value cannot go live, and any decision that needs one is refused as `SOURCE_UNAVAILABLE`. If a capability needs sourced values, a source integration must be built first.
- **The approver keys** for any approval the policy requires, and their owners.
- **Alert channels**, if any.
- **The deployment** that enables it first. This runbook recommends staging, then production.

## 4. The register setup, in order

The register holds the people, roles, sources, thresholds, actions, approver keys, policy versions and reviewers. Each step below is a write to the register. The routes are under the policy version 2 register path. Each route checks the caller's roles, so use an account that holds the role named for it. The role each route requires is in its handler in `packages/api/src/routes/policy-v2-register.ts`; check it there before you use the route.

1. **Bootstrap the owner.** Set `PARMANA_POLICY_V2_BOOTSTRAP_OWNER` to the first owner's identifier, and start the server once. Remove the setting afterwards.
2. **Grant roles.** `POST /roles/grant` gives people the roles they need. Roles: `second-approver`, `risk-function`, `parmana-owner`, `source-owner`, `action-owner`, `gate-owner`, `reviewer`, `operator`. A `gate-owner` must also hold `operator`.
3. **Set contacts.** `POST /contacts` records how to reach a person for alerts.
4. **Register the action.** `POST /actions` creates the capability with its owner and successor.
5. **Register the reviewers.** `POST /actions/{capability}/reviewers` adds reviewers. Revoke with `POST /actions/{capability}/reviewers/{reviewerId}/revoke`.
6. **Register the sources the policy reads**, if any. `POST /sources`, then `POST /sources/{name}/approve` by the source owner and the second approver.
7. **Register the thresholds.** `POST /thresholds`, then `POST /thresholds/{action}/{name}/approve`.
8. **Register the approver keys.** `POST /approver-keys`, then `POST /approver-keys/{approverId}/{keyId}/approve`.
9. **Propose the policy version.** `POST /policies`. The validator checks the policy when it is proposed. A policy the validator rejects is refused at this step, with the first errors listed.
10. **Approve the policy version.** `POST /policies/{capability}/{policyVersion}/approve`, by a person other than the proposer.
11. **Run the test runs.** `POST /actions/{capability}/tests`, one for each tier the policy uses.
12. **Check the go-live checklist.** `GET /actions/{capability}/go-live`. It lists what is still missing. The gate passes only when the list is empty.
13. **Run the go-live gate.** `POST /actions/{capability}/go-live`, by a gate owner who is not the owner or successor. If the gate is not passed, the response lists the missing items.

## 5. What the go-live checklist checks

From the register's gate code, the gate reports these items as missing:

- the action has an owner;
- the action has a successor;
- at least two reviewers who are neither the owner nor the successor;
- every source the approved policy uses is registered and trusted;
- every threshold the approved policy uses is registered and approved;
- at least two gate owners who are neither the owner nor the successor;
- every gate owner holds the `operator` role;
- a test run for each tier, and a test run for each tier the policy uses.

The gate does not pass until the list is empty.

## 6. Deploying the enablement

Do this only after section 4 step 13 has passed.

1. In the deployment's configuration, set `PARMANA_POLICY_V2_DECISIONS=true`, a database URL, and `PARMANA_POLICY_V2_CAPABILITIES` to the capability. Set alert channels, if any.
2. Restart the server. A bad setting stops the server from starting, and the start-up error names the setting.
3. Make one test decision with an authenticated caller. For example, `decidePolicyV2` with the capability, a test transaction identifier, and the target. The response must not be HTTP 404 with `not_enabled`. It must report `released: false`. Check the outcome against the policy you approved.
4. Record the deployment, the capability, the policy version and its hash, and the time, in the change log for this deployment.

A decision does not release anything. It records the outcome and reports `released: false`. Releasing an action is a separate step, handled by the business system that calls Parmana.

## 7. Rolling back

To stop a capability deciding, remove it from `PARMANA_POLICY_V2_CAPABILITIES` and restart the server. Its decisions then return HTTP 404 with `not_enabled`. This does not change the register. To stop the whole feature, set `PARMANA_POLICY_V2_DECISIONS=false` and restart.

Rolling back does not undo register changes. A policy that has gone live stays live in the register until someone changes it through the register.

## 8. What not to do

- Do not list a capability in `PARMANA_POLICY_V2_CAPABILITIES` before its policy has passed the go-live gate. Decisions for it will then be refused with `NO_APPROVED_POLICY`, and the deployment will look enabled when it is not.
- Do not run the go-live gate for an action you own or are the successor of.
- Do not put tokens, secrets or approver private keys in the repository, the chat, or a shared document.
- Do not enable the feature in production before it has run in staging with the same settings.

## 9. Owner decisions not yet made

Record each decision here before the first capability is enabled.

| Decision                       | Answer                                                                                    | Decided by        | Date                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------- |
| First capabilities             | `crm:read` and `erp:invoice-pay` (both planned; neither enabled)                          | Owner, 2026-11-18 | Not yet written: `crm:read` rules. `erp:invoice-pay` needs a source integration first. |
| Action owner and successor     | Owner: Mohinder. Successor: Pavan. (Both actions, assumed the same.)                      | Owner, 2026-11-18 |                                                                                        |
| Two gate owners                | Asha and Mamta. Each must hold the `operator` role, and neither may be Mohinder or Pavan. | Owner, 2026-11-18 |                                                                                        |
| Reviewers                      | Shalini and Mahendra. Neither may be Mohinder or Pavan.                                   | Owner, 2026-11-18 |                                                                                        |
| Uses sourced values?           | `erp:invoice-pay`: yes (invoice details). `crm:read`: not decided, pending its rules.     | Owner, 2026-11-18 | Source integration needed for `erp:invoice-pay`.                                       |
| Approver keys and their owners |                                                                                           |                   |                                                                                        |
| Alert channels                 |                                                                                           |                   |                                                                                        |
| First deployment               |                                                                                           |                   |                                                                                        |
