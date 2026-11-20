# Policy management

[Portal home](../README.md) · [Maker-checker tutorial](../tutorials/maker-checker.md) · [Transaction limits](../tutorials/transaction-limits.md) · [Policy writing guide](../../../docs/guides/policy-writing.md)

A **policy** is the organization's rule for one kind of action. Parmana does not decide what your business allows. You write the policy, a second person approves each version, and Parmana enforces it on every request. This page covers where policies live, how they are versioned and approved, how Parmana evaluates them, what the decision looks like, and how the organization keeps ownership.

For a full guide to writing rules, read [How to write a policy](../../../docs/guides/policy-writing.md). This page covers the parts the developer meets when integrating.

## Where policies live

Policies are JSON files in a **policy directory**. The server reads that directory, set with `PARMANA_POLICY_DIR`, which is required: the server refuses to start without it.

```text
<PARMANA_POLICY_DIR>/
  vendor-payment/
    2.1.0/
      policy.json
    2.1.1/
      policy.json
  payment-refund/
    1.0.0/
      policy.json
```

- The folder name is the policy **name**. The folder beneath it is the **version**.
- Each `policy.json` has a `policyId` that must equal the name, and a `policyVersion` that must equal the version folder.
- The repository's `policies/` directory holds the policies the project ships (for example `payment-refund/1.0.0`). The `fixtures/policies/` directory holds the policies the tests and tutorials use (for example `vendor-payment/2.1.0`). Your organization keeps its own directory.

Approving a change through maker-checker writes its `policy.json` into this directory. Do not edit the directory by hand in production: a file that does not match its approval record is refused (see [Troubleshooting](../troubleshooting/README.md#a-policy-file-does-not-match-its-approval-record)).

## Anatomy of a policy

The fields, as the policy-writing guide defines them:

| Field                   | Required                           | Meaning                                                                                            |
| ----------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `policyId`              | yes                                | The policy name, for example `vendor-payment`.                                                     |
| `policyVersion`         | yes                                | The version, for example `2.1.0`.                                                                  |
| `schemaVersion`         | yes                                | The policy language version, `1.0.0`.                                                              |
| `description`           | no                                 | Plain words for a checker: what the policy approves, and why.                                      |
| `signalsSchema`         | recommended                        | Each fact the rules read, with its type: `boolean`, `number` or `string`.                          |
| `boundSignals`          | when a fact equals a request field | A fact that must equal a field of the request, such as `paymentAmount` equals `parameters.amount`. |
| `signalSources`         | when a fact comes from outside     | A fact a registered source answers, with a freshness limit (`maxAgeSeconds`).                      |
| `approvalSignals`       | when a person must approve         | A fact that is true only when a signed human approval covers the request.                          |
| `requireAuthorityGrant` | no                                 | `true` or `false`.                                                                                 |
| `rules`                 | yes                                | The ordered rules. The first matching rule decides.                                                |

A rule has an `id`, a `condition`, and an `outcome` with an `action` (`approve` or `reject`) and a `reason`. A condition is a single test, an `all` list, an `any` list, or `always: true`. Operators include `is_true`, `is_false`, `eq`, `neq`, `gt`, `gte`, `lt`, `lte` and `between`.

The repository's `vendor-payment@2.1.0` policy is the example used throughout this portal. Its approve rule reads:

```json
{
  "id": "approve-payment",
  "condition": {
    "all": [
      { "fact": "humanApproved", "operator": "is_true" },
      { "fact": "vendorVerified", "operator": "eq", "value": true },
      { "fact": "paymentAmount", "operator": "gt", "value": 0 },
      { "fact": "riskScore", "operator": "lte", "value": 20 }
    ]
  },
  "outcome": { "action": "approve", "reason": "Vendor payment authorized. …" }
}
```

The complete file is `fixtures/policies/vendor-payment/2.1.0/policy.json`. This snippet is an excerpt, shown for its structure.

## Signals

Every fact a rule reads comes from one of four places. The place decides whether the caller can make the fact true.

| Kind         | Who provides it                               | Can the caller make it true?                                 | Example                                      |
| ------------ | --------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------- |
| **Bound**    | The request. Must equal a request field.      | Only by sending the matching value, which is then checked.   | `paymentAmount` equals `parameters.amount`   |
| **Sourced**  | A registered source, asked by Parmana.        | **No.** The caller's value is ignored.                       | `paymentRefundable`, from a payment provider |
| **Approved** | A signed human approval, verified by Parmana. | **No.** The caller's `true` is checked against the approval. | `humanApproved`, `managerApproved`           |
| **Declared** | The caller.                                   | Yes.                                                         | `vendorVerified` in `vendor-payment@2.1.0`   |

The validator enforces the consequence that matters most: **a declared fact can never be the only fact that approves.** An approve rule must require an approval signal, as tutorial 120 Part 1 shows. Verified: five variants of an approve rule were refused at validation, including one that approved on declared facts alone.

The declared facts in `vendor-payment@2.1.0` (`vendorVerified`, `invoiceVerified`, `paymentApproved`, `sufficientFunds`) are conditions the caller states. Parmana does not verify them, because that policy has no `signalSources`. If your organization needs Parmana to confirm one, the policy must bind it to a registered source. That is a policy change.

## Rules are checked in order

The first rule whose condition holds decides. Write the rules in this order, as the guide recommends:

1. **Refuse rules first:** a sourced fact that says no.
2. **Approve rules,** from the strictest to the loosest. Each requires an approval signal.
3. **A final reject rule** with `"condition": { "always": true }`, so every request gets a decision.

The evaluation is a pure function of the policy and the signals. It does no I/O of its own. The same policy and the same signals give the same decision every time. The policy engine's description in the repository reads "sequential rules with first-match semantics, as a pure function with no I/O".

## Versions and the version in effect

- Several versions of one policy can exist on the server at once. Each is a separate file and a separate approval.
- For each policy name, **the version in effect is the one most recently approved.** Earlier versions are superseded.
- A request names the version it runs under (`policy.version`). If that version is not the one in effect, the server refuses it.

Verified: after `vendor-payment@2.1.1` was approved through the CLI, a request naming `2.1.0` was refused:

```text
Execution rejected: Rejected: policy "vendor-payment"@"2.1.0" was superseded: the version in effect is "2.1.1", the one most recently approved.
```

Choose the version your application names deliberately. A version rollout is an approval of the new version, followed by requests that name it. A superseded version is refused for new requests.

`POST /policies/validate` checks that a named version can be loaded. It is not a check that the version is in effect:

```bash
curl -s -X POST "$PARMANA_API_URL/policies/validate" \
  -H "Authorization: Bearer $PARMANA_API_KEY" -H "Content-Type: application/json" \
  -d '{"policyId":"vendor-payment","policyVersion":"2.1.0"}'
# {"valid":true,"errors":[]}
```

## How a policy version is approved

No version takes effect until a second person approves it. The flow, verified in [tutorial 103](../../../examples/tutorials/103-policy-governance-maker-checker/run.ts) and the [governed flow](../examples/governed-quickstart/typescript/governed-flow.ts):

1. The **maker** proposes the version: the whole policy document and a reason. The change is `PENDING_APPROVAL`.
2. The maker cannot approve it (`403 SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE`).
3. A **checker** listed for this policy in `POLICY_CHANGE_CHECKERS` signs a step-up envelope on their own machine and submits it.
4. The server stores a signed approval record, and writes `policy.json` for the version. The version is in effect from then on.

Propose with `POST /policies/{name}/{version}/pending-changes`, and approve with `POST /policies/pending-changes/{id}/approve`. The SDK methods are `proposePolicyChange` and `approvePolicyChange` (TypeScript) or `propose_policy_change` and `approve_policy_change` (Python). The [maker-checker tutorial](../tutorials/maker-checker.md) has the full steps and the refusals.

Rejecting a proposal is the same flow with `reject`, and a reason is required.

## What the decision looks like

Every execution produces a decision, inside the record. An approved request's record carries the outcome at `executions[0].decision.outcome` (verified: `APPROVED`). A refusal by policy produces a refusal record, readable at `GET /refusal/{businessTransactionId}`. Its `decision` (verified) carries the fields below.

```json
{
  "decision": {
    "decisionId": "59b9c769-…",
    "evaluationMethod": { "id": "deterministic-rules", "version": "2" },
    "intentId": "i-1",
    "policy": { "name": "vendor-payment", "version": "…" }
  }
}
```

This excerpt shows the fields observed in the refusal record. The record's schemas are in `schemas/common/` in the repository, and the complete set is there.

When a request is refused before the rules run, the response is an HTTP error, not a decision record. Examples are `CAPABILITY_NOT_BOUND`, and a declared signal that does not match the request (`declared signal(s) do not match the executed intent`). These are in the [error catalogue](../reference/error-codes.md).

## Policy changes over time

- **A change to a policy is a new version.** The old version stays on the server and stays in the approval history.
- **Each approval supersedes the previous one.** Requests must name the new version to run under it.
- **The record of each decision names the version it used.** Verified: a record made under `2.1.0` still verified (`valid: true`) after `2.1.1` was approved and took effect, because the record's signature does not depend on the current version in effect.
- **A policy file that changes outside the approval flow is refused.** At start-up the server checks each policy file against its approval record. The log line `policy_governance_integrity_check_passed` is what a healthy start printed in this verification. The existing [troubleshooting guide](../../../docs/site/troubleshooting.mdx) describes the refusal for a file that does not match its approval record.

## Keeping ownership

- The organization writes the policy. Parmana does not supply business rules for you. The examples are examples.
- Approval is a human decision. Give checkers a named list (`POLICY_CHANGE_CHECKERS`) and keep their step-up keys with them.
- Every version is in the approval history, with its proposer, its checker, its reason, and its content hash.
- Changes to who may approve (approver keys, external connectors, business signal sources, authority grants) go through the same two-person governance. See the [endpoint index](../api/endpoint-index.md).

## Experimental: policy v2

A separate, experimental policy v2 surface exists, with decisions, registration, reviews and evidence replay under `/v2/…`. It is off unless `PARMANA_POLICY_V2_DECISIONS` and related settings are set, and it is not in the OpenAPI document. Do not build on it without a test against your deployment. See [API overview](../api/README.md#experimental-and-opt-in-routes).

## Checklist for a new policy version

- [ ] Every approve rule requires an approval signal (`approvalSignals`) and does not rest on declared facts alone.
- [ ] `signalsSchema` lists every fact the rules read, with its type.
- [ ] Bound signals tie each amount and target to the request.
- [ ] Sourced facts name a registered source and a freshness window.
- [ ] Rules are ordered: refusals, then approvals, then a final reject.
- [ ] `POST /policies/validate` returns `valid: true` for the new version.
- [ ] A person other than the maker has reviewed the change, and approves it with a step-up envelope.
- [ ] Callers that will run under the new version name it in their requests.
