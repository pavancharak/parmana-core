# ADR-0017: Operator kill switch with a fresh, repeatable shutdown check

**Status:** Proposed on 2026-10-20. Not decided. No code has been written for it.

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
