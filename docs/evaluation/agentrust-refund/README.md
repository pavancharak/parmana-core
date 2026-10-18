# Refund scenario: a reproducible evaluation package

A test package for one scenario, `paytm:refund` under the policy `customer-refund` 1.2.0, prepared for a proposal
to the AgenTrust integrations repository. It runs three cases through Parmana's real `POST /execute` path and
records, for each one, the decision, the signed record and how many times the connector was invoked.

## Status: listed in AgenTrust (2026-10-12)

The proposal was accepted. [agentrust-io/integrations#294](https://github.com/agentrust-io/integrations/pull/294),
"Add Parmana as a TRACE external evidence source", was approved by an AgenTrust maintainer and merged into `main`
(merge commit `6de4cb9`) on 2026-10-12. It adds `integrations/parmana-server` (tier `community`, integrates with
`trace`) and a Parmana row to that repository's integration index.

As agreed in the review, Parmana is an external evidence source with no TRACE conformance level: it maps its own
signed records (the `authorized-intent` and `approval-outcome` references, with refusals as their own unit) to TRACE,
and the fixtures there carry public keys only. The maintainer ran the integration's 18 tests and reproduced its
committed `references.json`; they did not run `slsa-verifier` against an image. The listing does not certify
Parmana, and the limits below still apply.

A follow-up requesting the Verified tier was opened on 2026-10-13: it pins the released `parmana` SDK 1.6.0 and adds
exact reproduction steps. On 2026-10-14 a maintainer reproduced it with the released packages (byte-for-byte
`references.json`, 18 tests passed); the tier change follows in a separate maintainer PR, and until then the tier is
`community`.

## What it shows, and what it does not

- **Connector invocations are counted per case.** A refused request must reach the connector zero times.
- **Every connector result is a mock result.** The connector is `MockPaytmConnectorServer`, a hermetic stand in for
  the Paytm connector service. Nothing in this package confirms a refund at Paytm or any other downstream system.
  The report labels each result accordingly.
- **Two of the policy's facts come from the caller.** `refundEligible` and `fraudCheckPassed` are declared by the
  caller and are not checked against an order system or a fraud system. In this policy they can only cause a
  refusal; the signed manager approval is what authorizes a refund. Every case sets both to `true`, so the outcome
  is decided by the approval alone.
- **Server side enforcement, not only signatures.** The refusals are decided by the server (policy, approval
  verification, single use). The signed records are evidence of those decisions that can be checked afterwards;
  they do not by themselves prevent anything.

## Run it

Requirements: Node.js 24, git.

```bash
git clone https://github.com/pavancharak/parmana.git
cd parmana
git checkout <commit named in report.json>
npm ci
npm run build
npm run evaluate:agentrust-refund
```

The command runs `packages/api/tests/integration/agentrust-refund-evaluation.integration.test.ts`, then writes
`evaluations/agentrust-refund/report.json` with the commit, whether the working tree was clean, the Node.js version
and the cases. It also writes the full signed records to `evaluations/agentrust-refund/fixtures/`: the
Execution Trust Record, both Refusal Records, the signed manager approval, Parmana's signing key as `GET /keys/default`
serves it and the approver's public key. Each run makes new keys and identifiers, so it replaces every fixture. It needs no network, database, keys or accounts: storage is in memory, the approver key is generated
for the run, and the connector is the mock.

## The three cases and the expected outcomes

| Case             | Request                                                                            | Expected HTTP       | Decision | Connector invocations | Signed record                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------- | ------------------- | -------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `valid-approval` | Refund of 500 for `order-eval-1`, with a manager approval for that order up to 500 | 200                 | APPROVED | 1 (mock result)       | Execution Trust Record, Ed25519, with the policy content hash                                                                                 |
| `refusal`        | Refund of 500 for `order-eval-2`, every caller fact `true`, no approval            | 403 `POLICY_DENIED` | REFUSED  | 0                     | Refusal Record, Ed25519, same policy content hash, verified by `POST /refusal/verify`; rule `signal-state-verification-violation`             |
| `replay`         | The approval from `valid-approval`, sent again with a new request                  | 403 `POLICY_DENIED` | REFUSED  | 0                     | Refusal Record, as above; rule `signal-state-verification-violation`: the approval is spent, so its verified state is `managerApproved=false` |

The test fails if any of these does not hold, including if the connector is invoked more than once in total.

### Where to check each case

- `valid-approval`: `evaluations/agentrust-refund/fixtures/01-valid-approval.execution-trust-record.json`, `matchedRuleId` `approve-refund-with-manager-approval` (line 147).
- `refusal`: `evaluations/agentrust-refund/fixtures/02-refusal.refusal-record.json`, `matchedRuleId` `signal-state-verification-violation` (line 20).
- `replay`: `evaluations/agentrust-refund/fixtures/03-replay.refusal-record.json`, `matchedRuleId` `signal-state-verification-violation` (line 46). The assertions are in `packages/api/tests/integration/agentrust-refund-evaluation.integration.test.ts` at lines 314 to 316.
- AgenTrust copy: the same fixture, merged in AgenTrust's integrations repository at `6de4cb9`: [`integrations/parmana-server/fixtures/03-replay.refusal-record.json`](https://github.com/agentrust-io/integrations/blob/6de4cb9/integrations/parmana-server/fixtures/03-replay.refusal-record.json#L46) (line 46), with the test at [`tests/test_parmana_evidence.py` line 131](https://github.com/agentrust-io/integrations/blob/6de4cb9/integrations/parmana-server/tests/test_parmana_evidence.py#L131).
- All three are run by `npx vitest run packages/api/tests/integration/agentrust-refund-evaluation.integration.test.ts`, and regenerated with `npm run evaluate:agentrust-refund`. The claim that cites them is CLAIMS.md 3.23 (`docs/CLAIMS.md`).

## Mapping to TRACE

TRACE v0.2 (`agentrust-trace` 0.11.0, `TrustRecord`) asks for evidence about one agent execution. Parmana produces
evidence about one decision and, when approved, one connector invocation. The mapping below says, field by field,
what Parmana can supply, and marks what it cannot. It was written as a proposal to agree with a maintainer; the
implementation that was merged is `integrations/parmana-server` in the AgenTrust repository (see Status above).

| TRACE field                  | From Parmana                                                                                                                                | Status                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `eat_profile`                | Constant `tag:agentrust-io.com,2026:trace-v0.2`                                                                                             | Available                                                     |
| `iat`                        | `createdAt` of the Trust Record or Refusal Record                                                                                           | Available                                                     |
| `subject`                    | The calling agent. Parmana knows the caller id of the API key, not a SPIFFE ID or DID                                                       | Needs an identity mapping from the integrator                 |
| `model`                      | Parmana does not see the model behind the agent                                                                                             | Must come from the agent side                                 |
| `runtime`                    | `platform: "software-only"`; Parmana runs no attested hardware. `measurement`: to agree (for example a digest of the server build)          | Partly                                                        |
| `policy.bundle_hash`         | `sha256:` + the policy content hash: `transaction.policy.contentHash` in an Execution Trust Record, `policyContentHash` in a Refusal Record | Available                                                     |
| `policy.enforcement_mode`    | `enforce`: the server acted on the decision                                                                                                 | Available                                                     |
| `policy.version`             | `customer-refund@1.2.0`                                                                                                                     | Available                                                     |
| `data_class`                 | Not modelled by Parmana                                                                                                                     | Declared by the integrator                                    |
| `tool_transcript.call_count` | Connector invocations for the request: 1, 0, 0 in the three cases                                                                           | Available                                                     |
| `tool_transcript.hash`       | `sha256:` over the canonical list of connector calls made for the request                                                                   | To define                                                     |
| `origin`                     | `kind: "third-party-control-plane"`, `producer: "parmana"`, `source_event_id`: the record id                                                | Available                                                     |
| `references`                 | The Parmana record: id, resolver `GET /trust-records/{id}` or `GET /refusal/{id}`, digest = record hash                                     | Available                                                     |
| `build_provenance`           | The server image `ghcr.io/pavancharak/parmana-api` carries SLSA provenance from the first release after 2026-10-06; `digest`: that image's  | Partly: the hosted deployment is built by Vercel, without it  |
| `appraisal`                  | No hardware evidence to appraise: `status: "none"`                                                                                          | To agree                                                      |
| `cnf`                        | The key that signs the TRACE record. Parmana signs its own records with its own canonical form, not the TRACE form                          | Open: an adapter key, or Parmana's key signing the TRACE form |

Questions for the maintainer before implementing:

1. Is one TRACE record per Parmana decision the right unit, including refusals with `call_count: 0`?
2. Which `subject`, `model` and `data_class` should an adapter use when the governance layer does not see them?
3. Should the TRACE record be signed by an adapter key and reference the Parmana record, or should Parmana sign the
   TRACE form itself?
4. How should a mock connector result be marked in a TRACE record, so it is never read as a confirmed action?

## Files

- `packages/api/tests/integration/agentrust-refund-evaluation.integration.test.ts`: the three cases.
- `scripts/evaluate-agentrust-refund.ts`: the runner behind `npm run evaluate:agentrust-refund`.
- `evaluations/agentrust-refund/report.json`: the report of a run, with the commit it ran on.
- `evaluations/agentrust-refund/fixtures/`: the full signed records and public keys from the same run, for checking
  offline.
- `policies/customer-refund/1.2.0/policy.json`: the policy, including the caller supplied facts.
