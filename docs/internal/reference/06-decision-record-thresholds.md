# Decision: thresholds for `erp:invoice-pay`

> **REFERENCE ONLY. NOT A REAL RECORD.** This document is a reference. It is not a decision, an approval, a register entry, or a test result. Values marked ASSUMED are working assumptions, and nothing here enables a capability. Do not cite this document as evidence of any decision or approval.

- **Reference:** D-INV-01
- **Source:** `05-erp-invoice-pay-business-rules.md`
- **Date recorded:** (not yet decided)
- **Owner:** Mohinder

## Question

What are the review threshold and the second-approval threshold for `erp:invoice-pay`, in which currency, and who approves each one?

## Options considered

1. Set both thresholds now, from the business's payment limits.
2. Set only the review threshold now, and the second-approval threshold after the first month of reviews.
3. Start with a low threshold for every payment, and raise it after a review.

## Recommendation

_To be written when the owner has the payment limits._ The draft recommends option 2: it keeps the first month conservative, and a second-approval threshold set from real review data.

## Owner decision

_To be recorded by the owner._

## Effect on the documents

| Document                               | Change                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `05-erp-invoice-pay-business-rules.md` | The values table is filled in                                          |
| The register                           | Each threshold is proposed, approved by the second approver, then used |

## Not changed by this decision

The approval rules of policy version 2, and the go-live gate.
