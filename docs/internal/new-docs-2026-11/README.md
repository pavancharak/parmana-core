# New documentation, November 2026

This folder indexes every document written in November 2026. The documents themselves stay at their existing
paths, so that RFC numbering, the threat-model links and the RFC index keep working. Add new documents here as
they are written.

## Threat model and deployment limits

- `THREAT-MODEL.md`, section 9: the limits outside Parmana's controls, and the limits the project states about
  itself. Path: repository root. Branch: `claude/focused-lamport-8156l7` (PR #563).
- `docs/internal/guides/AGENT-DEPLOYMENT-LIMITS.md`: operator steps for inventory, prompt injection, egress and
  approval quality. Branch: `claude/focused-lamport-8156l7` (PR #563).

## Proposals (RFCs)

- `docs/internal/rfcs/RFC-0027-Approval-Parameter-Binding.md`: bind each approval to a hash of every parameter.
  Status: Proposed. Branch: `claude/focused-lamport-8156l7` (PR #563).
- `docs/internal/rfcs/RFC-0028-Core-Holds-No-Vendor-Secrets.md`: core holds no vendor credentials, with deployment
  tiers and the current status of each item. Status: Proposed. Branch: `claude/focused-lamport-8156l7` (PR #563).
- `docs/internal/rfcs/RFC-0029-Adoption-Refactor.md`: make Parmana easier to adopt, starting with a developer's
  first integration. Status: Proposed. Branch: `docs/adoption-refactor`.

## Evaluation

- `docs/internal/evaluation/adoption-baseline.md`: protocol for the adoption baseline test, and a pre-read of the
  public quickstart. Status: protocol ready, baseline not yet run. Branch: `docs/adoption-refactor`.

## Engineering changes (not documentation, listed for reference)

- `tests/architecture/core-holds-no-vendor-credentials.test.ts`: fails the build if core reads a vendor credential
  variable. Branch: `claude/focused-lamport-8156l7` (PR #563).
- `scripts/db-check.mjs` and the hook changes in `scripts/git-hooks/`, plus `vercel.json`: local database readiness
  check, the per-push preflight, automatic sign-off, and skipping Vercel builds for internal docs. Branch:
  `fix/local-test-database`.

## Until the branches merge

Pull request #563 holds most of the documents above. `docs/adoption-refactor` and `fix/local-test-database` are
separate branches, which should be merged after #563 is reviewed.
