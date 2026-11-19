# How to write a policy

This guide explains how a policy is written for parmana-core, end to end: what each part is for, the order in which rules are checked, what the validator enforces, and how to fix each validator error. It is written from the code (`packages/policy/src/types/Policy.ts`, `packages/policy/src/PolicyValidator.ts`) and from the design documents, and it says where the two differ.

For the approval process (who proposes, who checks, how a version goes live), read the [maker-checker chapter](maker-checker-chapter.md) and [production integration guide](production-integration-guide.md), steps 1 to 3. This guide covers the policy file itself.

## 1. The three questions a policy answers

Every rule in a policy answers one question about a request:

1. **Is it refused?** A fact that a verified source says is wrong, or a required fact that is missing.
2. **Is it approved?** Every fact the rule reads is established by something the caller cannot fake: a source Parmana asks, or a signed human approval.
3. **Otherwise?** Reject, with a reason.

A caller's own declarations never approve anything. The validator enforces this for approve rules (section 5).

## 2. The parts of a policy file

| Field                   | Required                           | What it holds                                                            |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `policyId`              | yes                                | The policy name, for example `razorpay-refund`.                          |
| `policyVersion`         | yes                                | The version, for example `1.1.0`. The caller declares it (decision D17). |
| `schemaVersion`         | yes                                | The policy language version, `1.0.0`.                                    |
| `description`           | no                                 | Plain words for a checker: what the policy approves and why.             |
| `signalsSchema`         | recommended                        | Each fact the rules read, with its type: `boolean`, `number`, `string`.  |
| `boundSignals`          | when a fact equals an Intent field | A fact that must equal a field of the request, such as the amount.       |
| `unboundSignalReasons`  | when a fact is not bound           | Why a fact is not bound to the request.                                  |
| `signalSources`         | when a fact comes from outside     | A fact a registered source answers, for example a payment's status.      |
| `approvalSignals`       | when a person must approve         | A fact that exists only when a signed human approval covers the request. |
| `requireAuthorityGrant` | no                                 | `true` or `false`.                                                       |
| `rules`                 | yes                                | The ordered rules (section 3).                                           |

### 2.1 Fact kinds

- **Bound.** The fact must equal a field of the request, for example `refundAmount` must equal `parameters.amount`. A bound fact ties a value to the request. It does not authorize anything.
- **Sourced.** The fact is what a registered source says. The source is asked for a claim about a subject (`target` or a parameter), and the answer is valid for `maxAgeSeconds` (1 to 86400 seconds).
- **Approved.** The fact is true only when a signed human approval covers the request. `resourceId` names what the approval covers (`target` or a parameter path). `value`, when given, names the parameter the approval must match.
- **Declared by the caller.** Any fact in `signalsSchema` that is none of the above. A rule may read it, but it can never be the only fact that approves (section 5).

## 3. Rules and the order they are checked

Rules are checked in the order written, and **the first matching rule wins**. Write them in this order:

1. **Refuse rules first**: a sourced fact that says no. These reject.
2. **Approve rules**, from the strictest to the loosest.
3. **A final reject rule** with `"condition": { "always": true }`. It catches everything else, so every request gets a decision.

Each rule has:

- `id`: unique within the policy.
- `condition`: a single test, an `all` list (every test must hold), an `any` list (one must hold), or `always: true`. Lists can nest.
- `outcome`: `action` (`approve` or `reject`) and a `reason` for the record. A reason is always required.

### 3.1 Operators

Tests use these operators (the full list is `PolicyOperator` in `packages/policy/src/types/Policy.ts`):

- Boolean: `is_true`, `is_false`. Use these for approval and source facts.
- Equality: `eq`, `neq`.
- Numbers: `gt`, `gte`, `lt`, `lte`, `between`.
- Lists: `in`, `not_in`, `contains`, `not_contains`, `contains_all`, `contains_any`.
- Text: `starts_with`, `ends_with`, `matches` (a regular expression, with a length limit and no nested quantifiers).

## 4. Tiers: the design and what the validator enforces

The design (`docs/internal/design/NEW-SYSTEM-DESIGN.md`, section 7) sorts every request into one of five tiers, checked in this order:

| Tier   | Applies when                                                                   | Outcome                |
| ------ | ------------------------------------------------------------------------------ | ---------------------- |
| Refuse | A verified value says no, or a required verified value is missing.             | Reject.                |
| Review | An untrusted or AI-declared value would change the outcome.                    | A person reviews it.   |
| Tier 1 | Every value the rule reads is sourced and verified, each within its threshold. | Approve automatically. |
| Tier 2 | Everything in tier 1, plus a verified approval for the exact value.            | Approve.               |
| Reject | Nothing else matched.                                                          | Reject.                |

**What the validator enforces today.** The validator requires every approve rule to need a signed approval (section 5). So:

- **Refuse** is written as a reject rule on a sourced fact. Supported.
- **Tier 2** is written as an approve rule that needs a sourced fact and an approval fact. Supported.
- **Reject** is the final `always` rule. Supported.
- **Tier 1** (automatic approval within a threshold, with no person) cannot be written. The validator refuses it. This is an open conflict between the design and the code, recorded in `docs/ASSURANCE_DECISIONS.md` as D23, and it needs the owner's decision.
- **Review** has no outcome in the policy language. A review is a case the policy cannot approve or reject, so it falls through to the final reject. Supported only through the review process, which is not part of the policy file.

## 5. The rule that protects approval

Every approve rule must require an approval fact with `is_true`, either as its whole condition or directly inside its top-level `all`. A rule that approves without one is refused. The validator message is:

> Policy rule '<id>' approves without a signed human approval. Every approve rule must require an approvalSignals fact with is_true, as its whole condition or directly inside its top level 'all'.

A bare `any` list cannot satisfy this, because one branch could skip the approval.

## 6. Validator errors and how to fix them

| Message (abbreviated)                                                                        | Cause                                         | Fix                                                                     |
| -------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| `signalsSchema.<name> must be one of ...`                                                    | Unknown fact type.                            | Use `boolean`, `number` or `string`.                                    |
| `boundSignals must be an object` / `keys cannot be empty`                                    | Malformed binding.                            | Map each fact to a non-empty dot path.                                  |
| `boundSignals['<fact>'] must be a non-empty string dot-path`                                 | Empty path.                                   | Give a path such as `parameters.amount`.                                |
| `unboundSignalReasons ... is contradictory`                                                  | A fact is both bound and marked unbound.      | Keep one.                                                               |
| `Policy references fact(s) ... with no boundSignals entry and no unboundSignalReasons entry` | A fact is read with no binding and no reason. | Bind it, or add a reason it is not bound.                               |
| `Duplicate policy rule id`                                                                   | Two rules share an id.                        | Make each id unique.                                                    |
| `Policy rule '<id>' is missing an outcome` / `outcome action` / `outcome reason`             | An incomplete outcome.                        | Give `action` and `reason`.                                             |
| `Unsupported operator '<op>'`                                                                | A typo or an unlisted operator.               | Use an operator from section 3.1.                                       |
| `'all' must contain at least one condition` / `'any' ...`                                    | An empty list.                                | Add a condition or remove the list.                                     |
| `'matches' pattern ...`                                                                      | Too long, a nested quantifier, or invalid.    | Simplify the pattern.                                                   |
| `approvalSignals must be an object` / `keys cannot be empty`                                 | Malformed approval block.                     | Give each approval a name and a body.                                   |
| `<approval> names a fact no rule references`                                                 | An approval no rule reads.                    | Use it in a rule, or remove it.                                         |
| `<approval>.resourceId must be "target" or a dot-path...`                                    | Wrong resource.                               | Use `target` or `parameters.<name>`.                                    |
| `<approval>.value must be a dot-path into the Intent's parameters`                           | Wrong value path.                             | Use `parameters.<name>`.                                                |
| `<approval>.artifact ...`                                                                    | Shared or read artifact.                      | Give each approval its own artifact name, and do not read it in a rule. |
| `signalSources must be an object` / `keys must be signal names`                              | Malformed source block.                       | Use letters, digits and underscores for names.                          |
| `<source> names a fact no rule references`                                                   | A source no rule reads.                       | Use it in a rule, or remove it.                                         |
| `<source> is contradictory: '<fact>' also has a boundSignals entry`                          | A fact is both bound and sourced.             | Keep one.                                                               |
| `<source>.source must be ... such as "orders-system"`                                        | Bad source name.                              | Lower-case letters, digits and hyphens.                                 |
| `<source>.claim must be a non-empty string of at most 200 characters`                        | Empty or long claim.                          | Shorten or fill it in.                                                  |
| `<source>.subject must be "target" or a dot-path...`                                         | Wrong subject.                                | Use `target` or `parameters.<name>`.                                    |
| `<source>.maxAgeSeconds must be a whole number of seconds from 1 to 86400`                   | Out of range.                                 | Use 1 to 86400.                                                         |
| `<source>.parameters must be a list of at most 16 ...` / `names '<name>' twice`              | Too many or repeated names.                   | Keep at most 16, unique.                                                |
| `approves without a signed human approval`                                                   | An approve rule with no approval fact.        | Section 5.                                                              |

## 7. Worked example

This example follows section 4's order. It was validated with `PolicyValidator.validate`. It is a draft, not in effect, and it is not a policy in `policies/`. Its version is a placeholder.

```json
{
  "policyId": "razorpay-refund",
  "policyVersion": "2.0.0-draft",
  "schemaVersion": "1.0.0",
  "description": "Draft, not in effect. Order: refuse when Razorpay says the payment is not refundable; approve when Razorpay confirms it and a signed manager approval covers the exact amount (tier 2); reject otherwise. The caller cannot declare any fact.",
  "signalsSchema": {
    "paymentRefundable": "boolean",
    "managerApproved": "boolean",
    "refundAmount": "number"
  },
  "boundSignals": {
    "refundAmount": "parameters.amount"
  },
  "signalSources": {
    "paymentRefundable": {
      "source": "razorpay",
      "claim": "payment.refundable",
      "subject": "target",
      "maxAgeSeconds": 60,
      "parameters": ["amount"]
    }
  },
  "approvalSignals": {
    "managerApproved": {
      "resourceId": "target",
      "value": "parameters.amount"
    }
  },
  "rules": [
    {
      "id": "refuse-not-refundable",
      "condition": { "fact": "paymentRefundable", "operator": "is_false" },
      "outcome": {
        "action": "reject",
        "reason": "Refund refused. Razorpay does not confirm the payment is refundable for this amount."
      }
    },
    {
      "id": "tier-2-with-exact-approval",
      "condition": {
        "all": [
          { "fact": "paymentRefundable", "operator": "is_true" },
          { "fact": "managerApproved", "operator": "is_true" }
        ]
      },
      "outcome": {
        "action": "approve",
        "reason": "Tier 2: Razorpay confirms the payment is refundable, and a signed manager approval covers this exact amount."
      }
    },
    {
      "id": "reject-by-default",
      "condition": { "always": true },
      "outcome": {
        "action": "reject",
        "reason": "Refund refused. Neither tier applies."
      }
    }
  ]
}
```

Why each part is there:

- `refuse-not-refundable` is first, so a source that says no always wins.
- `paymentRefundable` is sourced, so Razorpay answers it, and the caller cannot declare it.
- `managerApproved` is an approval, so only a signed approval covering this payment and amount makes it true.
- `refundAmount` is bound to `parameters.amount`, so the amount checked is the amount executed.
- `reject-by-default` catches the rest.

Tier 1 is not in the example, because the validator does not allow it (section 4).

## 8. Checking a policy before proposing it

1. Save the file under `policies/<policyId>/<version>/policy.json`, or in a scratch folder.
2. Validate it with `PolicyValidator.validate` from `@parmana/policy`. It throws with the first problem it finds. Fix it, and validate again.
3. Run the policy package's tests.
4. Check the approve rules (section 5), and check the policy covers each refusal you intend.
5. Propose it through maker-checker (`production-integration-guide.md`, step 3).

## 9. Related documents

- `docs/internal/design/NEW-SYSTEM-DESIGN.md`: the tiers, the review model and the approval design.
- `docs/internal/design/POLICY-V2-SPEC.md`: the policy language version 2.
- `docs/ASSURANCE_DECISIONS.md`: owner decisions, including D14 to D23 for `razorpay:refund`.
- `docs/internal/designs/VENDOR-CODE-MOVE-PLAN.md`: the plan for vendor code and identifiers.
