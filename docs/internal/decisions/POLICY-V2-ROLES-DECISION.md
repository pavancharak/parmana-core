# Decision: roles that propose and approve policy versions

- **Reference:** Policy v2 decision PV2-1
- **Source:** [POLICY-V2-REGISTER-API.md](../design/POLICY-V2-REGISTER-API.md), section "Policy versions". The design in [CONSOLIDATED-DESIGN-AND-DECISIONS.md](../design/CONSOLIDATED-DESIGN-AND-DECISIONS.md), section 5.
- **Date recorded:** 2026-11-17
- **Owner:** Pavan Charak

## Question

Who proposes a policy version, and who approves it? The design says a policy change is a new version approved through maker-checker, and does not name the roles.

## Options considered

1. The action owner proposes. A second approver approves. The Parmana owner also approves when the policy reads a source that can approve, or an intermediary.
2. Any caller with the policy-author role proposes, with a separate role for approval. This adds a role the design does not have.

## Recommendation

Option 1. The action owner already owns the rules for the action, so no new role is needed. The second approver follows the separation used for sources and approver keys. The Parmana owner signs off where authority grows, which is the same rule sources use.

## Owner decision

"Yes, go with the roles as I built them."

## Effect on the documents

| Document                  | Change                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| POLICY-V2-REGISTER-API.md | The roles are stated as decided, with the confirmation date. The open-for-confirmation wording is removed. |
| This record               | New. Records the decision and its source.                                                                  |

## Not changed by this decision

- The gate-owner rules: the action's owner and successor may not run its gate, and the gate needs two gate owners. The owner did not change these.
- Whether the gate owner must sit in Operations. That question is still open, and the register does not record Operations membership.
- The maker-checker principle itself, which the design already sets.
