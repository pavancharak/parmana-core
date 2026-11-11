# New documentation, November 2026

This folder holds every document written in November 2026. Add new documents here as they are written.

## Threat model and deployment limits

- `THREAT-MODEL.md`, section 9: the limits outside Parmana's controls, and the limits the project states about itself. It stays at the repository root, because it is the threat model itself.
- `docs/internal/new-docs-2026-11/guides/AGENT-DEPLOYMENT-LIMITS.md`: operator steps for inventory, prompt injection, egress and approval quality.

## Proposals (RFCs)

- `docs/internal/new-docs-2026-11/rfcs/RFC-0027-Approval-Parameter-Binding.md`: bind each approval to a hash of every parameter. Status: Proposed.
- `docs/internal/new-docs-2026-11/rfcs/RFC-0028-Core-Holds-No-Vendor-Secrets.md`: core holds no vendor credentials, with deployment tiers and the status of each item. Status: Proposed.
- `docs/internal/new-docs-2026-11/rfcs/RFC-0029-Adoption-Refactor.md`: make Parmana easier to adopt, starting with a developer's first integration. Status: Proposed.

## Evaluation

- `docs/internal/new-docs-2026-11/evaluation/adoption-baseline.md`: protocol for the adoption baseline test, and a pre-read of the public quickstart. Status: protocol ready, baseline not yet run.

## Engineering changes (not documentation, listed for reference)

- `tests/architecture/core-holds-no-vendor-credentials.test.ts`: fails the build if core reads a vendor credential variable.
- Hook, database-check and Vercel changes: `scripts/git-hooks/`, `scripts/db-check.mjs`, `vercel.json`.
- The repair of changes lost on `main`: `THREAT-MODEL.md` section 9, the hooks, the migrations and the signing script.
