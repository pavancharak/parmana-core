# G-129: callers that reach your systems directly

**Status: open.** The design is not final. Parts of the check are built, but no business system calls it, and the bypass probe is not scheduled.

## The problem

Parmana checks and records actions that leave through its gateway. An agent, application or person that holds credentials to one of your systems and calls it directly never reaches Parmana. No policy decides that call, no approval is required, and no Trust Record is written.

The README's outbound rules protect the path Parmana controls. They do not cover this path. Threat model A8 and assumption 9 say deployment must prevent direct calls, because Parmana cannot enforce that in software.

## The design: where it stands

Two decisions exist, and the newer one is a draft.

| Document                                                    | Date               | Status                                    | What it says                                                                                                                                             |
| ----------------------------------------------------------- | ------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [RFC-0024](../rfcs/RFC-0024-Inbound-Agent-Authorization.md) | decided 2026-11-05 | **Superseded in part by the draft below** | Option A: the downstream system calls Parmana online before it acts, with an agent-specific identity.                                                    |
| [RFC-0024 revision](../rfcs/RFC-0024-revision-DRAFT.md)     | draft, 2026-11-08  | **Draft. Not decided. No code written.**  | Receiver-verified release: the downstream system accepts an action only with a valid Parmana signed release for that exact action. It replaces option A. |

The revision gives three reasons for the change: the receiver checks the signature offline, so Parmana does not need to be reachable at the moment of the action; the release format and verifier already exist (ADR-0013); and the release names the action, not the kind of caller.

GitHub issue: pavancharak/parmana-core#421.

Until the revision is decided, the implementation below follows option A, and any work on the revision is a separate decision.

## What is built

| Item                                                                 | Where                                      | Status                                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Limit documented publicly                                            | Limitations page                           | Done (interim measure, option C)                                                           |
| Inbound check endpoint `POST /v1/inbound/checks`                     | claim 3.30                                 | Built and tested. Not called by any business system.                                       |
| The check evaluates the capability's policy                          | G-142, PR #448                             | Done                                                                                       |
| Policy name and version, and approval fields, on each inbound record | G-143, claim 3.31                          | Partly closed. Signed and tested. Nothing outside this repo reads the approval fields yet. |
| Bypass probe module                                                  | `packages/api/src/inbound/bypass-probe.ts` | Built and tested. Not scheduled. No target configured.                                     |

## What is not built

- **No business system calls the check** (G-146). Nothing in production sends it a request.
- **The probe is not scheduled**, and no business system is configured as a target. Nothing has run a direct call and confirmed it is refused.
- **Permanent facts source** (G-144, RFC-0026, draft). Until it is decided, the check approves only on grant limits, and the business does not confirm the facts a policy needs.
- **Open questions** in RFC-0024 (revision, section 8) are for the owner. Nothing here answers them.
- **Not checked:** how often inbound agents already call business systems directly. No one has measured this.

## Owner decisions needed before work starts

1. Decide whether to adopt the revision (receiver-verified release) or keep option A, and record the decision in RFC-0024 and VERIFICATION-GAPS.md.
2. Answer the open questions in RFC-0024 (revision), section 8. The transport for the receiver's signed refusal is one of them.
3. Decide whether an external consumer of the inbound records is needed (G-143, design O2 and O3).
4. Answer the five questions in RFC-0026 before the facts source (G-144) can be designed.

## How to close the gap

The gap closes when all of the following are true:

1. The owner has decided the design, and the decision is recorded in RFC-0024 and the register.
2. A reference business system (or a client of one) calls the approved check, or verifies the release, before it acts.
3. The bypass probe is scheduled against that system, and its signed results are recorded.
4. A direct call that skips the check is refused in the probe's run, and the refusal is recorded.
5. G-143 and G-144 are closed, or their status is recorded as deliberately deferred.

Until then, the status stays "open". The register must not describe G-129 as closed, and the public limitations page must keep saying that direct calls are not governed.
