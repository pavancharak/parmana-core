# G-129 remaining items: status and next steps

Status as of 2026-11-08. Gap G-129 is about agents that call business systems directly, without a Parmana decision.
It stays open until a business system uses the inbound check and the no-bypass probe confirms it refuses direct
calls. Three related gaps have their own work, below. Each PR is in `pavancharak/parmana-core`.

## Summary

| Item  | What it is                                                         | State                                             | PR                                                           | What is needed from you                         |
| ----- | ------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| G-143 | Record who approved an inbound decision, and when                  | Design written                                    | [#517](https://github.com/pavancharak/parmana-core/pull/517) | Three decisions (below)                         |
| G-144 | Facts a decision uses must come from the business, not the partner | Proposed answers written                          | [#518](https://github.com/pavancharak/parmana-core/pull/518) | Approve or change five proposals                |
| G-146 | Check that business systems refuse direct calls                    | Runner and schedule built, inert until configured | [#519](https://github.com/pavancharak/parmana-core/pull/519) | A business owner names a route; two secrets set |

Already on `main`: G-142 (the inbound check runs the capability's policy) is merged, through PR #448. Its gap record
was corrected in PR #516.

## G-143: who approved an inbound decision, and when

**The problem.** An inbound decision record has a policy name and version, but not the approver or the approval time.
The columns exist, and nothing writes them.

**The proposal.** Record the approver and the approval time only when a verified human approval was used to approve the
request. Never take them from the partner's declared values. The approver and time already come out of the approval
check, but the decision step discards them. The change keeps them.

**Decisions needed:**

1. Should the two new fields be signed? Signing means an external verifier must be updated before it can check new
   records. Storing them unsigned means the record cannot prove who approved.
2. Is the approver ID enough, or should the key ID be recorded too?
3. Should an approval be refused if it was already used on an earlier request?

Full design: `docs/internal/designs/G-143-inbound-approval-record.md`.

## G-144: facts from the business, not from the partner

**The problem.** The inbound check decides on facts the partner declares. A declared fact can refuse a request, but it
must never be the reason to approve one.

**The proposal.** Each fact a policy needs comes from a registered business source, asked about the exact business
object in the request. The partner's value is only compared with it. Mismatch refuses. A source that does not answer
refuses. Five questions in RFC-0026 need answers:

1. **Source per capability.** Registered through maker-checker, as business signal sources already are.
2. **Source trust.** Each source has a registered public key, and every answer is signed and checked.
3. **Latency.** A fixed read timeout (proposed: 10 seconds). An expired read refuses.
4. **Staleness.** Use the source's own timestamp, with a maximum age per fact, as the Razorpay source already does (60 seconds).
5. **Coverage.** A capability whose policy needs a fact with no registered source is refused.

Full answers: `docs/internal/designs/G-144-rfc-0026-answers.md`.

**Decisions needed:** approve or change each of the five proposals. Question 5 also needs a list of which capabilities
currently have no source. That list has not been checked yet.

## G-146: check that business systems refuse direct calls

**The problem.** The no-bypass probe exists, but nothing runs it on a schedule, and no business system is a target.

**What was built.** A runner reads its settings from environment variables. A script runs it once. A workflow runs it
every six hours. Until a route is configured, every run does nothing and says so.

- **Exit 0:** nothing configured, or the route refused the request.
- **Exit 1:** a configuration error, or the probe could not verify protection.
- **Exit 2:** a bypass. The route accepted a request with no approval. The run fails.

**Two secrets are needed before the schedule does anything:**

- `BYPASS_PROBE_TARGET_URL`: the `https://` route to test.
- `BYPASS_PROBE_SIGNING_KEY_PEM`: an Ed25519 private key, PEM, that signs each record.

Optional variables: `BYPASS_PROBE_TARGET_NAME` and `BYPASS_PROBE_METHOD` (GET or POST).

**What the probe proves, and what it does not.** A `refused` result shows that one route refused one request with no
approval. It does not show that every path to the system is closed. A business system needs its own check.

Runbook: `docs/internal/runbooks/BYPASS-PROBE.md`.

## How to run the probe by hand

```bash
export BYPASS_PROBE_TARGET_URL="https://route.example.com/x"
export BYPASS_PROBE_SIGNING_KEY_PEM="$(cat probe-key.pem)"
npx tsx scripts/run-bypass-probe.ts
echo "exit $?"
```

On Windows PowerShell, set the variables with `$env:BYPASS_PROBE_TARGET_URL = "https://..."`, and read the key with
`$env:BYPASS_PROBE_SIGNING_KEY_PEM = Get-Content probe-key.pem -Raw`.

## What is still open after these PRs

- G-143 and G-144 stay open until the decisions above are made and the code is written.
- G-146 stays open until a business owner names a route, and the probe has run against it.
- G-129 stays open until a business system calls the inbound check, and the probe confirms direct calls are refused.
- The commits in these PRs are signed off but not GPG-signed. `main` requires GPG signatures, so each PR needs a
  signed re-commit before merge.
- Each PR needs an approving review from someone other than the last pusher.
