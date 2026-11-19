# Draft policy for `razorpay:refund`, written from the rule

> **Status: DRAFT. Not in effect, not in `policies/`.** Nothing here authorizes anything. It goes to the owner for review, then through maker-checker if approved. It was written from the rule in `CAPABILITY-BINDING-PERMANENT-FIX.md` and from the policy schema (`packages/policy/src/types/Policy.ts`) and validator, without reference to the existing policy files in `policies/`.

## 1. The rule the draft follows

Every approve rule must require at least one fact the caller cannot declare: a signed approval (`approvalSignals`, checked with `is_true`) or a fact a source answers (`signalSources`). The validator enforces this for approve rules, and the G-77 guard checks it per bound capability.

## 2. What the draft says

The tiers in `docs/internal/design/NEW-SYSTEM-DESIGN.md` are refuse, review, tier 1, tier 2 and reject, in that order. The draft writes these rules, in order:

1. **Refuse** when Razorpay says the payment is not refundable (`paymentRefundable` is false).
2. **Tier 2** approves when Razorpay confirms the payment is refundable and a signed manager approval covers the exact amount.
3. **Reject** in every other case, with a reason.

**Tier 1 is not written.** Tier 1 means approving without a human, once every value is sourced, verified and within its threshold. The current validator refuses any approve rule that does not require a signed approval, so tier 1 cannot be written as the design describes until that validator rule changes. This is a conflict between the design and the code, and it needs an owner decision (see section 4).

The refund amount is bound to the Intent's `parameters.amount`, so the amount checked is the amount executed. The draft passes `PolicyValidator.validate`.

## 3. The draft (JSON)

```json
{
  "policyId": "razorpay-refund",
  "policyVersion": "2.0.0-draft",
  "schemaVersion": "1.0.0",
  "description": "Draft, not in effect. Order: refuse when Razorpay says the payment is not refundable; approve when Razorpay confirms it and a signed manager approval covers the exact amount (tier 2); reject otherwise. The caller cannot declare any fact. Tier 1 (automatic approval within a threshold) is not written: the validator requires every approve rule to need a signed approval.",
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
      "condition": {
        "fact": "paymentRefundable",
        "operator": "is_false"
      },
      "outcome": {
        "action": "reject",
        "reason": "Refund refused. Razorpay does not confirm the payment is refundable for this amount."
      }
    },
    {
      "id": "tier-2-with-exact-approval",
      "condition": {
        "all": [
          {
            "fact": "paymentRefundable",
            "operator": "is_true"
          },
          {
            "fact": "managerApproved",
            "operator": "is_true"
          }
        ]
      },
      "outcome": {
        "action": "approve",
        "reason": "Tier 2: Razorpay confirms the payment is refundable, and a signed manager approval covers this exact amount."
      }
    },
    {
      "id": "reject-by-default",
      "condition": {
        "always": true
      },
      "outcome": {
        "action": "reject",
        "reason": "Refund refused. Neither tier applies."
      }
    }
  ]
}
```
