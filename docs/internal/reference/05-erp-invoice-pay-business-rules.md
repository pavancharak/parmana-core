# Business rules: `erp:invoice-pay`

**Status:** reference. The rules are the working assumption (**ASSUMED**). Every number and tier is **NOT DECIDED**: they are a business decision for the owner, and no value is assumed here.
**Owner:** Mohinder. **Successor:** Pavan.

## What the rules do (ASSUMED)

1. A payment to a vendor is allowed only when the invoice amount, the vendor identifier and the vendor status are verified (sourced values; see `07`).
2. A payment to a blocked vendor is refused.
3. A payment above the review threshold goes to reviewers.
4. A payment above the approval threshold needs two approvals (the second tier).

## Values to decide

| Item                                            | Value                                                     | Decided by | Date |
| ----------------------------------------------- | --------------------------------------------------------- | ---------- | ---- |
| Review threshold (amount, currency)             | NOT DECIDED                                               |            |      |
| Second-approval threshold (amount, currency)    | NOT DECIDED                                               |            |      |
| Currency handling                               | NOT DECIDED                                               |            |      |
| Tiers used by the policy                        | NOT DECIDED                                               |            |      |
| Whether a blocked vendor is refused or reviewed | NOT DECIDED (draft: refused)                              |            |      |
| What happens when the source is unavailable     | Refused (`SOURCE_UNAVAILABLE`); never approved by default |            |      |

## Notes

- Each threshold is a registered, approved threshold in the register. It is not hard-coded in the policy text. See `06`.
- A rule may compare a value with a threshold, and the only literal number a rule may use is zero (policy version 2 guide).
- A decision never releases a payment. The payment system releases it, and only after the decision is approved.
