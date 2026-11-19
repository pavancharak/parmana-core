# Draft policy for `razorpay:refund`, written from the rule

> **Status: DRAFT. Not in effect, not in `policies/`.** Nothing here authorizes anything. It goes to the owner for review, then through maker-checker if approved. It was written from the rule in `CAPABILITY-BINDING-PERMANENT-FIX.md` and from the policy schema (`packages/policy/src/types/Policy.ts`) and validator, without reference to the existing policy files in `policies/`.

## 1. The rule the draft follows

Every approve rule must require at least one fact the caller cannot declare: a signed approval (`approvalSignals`, checked with `is_true`) or a fact a source answers (`signalSources`). The validator enforces this for approve rules, and the G-77 guard checks it per bound capability.

## 2. What the draft says

- Approve only when Razorpay confirms the payment is refundable (`paymentRefundable`, from the `payment.refundable` claim, at most 60 seconds old) and a signed manager approval covers the payment (`managerApproved`).
- Reject in every other case, with a reason.
- The refund amount is bound to the Intent's `parameters.amount`, so the amount checked is the amount executed.
- The validator accepts the draft (`PolicyValidator.validate`).

## 3. The draft (JSON)

````json
{
  "policyId": "razorpay-refund",
  "policyVersion": "2.0.0-draft",
  "schemaVersion": "1.0.0",
  "description": "Draft, not in effect. Authorizes a refund of a Razorpay payment only when Razorpay confirms the payment is refundable for the amount, and a signed manager approval covers that payment. Neither fact can be declared by the caller.",
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
      "parameters": [
        "amount"
      ]
    }
  },
  "approvalSignals": {
    "managerApproved": {
      "resourceId": "target"
    }
  },
  "rules": [
    {
      "id": "approve-refund-when-confirmed-and-approved",
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
        "reason": "Razorpay confirms the payment is refundable for this amount, and a signed manager approval covers it."
      }
    },
    {
      "id": "reject-by-default",
      "condition": {
        "always": true
      },
      "outcome": {
        "action": "reject",
        "reason": "Refund refused. Razorpay did not confirm the payment is refundable for this amount, or no signed manager approval covers it."
      }
    }
  ]
}```

## 4. Open questions for the owner

1. **Version.** The draft says `2.0.0-draft`. The owner chooses the real version and its name.
2. **Approval scope.** The approval signal is bound to `target` (the payment). It does not yet say that the approval must cover the amount. Confirm how `approvalSignals` covers an amount, against the signed approval format, before approval.
3. **Source.** `razorpay` must be registered in parmana-core as a signal source through maker-checker, and the connectors signal (`src/signal/razorpay-payment-signal.ts`) must answer `payment.refundable` for it.
4. **Subject.** `target` is the payment id. Confirm that the `razorpay:refund` target is the payment id.
5. **Freshness.** 60 seconds matches the signal's own validity. Confirm.

## 5. What happens next

If approved: maker-checker proposes the policy, a checker approves it with a step-up signature, the source is registered, and the binding is added to `CANONICAL_CAPABILITY_POLICY_BINDINGS` with the approved version. The G-77 guard then checks it. The steps are in the production integration guide, steps 2 to 5.
````
