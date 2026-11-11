# RFC-0029 — Make Parmana easier to adopt

Status: Proposed. No code changes.

Created: 2026-11-11

Target Version: unset.

Related: RFC-0028 (core holds no vendor credentials), ADR-0018 (connectors outside core), docs/internal/indexes/adr-rfc-index.md.

---

# Summary

Parmana's core flow is short: authorize, verify, execute, record. Adopting it is hard because of what sits
around that flow. The repository exposes 16 packages, a settings file with dozens of interacting variables,
49 database migrations, two signing schemes with two record schema versions, and a contributor workflow that
needs Node 24, Postgres, git hooks and a multi-minute preflight.

This RFC proposes a refactor for adoption. It keeps the security model and the signed records unchanged, and
changes what a new adopter has to learn and configure. The first adopter is a **developer integrating an agent**,
so the first phase is built around that developer's first integration. The work runs in three phases, and each
phase is measured before the next one starts.

# Problem

A developer integrating an agent meets the complexity at four points:

1. **Setup.** The first working server needs a database, key material, an API key and a policy directory.
   The example settings file shows how the settings depend on each other. For example, `DATABASE_URL` is
   required even when `PARMANA_STORAGE=memory`, because some stores read it whatever the storage mode.
2. **Choosing.** Many features are on by default or easy to misconfigure: hybrid signing, schema versions,
   authority grants, signal sources, inbound checks, step-up approvals and the kill switch. A first integration
   does not need most of them.
3. **Reading.** The documentation is large. The internal records (RFCs, ADRs, the gap log) are useful to
   maintainers, and a developer who searches for an answer often lands on them first.
4. **Contributing.** Anyone who builds from source meets the contributor workflow too. During review, a database
   check, a long preflight and a strict sign-off rule each blocked commits that had nothing to do with the change.

# Goals

- A developer reaches a first approved action from the public docs in under 30 minutes, without help.
- The first integration sets no more than four settings, and each one has a default that is safe.
- Optional features are opt-in, with their current behaviour when turned on.
- No check that protects a signed record, an approval or a release is removed.

# Non-goals

- A rewrite. The core flow stays as it is.
- Removing evidence records, signing or verification. They are the product.
- Lowering the security defaults to make setup shorter. A default that is less safe is not a simplification.
- Changing the release format or the policy engine.

# Phases

## Phase 1: a developer's first integration

The developer's path, in order:

1. **Run the server.** One command, `docker compose up`, creates the keys, runs the migrations, seeds a starter
   policy and starts the API. The command already exists in part. The work is to make it the only documented path.
2. **Make the first request.** One SDK call (TypeScript and Python) submits an action the agent wants to take.
   The quickstart shows the request and the response side by side.
3. **Approve it.** The response says the action needs a human approval, and the quickstart shows the approval
   step as a developer meets it: the approver signs with a test key, and the same request then executes.
4. **Read the record.** The quickstart shows the signed record of what was approved and executed, and how a
   developer checks it with the offline verifier.
5. **Use a starter policy.** One policy that covers one action and one approver. Its file is copied into the
   project, and the quickstart explains each field in it.

The settings a first integration needs are listed on one page. Everything else is in the reference. The approver
step is explained where the developer meets it, not in a separate governance guide.

Measured by: the timed walkthrough described below.

## Phase 2: optional features behind configuration

- Group the optional features under named profiles: `basic` (the default), `hybrid-signing`,
  `inbound-authorization`, `governance-advanced`. A profile turns on a set of settings and checks their
  combination at startup, with a clear error when they conflict.
- Each feature keeps its current behaviour when its profile is on. The code does not change; the default changes.
- The reference documentation is organized by profile, so the basic path never shows the advanced settings.

Measured by: the number of settings a `basic` deployment must read, and whether a profile conflict is caught at
startup and not at the first request.

## Phase 3: package consolidation

- Merge packages that are always used together and have no separate consumer. The architecture tests already
  enforce the package boundaries, so they catch a regression in the move.
- Each merge is its own change, with the same tests, and no change to the public API without a version bump.

Measured by: the number of packages a developer must install to run the basic path. This phase is last, because
it is the most expensive and the riskiest for a security product.

# Measurement

Before Phase 1 starts, run this test once:

1. Recruit one developer who has not used Parmana and is integrating an agent. They use only the public documentation.
2. They start a timer and aim for a first approved action: one request that a human approves, after which
   Parmana executes and records it.
3. Record every step where they stop, ask a question, or read something outside the first integration path.
4. Record the total time, the number of settings they changed, and whether they used the offline verifier.

The result is the baseline. Repeat the test after each phase. A phase is complete when its measure improves and
no security test regresses.

# Options considered

**A. Phased refactor, measured at each step. Recommended.** Lowest risk. Each step can be undone. The cost is
time, and the benefit is visible after the first phase.

**B. A new, smaller product beside the current one.** Easier to explain, but it splits the evidence model and
the maintenance. Rejected for now.

**C. Keep the current surface and improve the documentation only.** Cheapest, and it helps a little. It does not
reduce the number of settings or packages a developer has to handle. Not sufficient on its own, but it belongs in
Phase 1.

# Risks

- **A profile can hide a setting that matters.** Mitigation: every profile lists its settings on one page, and a
  startup check fails when a required setting is missing.
- **Consolidation changes behaviour without anyone noticing.** Mitigation: the architecture tests and the full
  test suite run on every change, as they do now.
- **The contributor workflow stays heavy.** Mitigation: the pre-push hook carries the full checks, and pre-commit
  stays quick (a separate change, tracked alongside this RFC).

# Open questions

1. **Which profile is the default for a hosted deployment?** Proposed: `basic`, with the others added explicitly.
2. **How much of the internal record set should a developer see?** Proposed: none in the quickstart, linked from
   the reference only.
3. **Which SDK language leads the quickstart?** Proposed: TypeScript, with Python shown alongside it.

# Acceptance

This RFC is ready to act on when:

- the baseline test in the measurement section has been run once with a developer, and its result is recorded;
- the profile list for Phase 2 has been reviewed against the current settings;
- open questions 1 to 3 have answers.
