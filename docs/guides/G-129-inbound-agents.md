# G-129: agents that reach business systems directly

Status as of 2026-11-08. **Open.** The decision is made, part of the work is built, and the protection is not yet in use.

Repository: [`pavancharak/parmana-core`](https://github.com/pavancharak/parmana-core). Gap record:
[VERIFICATION-GAPS.md, G-129](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/VERIFICATION-GAPS.md).
Issue: [#421 (P1)](https://github.com/pavancharak/parmana-core/issues/421).

---

## 1. The problem

Parmana checks and records actions that leave through its own gateway. An agent run by a customer or partner that calls
one of the business's systems directly never reaches Parmana. No policy decides that call, no approval is required, and
no signed record is written. If the business system accepts the request, the action runs with nothing recorded.

The outbound model assumes two things: a business system never calls Parmana, and a caller never calls a connector
directly. Those rules protect the path Parmana controls. They do not cover an outside agent calling a business system
on its own.

Example: a customer's agent asks a billing system to refund an order. Without a check, the refund runs, and nothing
records that a policy was consulted or that a person approved it.

Source: [RFC-0024, "Problem"](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/rfcs/RFC-0024-Inbound-Agent-Authorization.md).

## 2. The decisions

RFC-0024 records eight decisions. The project owner made them. The RFC says they were recorded in pull requests
#436 to #440.

| #   | Decision                                                                                                                                                                                                                                                                                                    | Why                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Approach: option A.** Each business system that accepts external agent requests calls Parmana to check the request before it acts.                                                                                                                                                                        | The other options leave a way round the check. Option B (a proxy in front of the APIs) leaves any route that skips the proxy uncovered.                                         |
| 2   | **No bypass.** An external agent must not reach a business system without Parmana's check.                                                                                                                                                                                                                  | Option C alone (documentation only) does not protect anything. It is accepted only as an interim measure.                                                                       |
| 3   | **Identity, interim.** An external agent is identified by the partner's API key.                                                                                                                                                                                                                            | A per-agent identity is needed later. The key is the simplest identity available now. It does not allow a per-agent grant or the revocation of one agent.                       |
| 4   | **Authority.** An external agent may only _propose_ an action. The business decides whether it runs.                                                                                                                                                                                                        | A proposal is not permission. The business keeps control of what happens to its own systems.                                                                                    |
| 5   | **Records.** Inbound requests, refusals and approvals are signed records, as outbound refusals already are (RFC-0021).                                                                                                                                                                                      | An outside request must leave the same evidence as an internal one.                                                                                                             |
| 6   | **Verifying no bypass.** The business system refuses any request without a valid approval. A scheduled probe sends a direct request with no approval and expects a refusal. A probe that gets through is recorded and alerted. If a bypass cannot be seen, the record says "not verified", not "protected". | Protection can only be claimed for what is tested. A probe is the only check Parmana can run from outside a business system.                                                    |
| 7   | **Which actions need a person.** Set per action in the policy. The same policy applies to an outside agent as to one of the business's own agents.                                                                                                                                                          | One rule set avoids two standards of control.                                                                                                                                   |
| 8   | **What a record of an outside request contains.** The partner's key ID; the action, resource and amount; the policy and version; the decision; the approver and time, if a person approved; and whether the check was "verified" or "not verified".                                                         | A record must show who asked, what was asked, which rule decided, and whether the check was in place. It omits the partner's internal reasoning, which the business cannot see. |

Source: [RFC-0024, "Decisions"](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/rfcs/RFC-0024-Inbound-Agent-Authorization.md).

**Interim measure (option C).** The limit is stated publicly while option A is built. That statement is in the public
inbound-checks page, [docs/site/security/inbound-checks.mdx](https://github.com/pavancharak/parmana-core/blob/main/docs/site/security/inbound-checks.mdx),
and in the [inbound guide](https://github.com/pavancharak/parmana-core/blob/main/docs/guides/inbound-agent-checks.md).

## 3. What was built

| Part                               | What it does                                                                                                                        | Where                                                                                                                                          | Status                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Inbound check                      | `POST /v1/inbound/checks`. The business system asks Parmana whether a partner's request may proceed.                                | [`packages/api/src/routes/inbound-checks.ts`](https://github.com/pavancharak/parmana-core/blob/main/packages/api/src/routes/inbound-checks.ts) | On `main`                 |
| Policy in the check                | The check runs the policy bound to the capability, through the runtime's decide step. A capability with no bound policy is refused. | Same file; [PR #448](https://github.com/pavancharak/parmana-core/pull/448), merge `aae3c25`                                                    | On `main`. G-142 resolved |
| Decisions and outcomes             | Routes for inbound decisions and outcomes, with their storage.                                                                      | `packages/api/src/routes/inbound-decisions.ts`, `inbound-outcomes.ts`                                                                          | On `main`                 |
| No-bypass probe module             | Sends a request with no approval to one route, records the signed result, alerts on a bypass.                                       | [`packages/api/src/inbound/bypass-probe.ts`](https://github.com/pavancharak/parmana-core/blob/main/packages/api/src/inbound/bypass-probe.ts)   | On `main`                 |
| Probe runner and schedule          | Reads the probe's settings from the environment, runs it, and runs every six hours. Does nothing until a route is configured.       | [PR #519](https://github.com/pavancharak/parmana-core/pull/519)                                                                                | Open, awaiting review     |
| Gap record corrected               | The G-142 status said "awaiting merge" after the merge. Corrected.                                                                  | [PR #516](https://github.com/pavancharak/parmana-core/pull/516)                                                                                | Merged                    |
| Design for approval record (G-143) | Records the approver and approval time on inbound decisions.                                                                        | [PR #517](https://github.com/pavancharak/parmana-core/pull/517)                                                                                | Open, design only         |
| Proposed fact sources (G-144)      | Answers to RFC-0026's five questions about where facts come from.                                                                   | [PR #518](https://github.com/pavancharak/parmana-core/pull/518)                                                                                | Open, proposals only      |

## 4. What is still open

- **Option A itself.** No business system calls the inbound check, so nothing is protected yet.
- **A business route under the probe.** The probe has no target. A business owner must name one.
- **A per-agent identity** to replace the partner API key (decision 3).
- **Approval fields on records** (G-143): decisions still needed.
- **Where facts come from** (G-144, [RFC-0026](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/rfcs/RFC-0026-Inbound-Facts-From-Business-Sources.md), draft): five questions need answers.
- **Comparison on the same test cases** as the outbound path. Required before the design is built. Not done.
- **Deployment runbook entry** for the no-bypass check. Not written.

## 5. Commands

Run the inbound unit tests:

```bash
npx vitest run packages/api/tests/unit/inbound/
```

Run the probe once, against a route you own (the route must refuse requests with no approval):

```bash
export BYPASS_PROBE_TARGET_URL="https://route.example.com/x"
export BYPASS_PROBE_SIGNING_KEY_PEM="$(cat probe-key.pem)"
npx tsx scripts/run-bypass-probe.ts
echo "exit $?"
```

Exit codes: `0` nothing configured, or the route refused the request; `1` a configuration error or an unverified result;
`2` a bypass.

Secrets for the scheduled workflow: `BYPASS_PROBE_TARGET_URL` and `BYPASS_PROBE_SIGNING_KEY_PEM`. Optional variables:
`BYPASS_PROBE_TARGET_NAME`, `BYPASS_PROBE_METHOD`.

Full runbook: [BYPASS-PROBE.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/runbooks/BYPASS-PROBE.md).

## 6. Links

**Decisions and design**

- [RFC-0024, inbound agent authorization](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/rfcs/RFC-0024-Inbound-Agent-Authorization.md), the decisions
- [RFC-0025, inbound decisions](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/rfcs/RFC-0025-Inbound-Decision-Issuance.md)
- [RFC-0026, facts from the business](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/rfcs/RFC-0026-Inbound-Facts-From-Business-Sources.md), draft
- [Design, G-143](https://github.com/pavancharak/parmana-core/blob/docs/g143-design/docs/internal/designs/G-143-inbound-approval-record.md) (PR #517)
- [Proposed answers, G-144](https://github.com/pavancharak/parmana-core/blob/docs/g144-answers/docs/internal/designs/G-144-rfc-0026-answers.md) (PR #518)

**Code**

- [Inbound check route](https://github.com/pavancharak/parmana-core/blob/main/packages/api/src/routes/inbound-checks.ts)
- [No-bypass probe](https://github.com/pavancharak/parmana-core/blob/main/packages/api/src/inbound/bypass-probe.ts)
- [Probe runner (PR #519)](https://github.com/pavancharak/parmana-core/blob/feat/g146-bypass-probe-runner/packages/api/src/inbound/bypassProbeFromEnv.ts)
- [Probe script (PR #519)](https://github.com/pavancharak/parmana-core/blob/feat/g146-bypass-probe-runner/scripts/run-bypass-probe.ts)
- [Scheduled workflow (PR #519)](https://github.com/pavancharak/parmana-core/blob/feat/g146-bypass-probe-runner/.github/workflows/bypass-probe.yml)

**Records and runbooks**

- [VERIFICATION-GAPS.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/VERIFICATION-GAPS.md), G-129, G-142, G-143, G-144, G-146
- [CLAIMS.md](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/CLAIMS.md), claims 3.30 to 3.32 (inbound check, records, decide step)
- [BYPASS-PROBE.md](https://github.com/pavancharak/parmana-core/blob/feat/g146-bypass-probe-runner/docs/internal/runbooks/BYPASS-PROBE.md) (PR #519)
- [Inbound checks, public page](https://github.com/pavancharak/parmana-core/blob/main/docs/site/security/inbound-checks.mdx)
- [Inbound guide](https://github.com/pavancharak/parmana-core/blob/main/docs/guides/inbound-agent-checks.md)

**Pull requests**

- [#448 (G-142, merged)](https://github.com/pavancharak/parmana-core/pull/448)
- [#516 (gap record, merged)](https://github.com/pavancharak/parmana-core/pull/516)
- [#517 (G-143 design)](https://github.com/pavancharak/parmana-core/pull/517)
- [#518 (G-144 answers)](https://github.com/pavancharak/parmana-core/pull/518)
- [#519 (G-146 runner)](https://github.com/pavancharak/parmana-core/pull/519)
- [#436 to #440](https://github.com/pavancharak/parmana-core/pulls): the decision PRs named in RFC-0024

## 7. What we did, and why, in order

1. **Recorded the decision (RFC-0024).** Option A chosen, option C as an interim measure. Why: the other options leave a
   way round the check.
2. **Built the inbound check** (`POST /v1/inbound/checks`), so a business system can ask Parmana before it acts.
3. **Made the check run the policy** (PR #448). Why: a check that approved on grant limits alone would not be a policy
   decision.
4. **Built the no-bypass probe module.** Why: it is the only check Parmana can run from outside a business system.
5. **Wrote the gap records, and corrected a stale one** (PR #516). Why: the record said "awaiting merge" after the merge.
6. **Designed the missing pieces.** G-143 (approval record, PR #517) and G-144 (facts from the business, PR #518). Why:
   each needs a decision before code, so the decisions were written out for review.
7. **Built the probe runner and schedule** (PR #519). Why: so a route can be tested as soon as one is named. It does
   nothing until then, so it protects nothing yet.

## 8. What is needed to close G-129

1. A business system calls the inbound check before it acts (option A).
2. The no-bypass probe runs against that system's route, on a schedule, and reports "refused".
3. A per-agent identity replaces the partner key.
4. The approval-record and fact-source decisions are made, and their code is built.
5. Option A is tested on the same cases as the outbound path.

Until 1 and 2 hold, the protection described in RFC-0024 does not exist in any business system.
