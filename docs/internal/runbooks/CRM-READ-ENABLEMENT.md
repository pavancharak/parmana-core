# Runbook: enabling `crm:read`

This runbook enables one capability, `crm:read`, on a deployment. It does not need a source integration. It follows the three gates in `POLICY-V2-ENABLEMENT.md`, with the names and the checks for this capability.

**Status: blocked until the owner confirms the `crm:read` rules.** The rules in section 1 are assumptions from `POLICY-V2-SOURCE-INTEGRATION.md` (section 6), not decisions. Do not start section 3 until the owner has written and confirmed them.

## 1. The rules (to be confirmed)

Write these rules as the policy version for `crm:read`. Each one must be confirmed by the owner, Mohinder, before it is proposed.

- A read is allowed only when the requester is the named owner of the customer account.
- The answer includes only name and contact details. Balances and history are not included.
- Every read is recorded in the evidence log.
- A read outside these rules is refused, and the refusal names the rule.

The validator must accept the policy. It checks the policy when it is proposed (section 3, step 5).

## 2. People

| Role                 | Person   | Requirement                 |
| -------------------- | -------- | --------------------------- |
| Owner (action owner) | Mohinder | Accountable for `crm:read`  |
| Successor            | Pavan    | Cannot run the go-live gate |
| Gate owner           | Asha     | Holds the `operator` role   |
| Gate owner           | Mamta    | Holds the `operator` role   |
| Reviewer             | Shalini  | Not the owner or successor  |
| Reviewer             | Mahendra | Not the owner or successor  |

Neither Mohinder nor Pavan may run the go-live gate. Asha and Mamta must each hold `operator` before the gate runs.

## 3. Steps, in order

Each route is under the policy version 2 register path. Each route checks the caller's roles; use an account that holds the role the route's handler names. Check each handler in `packages/api/src/routes/policy-v2-register.ts` before you use it.

1. **Staging deployment settings.** Set `PARMANA_POLICY_V2_DECISIONS=true`, a database URL, and `PARMANA_POLICY_V2_CAPABILITIES=crm:read`. Set `PARMANA_POLICY_V2_BOOTSTRAP_OWNER` only for the first start, then remove it.
2. **Grant roles.** `POST /roles/grant` for Mohinder (`action-owner`), Pavan, Asha and Mamta (`gate-owner` and `operator`), Shalini and Mahendra (`reviewer`), and whatever else the handlers require.
3. **Set contacts.** `POST /contacts` for each person who receives alerts.
4. **Register the action.** `POST /actions` for `crm:read`, with owner Mohinder and successor Pavan.
5. **Register the reviewers.** `POST /actions/crm:read/reviewers` for Shalini and Mahendra.
6. **Propose the policy version.** `POST /policies` with the rules from section 1. The validator checks it here. A rejected policy is refused with the first errors listed. Fix the policy and propose it again.
7. **Approve the policy version.** `POST /policies/crm:read/{policyVersion}/approve`, by a person other than the proposer.
8. **Run the test runs.** `POST /actions/crm:read/tests`, one for each tier the policy uses. Check the policy for its tiers before you start.
9. **Check the go-live checklist.** `GET /actions/crm:read/go-live`. The list must be empty. For `crm:read` it should be empty, because it uses no sources and no thresholds.
10. **Run the go-live gate.** `POST /actions/crm:read/go-live`, by Asha or Mamta. If it is refused, the response lists the missing items. Fix each item and run it again.
11. **Test decision in staging.** `decidePolicyV2` (TypeScript) or `decide_policy_v2` (Python), with capability `crm:read`, a test transaction, and a request that should be allowed. Check the outcome, `released: false`, and the evidence log. Then a request that should be refused.
12. **Production.** Repeat steps 1 to 11 on the production deployment, with the same policy version. Record the policy version and its hash in the change log.

## 4. Checks before you say it is live

- The decision for an allowed request returns an outcome of `APPROVE`, with `released: false`.
- The decision for a refused request returns the expected refusal, and the evidence log records it.
- The go-live gate result is recorded.
- No source is needed. A decision never returns `SOURCE_UNAVAILABLE` for `crm:read`.

## 5. Rolling back

Remove `crm:read` from `PARMANA_POLICY_V2_CAPABILITIES` and restart. Its decisions then return HTTP 404 with `not_enabled`. This does not change the register. See `POLICY-V2-ENABLEMENT.md` section 7.

## 6. Open items

1. Owner confirms the rules in section 1.
2. Owner confirms the people in section 2. These are recorded in the owner decisions table of `POLICY-V2-ENABLEMENT.md`.
3. The roles each register route requires, checked in its handler, are recorded before step 2 is run.
