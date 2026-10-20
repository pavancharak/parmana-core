# ADR-0017: Operator kill switch with a fresh, repeatable shutdown check

**Status:** Decisions accepted on 2026-10-20. First slice built on branch `feat/kill-switch` (not merged): guard, trip, reset and status, with a durable Postgres store (step 1). Not signed, not deployed.

**Relates to:** `docs/site/security/regulation-mapping.mdx` (row "Draft MRM guidance, kill switch"); `docs/VERIFICATION-GAPS.md` G-122; `docs/REMAINING-WORK.md` section B.

## Context

Parmana authorizes and records every agent action. It does not stop the model, and it has no single control that halts all actions at once.

The current stop controls are partial:

- approving a policy version that refuses the agent's actions;
- revoking a connector or an approver;
- removing the agent's key, which takes effect only on restart or redeploy.

An action already released is not recalled by any of them.

Regulators are asking for a kill switch. The draft model-risk guidance in the regulation mapping asks that a malfunctioning model "can be suspended or deactivated at once." California's executive order on frontier models asks for a kill switch "verified on an ongoing basis by an independent verification organization." A signed refusal proves that a refusal happened at one moment. It does not prove that the switch still works now. That was the finding of the kill-switch test published on 2026-10-20, in which an old refusal still verified after recovery.

An authorization layer is the natural place for a kill switch, because every action passes through it.

## Decision drivers

- The stop must take effect for the next request, without a restart or redeploy.
- The stop must survive a restart.
- Only an operator may trip or reset it. The agent's own credential must not be able to undo it.
- Every trip and reset must be recorded, with who did it, when, and why.
- A third party must be able to check, now, that the switch is working, and keep the evidence.

## Options considered

**A. Global halt.** One flag that stops every authorization. Simple, and it matches the regulatory wording. It stops everything, including unrelated agents.

**B. Per-agent halt.** A flag per agent or per caller key. Narrower, and it leaves other agents running. It does not satisfy the "stop the model" wording on its own.

**C. Both.** A global halt, plus per-agent halts. More to build and to test.

**Recommendation:** A for the first version. Add B only when a customer needs it.

## Proposed behavior

1. **Trip.** An operator credential calls a trip endpoint with a reason. From that moment, every new `POST /execute` and `POST /transactions` is refused with `KILL_SWITCH_ACTIVE` before policy evaluation. The refusal is signed and recorded.
2. **Persistence.** The state is stored in the database, not in memory, so a restart does not clear it.
3. **Reset.** An operator credential calls a reset endpoint with a reason. Whether reset needs a second person is an open decision (see below).
4. **Audit.** Every trip and reset writes a signed audit event naming the credential, the time, and the reason.
5. **Already-admitted calls.** A call admitted before the trip can still finish. The ADR records this and does not try to recall it.
6. **Direct tool access.** Parmana cannot stop a tool that an agent calls directly, bypassing Parmana. This is a deployment requirement, to be documented, not something the switch can enforce.

## Fresh, repeatable check

The switch is only useful if its state can be verified later. Proposed:

- **Status endpoint.** `GET /kill-switch/status` returns the current state, signed, with a timestamp. The caller sends a nonce, and the response echoes it, so an old response cannot be replayed as a current one.
- **Probe.** A scheduled job sends a harmless authorization request while the switch is tripped and records that it was refused. It runs on a schedule the operator sets, and the results are kept.
- **Third-party check.** A script that a third party can run against a deployment: trip, confirm refusal with a fresh nonce, reset, confirm the request is allowed again. It produces a signed evidence file.

## Limits (to state to customers)

- Calls admitted before the trip can still complete.
- A tool reached directly, bypassing Parmana, is not stopped.
- Signatures identify the key, not the build. Tying the signing key to the measured code is a separate open item.
- The check proves the switch at the moment it runs. A schedule of checks is needed for ongoing assurance.

## First slice: what is built (2026-10-20)

Built on branch `feat/kill-switch`, not merged:

- the switch state and service, with compare-and-write retries and fail-closed reads (`packages/api/src/killSwitch/`)
- the durable Postgres store and its migration `supabase/migrations/20261020120000_add_kill_switch_state.sql`. The migration seeds one inactive row and enables row level security. The store writes only when the version it read is still current.
- two-person reset (decision 1). The service takes `resetNeedsSecondOperator` as a required option, so the production setting has to be chosen when the switch is wired. With it set, the first reset request is held as pending (HTTP 202). A second, different operator completes it (HTTP 200). The same operator cannot confirm their own request (HTTP 409 `SAME_OPERATOR_CANNOT_CONFIRM_RESET`). A trip cancels a pending reset. The migration `supabase/migrations/20261020130000_kill_switch_reset_and_probes.sql` adds the pending and requester columns.
- the probe route `POST /kill-switch/probes` (capability `kill-switch:probe`). The external scheduler sends a request to `/execute` while the switch is tripped and reports the response status and error code. The probe passes when the refusal matches the switch state at the time of recording. Results are stored in `kill_switch_probe` (decision 3).
- the guard on execute, transactions, the policy-change approve route and the sandbox approvals route
- trip, reset and status routes, with `kill-switch:trip` and `kill-switch:reset` capabilities
- the OpenAPI entries, the three code samples in each language, and the generated pages
- unit and HTTP tests, including two-person reset, a same-operator refusal, a probe that passes, a probe without the capability, and a status that echoes the nonce. The live Postgres test covers the two-person reset across a restart and a recorded probe.

The OpenAPI response examples for the kill switch were captured from the routes in a test run (2026-10-20), so the generated pages' "real captured responses" wording is true for them. The architecture test checks that each example fits its schema; it does not check capture, so a future hand edit would not be caught.

Still open after the first slice (wiring and the scheduler are done, see Production status above):

- **Wiring the durable store into the server:** done 2026-10-20 (see Production status). Both migrations are applied to production, and `resetNeedsSecondOperator` is true there.
- **Signed status and signed audit events** (ADR-0017, Audit; G-118 limits the signing key).
- **The third-party check**, which runs on a non-production deployment only.
- **The scheduler:** a GitHub Actions workflow on `main`, running every 15 minutes since 2026-10-20.
- **Probe retention.** Decision 3 requires at least one year. Nothing deletes old rows yet, and a retention job that keeps them for a year is not built.

## Production status (2026-10-20)

Live in production, with the switch not tripped. `KILL_SWITCH_ENABLED=true` and `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR=true` are set as Vercel Config values. Both migrations are applied. A check with a valid key returned `{"active":false,"version":0,"nonce":"verify-1","signed":false}`. Operations are in [docs/runbooks/KILL-SWITCH-OPERATIONS.md](../runbooks/KILL-SWITCH-OPERATIONS.md).

Decided 2026-10-20: every probe row is kept; the probe runs from a scheduled GitHub Actions workflow on `main`; status stays unsigned until a build-bound signing key exists (G-118). Still open: the third-party check and an exercised two-person reset. The keys pasted into chat during setup were rotated on 2026-10-20.

## How the durable store was tested

Against a local PostgreSQL 16 cluster, not the production or the test project. The live test (`packages/api/tests/integration/postgres-kill-switch.integration.test.ts`) runs only with `DATABASE_URL` and `ALLOW_LIVE_SUPABASE=1` set, and it resets the single row before each case, so run it against a test database only. It covers: the seeded state, a stale write being refused, a trip surviving a new pool, and two concurrent trips ending at version 2.

## Decisions (2026-10-20)

1. **Reset needs two people in production.** A stop one person can clear with no review is weak. The test setup may use one person.
2. **Operator credentials are named, individual and issued under the same process as policy checkers.** Each credential is tied to one person. Rotation follows that process.
3. **Probe history is kept for at least one year,** so a question about a past period can be answered.
4. **No per-agent halt in the first build.** The global halt comes first. Per-agent halts are added when a customer needs one.
5. **The halt also blocks the approval endpoints.** An agent cannot approve its own requests while the switch is on.

## Review requirements (2026-10-20)

These are firm requirements for the first build. They change the draft below.

1. **Trip, reset and status stay reachable while the switch is on.** Only the authorization and approval endpoints refuse. Without this, the switch cannot be cleared.
2. **Fail closed on a read error.** If the switch state cannot be read, the request is refused.
3. **Operators hold separate capabilities.** `kill-switch:trip` and `kill-switch:reset` are granted to named operator keys. An operator who can trip the switch cannot approve policy changes, so the same person cannot both trip and approve their own reset.
4. **The third-party check runs on a non-production deployment only.** Tripping production to test it would stop real traffic.
5. **Status is signed by the running build's key only once G-118 is fixed.** Until then, the signature proves which key signed the response, not which build answered. The status endpoint must say this in its documentation.
6. **The probe's schedule must fit the hosting plan.** This is checked before the probe is designed. See Open decisions.
7. **Trip and reset run in a database transaction**, so two operators acting at once cannot race.

## First build (draft, for review)

**State.** One row in a `kill_switch_state` table: `active` (boolean), `tripped_by`, `tripped_at`, `trip_reason`, `reset_by`, `reset_at`, `reset_reason`. The row is read from the database on every authorization, so a restart does not clear it.

**Endpoints.**

- `POST /kill-switch/trip` takes a reason, and needs an operator credential.
- `POST /kill-switch/reset` takes a reason. In production it needs a second, different operator credential (decision 1).
- `GET /kill-switch/status` takes a caller nonce and returns the state, signed, with the nonce echoed back.

**Enforcement.** While active, `POST /execute`, `POST /transactions`, and the approval endpoints refuse with `KILL_SWITCH_ACTIVE`, before policy evaluation. The refusal is signed and recorded.

**Audit.** Every trip, reset, and refused request writes a signed audit event naming the credential, the time, and the reason.

**Probe.** A scheduled job sends a harmless request while the switch is active and records the refusal. Results are kept for a year (decision 3).

**Third-party check.** A script that trips the switch, confirms a refusal using a fresh nonce, resets it, and confirms the request is accepted again. It writes a signed evidence file.

**Tests.** Trip refuses the next request. A restart does not clear the trip. An agent credential cannot trip or reset. Reset with one person is refused in production. The nonce is echoed. A deliberately broken build that forgets the stored state fails the restart test.

**Decided (2026-10-20):** outside production, reset needs one operator. The probe history is stored in the database, in the same table as the switch state. The probe runs from an external scheduler, not from Vercel. The design is ready for a build.

## Probe scheduling (checked 2026-10-20)

Vercel's Hobby plan runs cron jobs once a day at most, with imprecise timing (Vercel's documentation, cron jobs usage and pricing). Production is on Hobby. A probe that runs every few minutes therefore cannot run inside Vercel on this plan.

Options: run the probe from an external scheduler (for example a scheduled GitHub Actions workflow, which needs no new hosting), or upgrade the plan. Decided (2026-10-20): the external scheduler, with the results recorded in the probe history.

## Open decisions

1. Does reset need two people, as policy changes do? Recommended: yes, for production.
2. Who holds the operator credential, and how is it issued and rotated?
3. How long is the probe history kept, and where?
4. Is a per-agent halt needed in the first version? Recommended: no.
5. Does the trip endpoint also block the approval endpoints, or only actions?

## Acceptance criteria (if accepted)

- A trip refuses the next authorization, with no restart.
- A restart does not clear a trip.
- An agent credential cannot trip or reset.
- Trip and reset each write a signed audit event.
- The status endpoint's response includes the caller's nonce.
- The third-party check runs on a clean deployment and produces signed evidence.
- Tests cover: trip, restart survival, agent credential refused, nonce echo, and a failing build that forgets the persisted state.

## Not decided

Whether to build this at all. This ADR records the design so the decision can be made.
