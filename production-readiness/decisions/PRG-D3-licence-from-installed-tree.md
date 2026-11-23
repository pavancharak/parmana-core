# Decision: check licences from the installed tree; pin the engine to 1c4893b

- **Reference:** PRG-D3
- **Source:** Pull request #768; the G4 failure on evidence bb492e0 (7 packages "not installed")
- **Date recorded:** 2026-11-22
- **Owner:** Pavan Charak

## Question

G4's licence check read `package-lock.json`. That file lists packages npm does not install on
the CI runner (musl and wasm builds), so the check failed on packages that were never installed.
The policy says "installed production dependencies". What should the check read, and how does the
fix reach CI?

## Options considered

1. Keep reading `package-lock.json` and exclude packages by platform. This needs a platform rule
   that has to be kept right for every package.
2. Read `node_modules/.package-lock.json`, the tree npm actually installed. This matches the
   policy's wording and needs no platform rule.
3. Remove the licence check. Rejected: it is a real control.

## Recommendation

Option 2. It is the source of truth for "installed", and a package npm did not install is out of
scope by construction. A missing installed tree fails the check, and so does an installed package
without a readable `package.json`.

## Owner decision

Requested by Pavan Charak ("Can't we fix it"), 2026-11-22: option 2. The pin moves to
`1c4893bac5bc2cdfc47e014edbcaee348d99f27f`, the commit that adds the installed-tree check and its tests. The policy is unchanged.

## Effect on the documents

| Document                                            | Change                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `production-readiness/scripts/evaluate-gates.py`    | G4.licences reads `node_modules/.package-lock.json`. The platform rule is removed. |
| `production-readiness/tests/test_evaluate_gates.py` | Licence tests rewritten for the installed tree.                                    |
| `.github/workflows/production-readiness.yml`        | `ENGINE_SHA` is `1c4893bac5bc2cdfc47e014edbcaee348d99f27f`.                        |
| `docs/PRODUCTION_READINESS.md`                      | G4.licences described as the installed tree.                                       |

## Correction

The first pin used the short SHA `1c4893b`. actions/checkout treats a ref as a branch or tag name, so the gate job failed three times before it ran. The pin is now the full SHA. Found on pull request #768, 2026-11-22.

## Not changed by this decision

- The denied licences, the other G4 checks and the strict rules.
- Pin changes still need a decision record and owner approval.
