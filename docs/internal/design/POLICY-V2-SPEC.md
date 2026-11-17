# Policy schema version 2: generic specification

Status: proposed for finalisation. Covers decisions D10, D13, D14 and D16 to D19 in the plan. Not yet built. This specification does not depend on any existing policy. It applies to any business system.

## 1. Purpose

A policy decides whether one action on one target may proceed. It applies to any business system: payments, vendor onboarding, deployments, access, document release, loan disbursement, or anything else.

A policy must say:

- where each value it uses must come from,
- which values may approve an action, and which may only refuse or route it,
- the order in which its rules are checked,
- the limits it uses, and who owns and approves each one.

The validator must be able to check all of this before the policy runs. Nothing in the format assumes a particular domain.

## 2. Top-level fields

| Field           | Required | Meaning                                                                                                                                       |
| --------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `policyId`      | yes      | Name of the policy, for example `vendor-payment`.                                                                                             |
| `policyVersion` | yes      | Semantic version of this policy.                                                                                                              |
| `schemaVersion` | yes      | `2.0.0` for this format.                                                                                                                      |
| `capability`    | yes      | The action this policy decides, named as `<system>:<action>`, for example `erp:pay-invoice`.                                                  |
| `description`   | yes      | Plain statement of what the policy authorises and what it does not.                                                                           |
| `owner`         | yes      | The named action owner, from the register in plan section 15.                                                                                 |
| `signals`       | yes      | Every value the rules use, with its declaration (section 3).                                                                                  |
| `thresholds`    | no       | Named limits (section 4). Every number used in a rule is one of these, except zero.                                                           |
| `review`        | no       | Review window and approval validity for this action, within the platform caps (D11). Required if the policy has any `review` or `tier2` rule. |
| `rules`         | yes      | Ordered rules, each with an explicit `tier` (section 5).                                                                                      |

## 3. Signal declarations

Every value a rule reads must be declared in `signals`. Each declaration has a `provenance`:

| Provenance  | Meaning                                                                                  | Required fields                                                                                                                                                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sourced`   | A registered business system establishes the value. Trusted only if signed and verified. | `source` (registered name), `claim` (registered name), `subject` (the Intent path that identifies the object), `maxAgeSeconds`, `unit` for numbers. The policy names the data owner's source. The register names the signer, which may be an intermediary (D8), and each decision records both. |
| `approved`  | A verified, signed human approval. Trusted only when verified.                           | `approvalFor` (the resource and the value it must match), `scope` (`exact` only).                                                                                                                                                                                                               |
| `ai`        | Produced by a model. Untrusted.                                                          | `model`, `values` (a closed set), `permittedUse` (`refuse` or `review`).                                                                                                                                                                                                                        |
| `untrusted` | Supplied by the caller. Untrusted.                                                       | `unit` for numbers. Permitted uses: refuse or review.                                                                                                                                                                                                                                           |

Common fields: `type`, one of `boolean`, `number`, `string`, `enum`, `approval`.

Trust is derived from `provenance`. A value is trusted only when its provenance is `sourced` or `approved`. The Intent is never a source of trust. A value that must agree with the Intent is declared `untrusted`, and the platform checks the agreement (section 8).

## 4. Thresholds

Each threshold is a named constant with its unit, owner, approver and reason:

```json
"thresholds": {
  "automaticLimit": {
    "value": 10000,
    "unit": "<unit>",
    "owner": "<action owner, plan 15c>",
    "approvedBy": "<second approver, plan 15c>",
    "reason": "Requests up to this value are automated after all trusted checks pass.",
    "nextReview": "<date>"
  }
}
```

A rule refers to a threshold by name, never by a number. A change to a threshold is a new policy version. A threshold used in a `tier1` rule must have `approvedBy`. Every threshold has a second approver, a reason and a review date. A threshold that gates large amounts or high-risk actions also needs the risk function's approval. A standing group (the action owner, the risk function and a second approver) reviews thresholds on a schedule (D9).

## 5. Rules and tiers

Each rule has:

- `id`: a name that describes the rule.
- `tier`: one of `refuse`, `review`, `tier1`, `tier2`, `reject`.
- `when`: a condition, using the operators from version 1. The right-hand side is a constant from the allowed set (check 14) or a threshold reference `{ "threshold": "<name>" }`. It is never another signal.
- `outcome`: `{ "action": "approve" | "reject" | "review", "reason": "..." }`.

Rules are evaluated in the order listed, and the first match decides. Tiers must appear in this order and never go backwards:

1. `refuse`: a trusted value says no, or a required trusted value is missing.
2. `review`: an untrusted value would change the outcome.
3. `tier1`: automatic approval. Reads only `sourced` values, and stays within thresholds.
4. `tier2`: approval that needs a verified approval for the exact value.
5. `reject`: one catch-all rule, always last.

A `review` outcome does not end in the decision record. It opens a review record, which is a separate record type with its own lifecycle (opened, assigned, decided or expired). The review record refers to the decision that opened it. The final approval or refusal is a further separate record that refers back to the review (D7).

Review settings (section 2, `review`) are set per action within platform caps: a review window of at most three business days, and an approval validity of at most 60 minutes. A new action starts at the shortest values, and a longer value needs a recorded reason (D11).

## 6. Examples in two domains

The same format is used in each. The names differ, and the structure does not.

### 6a. Vendor payment (procurement system)

```json
{
  "policyId": "vendor-payment",
  "policyVersion": "2.0.0",
  "schemaVersion": "2.0.0",
  "capability": "erp:pay-invoice",
  "description": "Pays an approved invoice to a verified vendor when the ledger has the funds. Payments above the automatic limit need a finance approver's signed approval for the exact amount. A caller's risk score can refuse or route a payment, never approve it.",
  "owner": "<finance action owner>",

  "signals": {
    "invoiceAmount": {
      "type": "number",
      "provenance": "sourced",
      "source": "procurement-system",
      "claim": "invoice.amount",
      "subject": "target",
      "maxAgeSeconds": 60,
      "unit": "<currency>"
    },
    "vendorVerified": {
      "type": "boolean",
      "provenance": "sourced",
      "source": "vendor-master",
      "claim": "vendor.verified",
      "subject": "parameters.vendorId",
      "maxAgeSeconds": 300
    },
    "fundsAvailable": {
      "type": "boolean",
      "provenance": "sourced",
      "source": "ledger",
      "claim": "funds.available",
      "subject": "parameters.accountId",
      "maxAgeSeconds": 60
    },
    "financeApproval": {
      "type": "approval",
      "provenance": "approved",
      "approvalFor": { "resourceId": "target", "value": "invoiceAmount" },
      "scope": "exact"
    },
    "requestedAmount": {
      "type": "number",
      "provenance": "untrusted",
      "unit": "<currency>"
    },
    "riskScore": {
      "type": "number",
      "provenance": "untrusted",
      "unit": "points"
    }
  },

  "thresholds": {
    "automaticLimit": {
      "value": 5000,
      "unit": "<currency>",
      "owner": "<finance action owner>",
      "approvedBy": "<second approver>",
      "reason": "Payments up to this value are automated after trusted checks pass.",
      "nextReview": "<date>"
    },
    "reviewRiskScoreAbove": {
      "value": 80,
      "unit": "points",
      "owner": "<risk owner>",
      "approvedBy": "<second approver>",
      "reason": "A caller risk score above this needs a person to check the payment.",
      "nextReview": "<date>"
    }
  },

  "rules": [
    {
      "id": "refuse-vendor-not-verified",
      "tier": "refuse",
      "when": { "fact": "vendorVerified", "operator": "is_false" },
      "outcome": {
        "action": "reject",
        "reason": "The vendor master does not verify this vendor."
      }
    },
    {
      "id": "refuse-no-funds",
      "tier": "refuse",
      "when": { "fact": "fundsAvailable", "operator": "is_false" },
      "outcome": {
        "action": "reject",
        "reason": "The ledger does not show enough funds."
      }
    },
    {
      "id": "review-high-risk-score",
      "tier": "review",
      "when": {
        "fact": "riskScore",
        "operator": "gt",
        "value": { "threshold": "reviewRiskScoreAbove" }
      },
      "outcome": {
        "action": "review",
        "reason": "The caller's risk score is high. A person should check the payment."
      }
    },
    {
      "id": "tier1-automatic-payment",
      "tier": "tier1",
      "when": {
        "all": [
          { "fact": "vendorVerified", "operator": "is_true" },
          { "fact": "fundsAvailable", "operator": "is_true" },
          {
            "fact": "invoiceAmount",
            "operator": "lte",
            "value": { "threshold": "automaticLimit" }
          }
        ]
      },
      "outcome": {
        "action": "approve",
        "reason": "Every check was confirmed by a trusted source, and the amount is within the automatic limit."
      }
    },
    {
      "id": "tier2-finance-approved-payment",
      "tier": "tier2",
      "when": {
        "all": [
          { "fact": "vendorVerified", "operator": "is_true" },
          { "fact": "fundsAvailable", "operator": "is_true" },
          { "fact": "financeApproval", "operator": "is_true" }
        ]
      },
      "outcome": {
        "action": "approve",
        "reason": "Every check was confirmed by a trusted source, and a finance approver approved this exact amount."
      }
    },
    {
      "id": "reject-default",
      "tier": "reject",
      "when": { "always": true },
      "outcome": {
        "action": "reject",
        "reason": "The payment does not meet the policy. Human approval or review is needed."
      }
    }
  ]
}
```

### 6b. Production deployment (change-management system)

```json
{
  "policyId": "production-deployment",
  "policyVersion": "2.0.0",
  "schemaVersion": "2.0.0",
  "capability": "deploy:release-to-production",
  "description": "Releases a change to production when the change system confirms an approved change, the release is inside the maintenance window, and the rollback plan is confirmed. Other deployments need an approval from the service owner for that exact change.",
  "owner": "<platform action owner>",

  "signals": {
    "changeApproved": {
      "type": "boolean",
      "provenance": "sourced",
      "source": "change-system",
      "claim": "change.approved",
      "subject": "target",
      "maxAgeSeconds": 300
    },
    "inMaintenanceWindow": {
      "type": "boolean",
      "provenance": "sourced",
      "source": "change-calendar",
      "claim": "window.open",
      "subject": "parameters.service",
      "maxAgeSeconds": 60
    },
    "rollbackVerified": {
      "type": "boolean",
      "provenance": "sourced",
      "source": "release-system",
      "claim": "rollback.verified",
      "subject": "target",
      "maxAgeSeconds": 300
    },
    "serviceOwnerApproval": {
      "type": "approval",
      "provenance": "approved",
      "approvalFor": { "resourceId": "target", "value": "parameters.changeId" },
      "scope": "exact"
    },
    "blastRadius": {
      "type": "number",
      "provenance": "untrusted",
      "unit": "services"
    },
    "assistantRiskNote": {
      "type": "enum",
      "provenance": "ai",
      "model": "change-risk-classifier",
      "values": ["low", "medium", "high"],
      "permittedUse": ["review"]
    }
  },

  "thresholds": {
    "automaticBlastRadius": {
      "value": 1,
      "unit": "services",
      "owner": "<platform action owner>",
      "approvedBy": "<second approver>",
      "reason": "Changes touching at most this many services are automated after trusted checks pass.",
      "nextReview": "<date>"
    }
  },

  "rules": [
    {
      "id": "refuse-change-not-approved",
      "tier": "refuse",
      "when": { "fact": "changeApproved", "operator": "is_false" },
      "outcome": {
        "action": "reject",
        "reason": "The change system has no approval for this change."
      }
    },
    {
      "id": "refuse-outside-window",
      "tier": "refuse",
      "when": { "fact": "inMaintenanceWindow", "operator": "is_false" },
      "outcome": {
        "action": "reject",
        "reason": "The release falls outside the maintenance window."
      }
    },
    {
      "id": "review-high-risk-note",
      "tier": "review",
      "when": {
        "fact": "assistantRiskNote",
        "operator": "eq",
        "value": "high"
      },
      "outcome": {
        "action": "review",
        "reason": "The risk classifier flagged this change as high risk. A person should check it."
      }
    },
    {
      "id": "tier1-small-change",
      "tier": "tier1",
      "when": {
        "all": [
          { "fact": "changeApproved", "operator": "is_true" },
          { "fact": "inMaintenanceWindow", "operator": "is_true" },
          { "fact": "rollbackVerified", "operator": "is_true" },
          {
            "fact": "blastRadius",
            "operator": "lte",
            "value": { "threshold": "automaticBlastRadius" }
          }
        ]
      },
      "outcome": {
        "action": "approve",
        "reason": "The change is approved, inside the window, rollback is verified, and the change touches few services."
      }
    },
    {
      "id": "tier2-owner-approved-change",
      "tier": "tier2",
      "when": {
        "all": [
          { "fact": "changeApproved", "operator": "is_true" },
          { "fact": "inMaintenanceWindow", "operator": "is_true" },
          { "fact": "rollbackVerified", "operator": "is_true" },
          { "fact": "serviceOwnerApproval", "operator": "is_true" }
        ]
      },
      "outcome": {
        "action": "approve",
        "reason": "The change is approved and inside the window, rollback is verified, and the service owner approved this change."
      }
    },
    {
      "id": "reject-default",
      "tier": "reject",
      "when": { "always": true },
      "outcome": {
        "action": "reject",
        "reason": "The release does not meet the policy. Human approval or review is needed."
      }
    }
  ]
}
```

What the two examples show:

- The same tiers, refuse, review, tier 1, tier 2 and reject, in both.
- Every approval is exact (for example, the approved amount, or the approved change ID).
- Untrusted values (the caller's amount or the caller's blast-radius estimate) never reach tier 1.
- The AI classifier can only route to review.
- Limits are named thresholds with owners.

## 7. Validator checks (load time and proposal time)

1. Every value a rule reads is declared in `signals`.
2. `capability` is present and follows the `<system>:<action>` form.
3. Every `tier` value is one of the five, and rules appear in non-decreasing tier order.
4. Exactly one rule has tier `reject`, last, with `when: always`.
5. `tier1` rules read only `sourced` values. `refuse`, `review` and `reject` rules may read any value.
6. `tier2` rules may read `sourced` and `approved` values. Every `approved` value they read must be required `is_true`.
7. `approve` outcomes appear only in `tier1` and `tier2` rules.
8. Every `approved` value has `approvalFor` and `scope: exact`.
9. Every `sourced` value has `source`, `claim`, `subject` and `maxAgeSeconds`. The source and claim are registered, signed and not revoked (plan Phase 2).
10. Every `ai` value has a closed `values` list and a `permittedUse` that excludes `approve`.
11. Every threshold a rule uses exists, and has `unit`, `owner`, `reason`, `nextReview`, and `approvedBy` if it is used in a `tier1` rule.
12. Thresholds are constants. A rule cannot contain a literal threshold value.
13. Every `reason` is present and non-empty.
14. **No comparison between two values.** The right-hand side of every condition is a constant or a threshold reference, never another signal (D16).
15. **No literal numbers in rules** except zero (D18). Any other number must be a threshold reference. Booleans and declared enumeration values are allowed.
16. **Units match.** A comparison may involve only a value and a threshold with the same unit (D17). A number with no unit is refused.
17. **Sources and claims are registered** in the source register and referenced by their registered names (D19).
18. **Review settings are within the caps.** A review window above three business days, or an approval validity above 60 minutes, is refused. A policy with a `review` or `tier2` rule must declare `review` settings (D11).
19. **Each sourced value names a data owner's source.** The register must show a signer for that source. An intermediary signer must be registered with a named operator and a review date (D8).
20. **No placeholders in an approved policy.** Owner names, approvers, threshold values, units, dates and model names written as `<angle-brackets>` are placeholders. A policy or register entry that contains one cannot be approved or used for decisions, and the refusal names the placeholder.

A policy that fails any check is refused at load and at maker-checker proposal, naming the rule and the check.

## 8. Agreement with the caller's values is the platform's job

When a caller proposes a value for something a business system also establishes, the platform compares the two once, in `TrustedSignalResolver`. A disagreement is refused as INVALID before any rule runs (D16). The check applies to any sourced value, in any domain. Policies do not write this comparison.

## 9. Decision record

The decision already records the policy hash and the matched rule id (plan D13). The tier is read from the rule's `tier` field in that policy version. No change to the record format is needed (plan D6).

## 10. Versioning

- Each policy has a `policyVersion`. A change to a policy is a new version, approved through maker-checker.
- A decision names the policy version and its hash, so the rules that applied can always be identified.
- A policy can be used for decisions only after its action has passed the go-live gate: owner, thresholds, sources and review path recorded in the register and tested (plan 4.11).
- Each review window and approval validity is a value set by the action owner, within the platform caps. A change to either needs a second approver (plan 4.11).
- Each intermediary signer is named in the register with its operating team, and is reviewed yearly (plan 4.11).
- Decisions in the plan and spec are confirmed only through a dated decision record kept by the Parmana owner. A changed decision is recorded as a new decision (plan 4.11).

## 11. Tests

- Each example in section 6 passes the validator.
- A `tier1` rule reading an `untrusted` value fails check 5.
- A `tier2` rule reading an `approved` value without `is_true` fails check 6.
- An `approve` outcome in a `refuse` rule fails check 7.
- A `tier1` rule reading an `ai` value fails check 5.
- A `tier1` threshold without `approvedBy` fails check 11.
- Rules out of tier order fail check 3. Two `reject` rules, or a `reject` not last, fail check 4.
- A literal threshold value in a rule fails check 12.
- A rule comparing two signals fails check 14.
- A rule using the number `80` instead of a threshold fails check 15. The number `0` passes.
- A rule comparing a value in one unit with a threshold in another unit fails check 16.
- A source or claim that is not registered fails check 17.
- A caller value that disagrees with the sourced value is refused as INVALID by the platform, even when the rules would approve (section 8).
- A review window of four business days is refused by check 18.
- An approval validity of 90 minutes is refused by check 18.
- A sourced value whose source has an intermediary signer with no named operator fails check 19.
- A `review` outcome produces a review record that refers to the decision that opened it.

## 12. Decisions

| ID  | Decision                                                                                                              | Status                                           |
| --- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| D16 | Rules never compare two values. Agreement with a sourced value is a platform check.                                   | Recommended long-term answer (not yet confirmed) |
| D17 | Every numeric value and threshold declares a unit. Comparisons need matching units. Sources state their units.        | Recommended long-term answer (not yet confirmed) |
| D18 | Every number in a rule is a named threshold, except zero.                                                             | Recommended long-term answer (not yet confirmed) |
| D19 | Sourced values name a registered source and claim, checked at load time.                                              | Recommended long-term answer (not yet confirmed) |
| D7  | REVIEW is its own record type, which refers to the decision that opened it.                                           | Recommended long-term answer (not yet confirmed) |
| D8  | An intermediary may be the signer for a source that cannot sign. The data owner stays accountable. Both are recorded. | Recommended long-term answer (not yet confirmed) |
| D9  | Thresholds are set by the business, with a second approver, reason and review date. A standing group reviews them.    | Recommended long-term answer (not yet confirmed) |
| D11 | Review windows and approval validity are set per action, within caps of three business days and 60 minutes.           | Recommended long-term answer (not yet confirmed) |

## 13. Open points

1. **Names and placeholders.** Source names, claims, owners, thresholds, units and dates in the examples are placeholders. They become real when the registers in plan section 15 are filled in.
2. **Choice of domains.** The two examples are illustrations. Each business system needs its own policy, with its own capability and owner.
3. **Threshold values** are placeholders until the owners set them (plan D9).
