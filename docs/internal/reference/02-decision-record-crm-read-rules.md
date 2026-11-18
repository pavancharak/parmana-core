# Decision: the rules for `crm:read`

- **Reference:** D-CRM-01
- **Source:** `CRM-READ-ENABLEMENT.md` section 1; `POLICY-V2-SOURCE-INTEGRATION.md` section 6
- **Date recorded:** 2026-11-18 (working assumption; owner decision pending)
- **Owner:** Mohinder

## Question

Who may read a customer record through `crm:read`, and which fields may they see?

## Options considered

1. Only the named account owner (recommended in the draft).
2. The account owner and their manager.
3. Any authenticated member of the sales team.

## Recommendation

Option 1, with name and contact details only. It is the narrowest rule, every read is logged, and it needs no sourced value.

## Owner decision

**Working assumption (ASSUMED): option 1 is adopted for reference.** The owner's own decision is still to be recorded in their words.

## Effect on the documents

| Document                 | Change                        |
| ------------------------ | ----------------------------- |
| `01-crm-read-policy.md`  | Rules updated to the decision |
| `CRM-READ-ENABLEMENT.md` | Section 1 marked confirmed    |

## Not changed by this decision

Policy version 2 validator rules, the go-live gate, and the three gates in `POLICY-V2-ENABLEMENT.md`.
