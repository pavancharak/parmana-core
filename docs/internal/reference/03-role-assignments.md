# Role assignments (register)

> **REFERENCE ONLY. NOT A REAL RECORD.** This document is a reference. It is not a decision, an approval, a register entry, or a test result. Values marked ASSUMED are working assumptions, and nothing here enables a capability. Do not cite this document as evidence of any decision or approval.

**Status:** reference. Names are as the owner gave them. Each grant is still approved in the register; the approval columns stay blank until that is done.
**Granted by:** the Parmana owner (roles are granted by the Parmana owner, per the register code).

| Person   | Roles to grant           | Why                                       | Approved by | Date |
| -------- | ------------------------ | ----------------------------------------- | ----------- | ---- |
| Mohinder | `action-owner`           | Owner of `crm:read` and `erp:invoice-pay` |             |      |
| Pavan    | `action-owner`           | Successor of both actions                 |             |      |
| Asha     | `gate-owner`, `operator` | Runs the go-live gate                     |             |      |
| Mamta    | `gate-owner`, `operator` | Runs the go-live gate                     |             |      |
| Shalini  | `reviewer`               | Reviews cases both actions send to review |             |      |
| Mahendra | `reviewer`               | Reviews cases both actions send to review |             |      |

## Rules this table must satisfy

- A `gate-owner` must also hold `operator`.
- The owner and successor of an action cannot run its go-live gate.
- Reviewers cannot be the owner or successor of the action they review.
- Grants are made with `POST /roles/grant`; revocations with `POST /roles/revoke`. Check the required role for each route in its handler.

## Check before the gate runs

- `GET /actions/{capability}/go-live` lists any gate owner who lacks `operator`, and any missing reviewer.
