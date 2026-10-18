# RFC-0021 — Refusal Record: durable, signed, third-party-verifiable evidence of a policy REJECT

Status: Draft

Author: (session investigation + design, pending Pavan review)

Created: 2026-08-02

Updated: 2026-08-02

Target Version: unset — implementation milestone, not started

---

# Summary

Today, when policy evaluation or signal/intent binding rejects a transaction, nothing durable
is written anywhere. This RFC proposes a **Refusal Record**: a signed, independently verifiable
artifact created for every policy-level REJECT, modeled directly on `ExecutionTrustRecord`'s own
shape and conventions, stored in a new `refusal_records` table, and exposed through a new public
verification endpoint — so "this action was refused" becomes as provable as "this action was
approved" already is.

This is a design document only. No implementation code is included or should be inferred as
approved by this document's existence.

---

# Motivation

A public technical objection, raised twice, is precise and correct as investigated: Parmana's
architecture is prevention-first (block by default), and a refusal that works leaves no trace by
construction — there is nothing to sign because nothing executed. The investigation that preceded
this RFC confirmed the claim in full at the code level:

- `ExecutionGate.enforce()` (`packages/runtime/src/ExecutionGate.ts:33-42`) throws a plain
  `RuntimeError` for any non-`APPROVED` `Decision` — this happens **before**
  `RuntimeAuthorizationSigner.sign()` and **before** `BusinessTrustPipeline.execute()` (the code
  that builds a signed `ExecutionTrustRecord`) are ever reached.
- `Runtime.execute()` (`packages/runtime/src/Runtime.ts:34-51`) has no try/catch around the
  engine call, so the throw propagates immediately.
- The global `errorHandler` (`packages/api/src/middleware/error-handler.ts`) turns a
  `RuntimeError` straight into an HTTP response — no log line, no database write.
- `BusinessTransactionRepository` (`packages/shared/src/repositories/business-transaction-repository.ts`)
  has no update method at all — the one row that _is_ durably written (at accept-time, before
  evaluation) is never revisited to record the outcome.

Net effect: the G-24 signal-binding-mismatch REJECT — this project's own headline security fix —
produces **zero durable evidence that it ever happened**, let alone signed, third-party-verifiable
evidence. "Every refusal is a durable, third-party-verifiable record" would be a false claim if
made today. This RFC closes that gap.

---

# Goals

- Every policy-level REJECT (both `PolicyEngine.evaluate` rejections and
  `SignalIntentBinder` binding-violation rejections) produces a durable, signed artifact.
- That artifact is verifiable by a third party without trusting Parmana's own database — same
  trust model `ExecutionTrustRecord` already provides for approvals.
- The REJECT itself (the caller receiving a 403) never depends on the evidentiary write
  succeeding — availability of the _refusal_ must not regress even if the _evidence_ can't be
  written.
- Parallel construction with `ExecutionTrustRecord` throughout, so the two artifact types are
  easy to compare and reason about together, not two unrelated designs bolted together.

# Non-Goals

- Signing `CallerAuditSink`/`RazorpayWebhookAuditSink` events — explicitly out of scope per the
  task that produced this RFC; that's a separate, smaller, already-scoped milestone.
- Covering every _failure_ path as a Refusal Record. `PolicyNotFoundError`,
  `PolicyValidationError`, `SignalValidationError`, `DuplicateBusinessTransactionError` are
  "couldn't evaluate" failures, not "evaluated and decided to reject" — see Open Question 1.
- Retroactively backfilling refusal evidence for REJECTs that already happened before this
  ships. Not possible — the evidence to reconstruct doesn't durably exist.
- Any change to the audit-sink milestone, `CanonicalSerializer`, `SignatureProvider`, or any
  other existing signing code beyond what's needed to also sign this new artifact type.

---

# Background

Relevant reading: `docs/VERIFICATION-GAPS.md` G-24 (the signal-binding-mismatch fix this RFC's
motivation traces back to), `ADR-0005-Evidence-Is-Append-Only.md`, `ADR-0006-Cryptographic-Agility.md`,
the `ExecutionTrustRecord` domain model (`packages/shared/src/domain/execution-trust-record.ts`),
and `parmana-sign` (the now-published, standalone extraction of this codebase's signing/
verification primitives — relevant to the signing decision below, not because it's proposed for
direct reuse, but because its existence changes what "third-party-verifiable" can mean here).

---

# Proposal

## 1. The artifact — `RefusalRecord`

Modeled directly on `ExecutionTrustRecord`'s shape (`packages/shared/src/domain/execution-trust-record.ts`)
and reusing the existing `Decision` domain type (`packages/shared/src/domain/decision.ts`) rather
than inventing parallel fields for what it already captures:

```ts
export interface RefusalRecord {
  /** Unique Refusal Record identifier (same ID scheme as trustRecordId). */
  readonly refusalRecordId: string;

  /** The transaction this refusal is about — same FK relationship trust records have. */
  readonly businessTransactionId: string;

  /**
   * The exact Decision that was rejected: decisionId, intentId, the
   * policy reference, the exact signals evaluated, outcome, reason,
   * evaluatedAt. This is the SAME Decision object RuntimeEngine
   * already builds via DecisionBuilder before ExecutionGate.enforce()
   * throws — not reconstructed or summarized.
   */
  readonly decision: Decision;

  /**
   * The exact Intent snapshot the signals were evaluated against —
   * Decision.signals already captures "what was declared"; this
   * captures "what would actually have executed." Required for every
   * refusal, not just binding violations, so an ordinary policy
   * REJECT and a G-24-class REJECT are evidenced the same way and
   * remain directly comparable.
   */
  readonly evaluatedIntent: IntentSnapshot; // { target?, parameters? } — same shape SignalIntentBinder already uses

  /**
   * Present only when the rejection came from SignalIntentBinder
   * (empty/absent for an ordinary PolicyEngine.evaluate REJECT).
   * The exact SignalIntentBindingViolation[] — signalKey, intentPath,
   * signalValue, intentValue — not just Decision.reason's flattened
   * prose summary of the same data. This is the evidentiary core the
   * public objection is actually asking about: what was declared,
   * what would have executed, and that they didn't match.
   */
  readonly bindingViolations?: readonly SignalIntentBindingViolation[];

  /**
   * Authenticated caller who submitted the rejected request, from
   * the same server-set metadata.submittedBy field trust records and
   * isOwnedByCaller already rely on — never client-supplied.
   */
  readonly submittedBy?: string;

  /** Canonical hash of this record, same convention as trustRecordHash. */
  readonly refusalRecordHash: string;

  /** Same Signature shape (algorithm, keyId, value, signedAt) as ExecutionTrustRecord. */
  readonly signature: Signature;

  readonly createdAt: Date;
}
```

Deliberately **not** modeled as an array/history like `executions`/`verifications`/`receipts` on
`ExecutionTrustRecord` — a refusal is a single, terminal event for a given transaction (a
transaction that was rejected was never accepted for execution, so there's no lifecycle to
append to the way an approved transaction's executions/receipts accumulate). One
`businessTransactionId` maps to at most one `RefusalRecord`, mirroring how at most one
`ExecutionTrustRecord` exists per transaction today.

## 2. Signing — reuse `packages/crypto`'s existing stack, not a direct `@parmana/sign` dependency

**Recommendation: sign Refusal Records with the exact same mechanism trust records already use** —
`CryptoBootstrap.create()`, `FileKeyProvider`, the same `DEFAULT_KEY_ID` ("default"). Concretely:
a new `RefusalCrypto` class parallel to `VerificationCrypto`
(`packages/crypto/src/VerificationCrypto.ts`), built from the same `TrustRecordHasher`/
`ArtifactSigner`/`SignatureVerifier` primitives, over a canonical view of `RefusalRecord`
excluding `signature` itself (identical pattern to `VerificationCrypto.canonicalRecord()`).

**Why not depend on `@parmana/sign` directly from `parmana-exp`**: it would point the dependency
arrow backwards. `@parmana/sign` was deliberately extracted _from_ `packages/crypto` as a clean,
decoupled, publicly-auditable subset — `parmana-exp` depending on its own spun-off package for
live production signing would mean two independently-versioned copies of near-identical
crypto code (the extraction audit confirmed `Dilithium3SignatureProvider`,
`CanonicalSerializer`, and `SignatureVerifier`'s logic are near-verbatim between the two), with
`parmana-exp`'s release cadence now coupled to `@parmana/sign`'s npm publish cadence for a
core internal capability. That's real ongoing coupling and maintenance cost for a purity gain
that doesn't actually improve verifiability.

**The nice property this doesn't cost anything to keep**: because `@parmana/sign` is a faithful,
independently-auditable extraction of the _same algorithms_ `packages/crypto` uses internally, a
third party can already inspect and trust the signing/verification _logic_ via the public
package without parmana-exp depending on it — only the key material and its use stay internal,
exactly as they already do for trust records today. Reusing `DEFAULT_KEY_ID` specifically (rather
than a separate refusal-signing key) means one public key verifies both an approval and a
refusal — one root of trust, not two — at the cost of not being able to rotate refusal-signing
independently of approval-signing. See Open Question 2.

## 3. Insertion point — one choke point, confirmed

`ExecutionGate.enforce()` is the single correct insertion point for **both** REJECT types.
Traced precisely: `RuntimeEngine.execute()` (`packages/runtime/src/RuntimeEngine.ts:159-181`)
unifies `SignalIntentBinder.findViolations()` and `PolicyEngine.evaluate()` into the exact same
`PolicyDecision` shape _before_ either reaches `decisionBuilder.build()` or
`executionGate.enforce()` — a signal-binding violation becomes `{ outcome: REJECT, matchedRuleId:
"signal-intent-binding-violation", ... }`, structurally identical from that point on to an
ordinary policy rejection. There is no second, separate exit path for the binding-violation case
to miss.

Proposed change at that single point: `ExecutionGate.enforce()` continues to throw exactly as it
does today (see §6 — the throw must never become conditional on anything else succeeding), but
the call site in `RuntimeEngine.execute()` gains a step, immediately before the `enforce()` call,
that builds and persists a `RefusalRecord` from the already-constructed `decision` object when
`decision.outcome !== APPROVED` — using data already in scope (`decision`, the `evaluatedIntent`
already computed for the binder call, `bindingViolations` if any, `transaction.metadata.submittedBy`).
No new data collection is required; every field the artifact needs already exists in memory at
that exact point in the function.

## 4. Storage — `refusal_records`, parallel to `execution_trust_records`

Additive migration, same backend (Supabase), same durability guarantees:

```sql
CREATE TABLE IF NOT EXISTS refusal_records (

    refusal_record_id TEXT PRIMARY KEY,

    business_transaction_id TEXT NOT NULL UNIQUE,

    decision_json JSONB NOT NULL,

    evaluated_intent_json JSONB NOT NULL,

    binding_violations_json JSONB,

    submitted_by TEXT,

    refusal_record_hash TEXT NOT NULL,

    signature_json JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_refusal_transaction
        FOREIGN KEY (business_transaction_id)
        REFERENCES business_transactions(business_transaction_id)
        ON DELETE RESTRICT

);

CREATE INDEX IF NOT EXISTS idx_refusal_records_created_at
ON refusal_records (created_at);

ALTER TABLE refusal_records ENABLE ROW LEVEL SECURITY;
```

`signature_json NOT NULL` (unlike `execution_trust_records.signature_json`, which was added
later via `ALTER TABLE` as nullable) — Refusal Records ship signed from day one, no
retrofit period.

A parallel `RefusalRecordRepository` interface (`create`, `findByTransactionId`) and
`SupabaseRefusalRecordRepository`, following `ExecutionTrustRecordRepository`'s existing
pattern exactly.

## 5. Verification surface — two distinct capabilities, not one

The existing `/verify`/`/verification` routes conflate "prove this signature is valid" with
"look up a specific transaction's record" behind the same caller-auth + `isOwnedByCaller` gate.
For Refusal Records this RFC proposes keeping those as **two separate capabilities**, because the
public objection is specifically about _third parties_ — not just the original caller — being
able to check a refusal happened:

- **`POST /refusal/verify`** — takes a `RefusalRecord` (or its `refusalRecordHash` +
  `signature`) the caller already has in hand and verifies the signature against the public key,
  cryptographically, with **no caller authentication required** — the same trust model
  `parmana-sign`'s `SignatureVerifier` demonstrates: verification needs the artifact and the
  public key, nothing else. This is the capability that makes "third-party-verifiable" literally
  true rather than aspirational — someone who was shown a refusal record by the rejected caller,
  or found one some other way, can check it themselves without an API key.
- **`GET /refusal/:businessTransactionId`** — looks the record up by ID from Parmana's own
  storage. This one **does** stay behind the existing `isOwnedByCaller` gate, identical to
  `/verify`/`/verification`/`/trust-records` today, since the underlying transaction content
  (signals, intent parameters) may be sensitive business data the submitting caller doesn't want
  world-readable. Mirrors `verify.ts`'s existing pattern exactly (UUID validation,
  `isOwnedByCaller` check, 404-not-403 on a mismatched owner).

This split matters: without it, either refusal records leak potentially-sensitive transaction
content to any third party (bad), or "third-party-verifiable" quietly means "verifiable only by
the original caller" (which doesn't actually answer the public objection).

## 6. Failure semantics — the REJECT never depends on the write

**The 403 must happen unconditionally.** `ExecutionGate.enforce()`'s throw is not gated on the
Refusal Record write succeeding, ever — a storage outage must never become "the action executed
because we couldn't prove we blocked it." Concretely: the Refusal Record write is attempted
synchronously, in the same request, immediately before `enforce()` throws (minimizing the window
where a refusal exists with no record yet) — but wrapped so that any failure (storage down,
constraint violation, whatever) is caught, does not alter or delay the thrown `RuntimeError`, and
does not leak into the caller's 403 response (the caller doesn't need to know or care whether the
evidentiary write succeeded — they got refused either way).

A write failure here must not be silently swallowed either — this is exactly the asymmetry the
task called out as the wrong-answer risk. Proposed: a write failure surfaces through the same
audit-severity mechanism `RazorpayWebhookAuditEvent.severity: "flagged"` already establishes —
logged loudly (`console.error` at minimum, matching the existing generic-500 pattern) and, if/when
the audit-sink signing milestone lands, recorded as its own flagged audit event ("refusal
occurred, evidentiary record failed to persist, transaction id X") so an operator can find and
reconcile these after the fact, even though the record itself is gone. This is a known,
accepted gap in an outage — not silently pretending it doesn't exist.

## 7. Test plan (proposed)

- **The G-24-class scenario, end to end, at the HTTP level** (not a unit test in isolation):
  `POST /execute` with a policy declaring `boundSignals`, signals declaring a small
  fully-verified transaction, `intent` targeting something else entirely — assert the response is
  still `403`/`POLICY_DENIED` (unchanged behavior), **and** assert a `RefusalRecord` now exists
  for that `businessTransactionId`, with `bindingViolations` populated with the exact mismatched
  fields, and its signature independently verifies via `POST /refusal/verify`. This is the test
  that actually proves the objection is closed, not just that new code compiles.
- An equivalent test for an ordinary `PolicyEngine.evaluate` REJECT (no binding violation) —
  confirms `RefusalRecord.bindingViolations` is correctly absent/empty and the record is still
  produced and verifiable.
- A tampered-record rejection test: mutate one byte of a persisted `RefusalRecord`'s
  `decision_json` (simulating an operator or attacker editing the row directly) and confirm
  `POST /refusal/verify` reports invalid — this is the test that actually distinguishes "signed"
  from "just durable," and the one most directly responsive to the "could Parmana alter this
  without detection" question.
- Ownership-scoping test for `GET /refusal/:id`: a second caller's request for another caller's
  refusal record returns 404, not the record — mirrors the existing `isOwnedByCaller` test
  pattern for `/verify`.
- Fail-open regression test: force the refusal-record write to fail (mock the repository to
  throw) and assert the 403 **still happens** and still happens with the same status/body as
  before this feature existed — the one test that directly proves §6's fail-closed guarantee
  holds under an evidentiary-write failure, not just in the happy path.
- A repository-level test mirroring the existing `SupabaseExecutionTrustRecordRepository`
  mocked-storage test style (`packages/storage/tests/unit/`) for `SupabaseRefusalRecordRepository`.

---

# Alternatives Considered

**A. Fold refusals into `ExecutionTrustRecord` itself** (e.g., an `executions: []`, `outcome:
REJECTED` variant of the existing record) instead of a new type. Rejected: `ExecutionTrustRecord`
is documented as the record of "everything Parmana knows about a Business Transaction" through
execution/receipt/settlement — conflating a thing that never executed into that same shape would
either require making most of its fields optional (weakening the existing type for every
consumer) or would misrepresent a refusal as a degenerate execution. A parallel, purpose-built
type is more honest about what it is.

**B. Sign refusals with a separate, dedicated key rather than reusing `DEFAULT_KEY_ID`.**
Considered and left as Open Question 2 rather than rejected outright — real tradeoff, not a clear
call either way.

**C. Make the Refusal Record write fully asynchronous/queued (outbox pattern) rather than
synchronous-but-non-blocking.** Would reduce request latency slightly and improve write
durability under transient failures (retry from a queue), at the cost of a real window where a
refusal has definitely happened but no record exists yet if the process crashes before the queue
drains. Given the evidentiary purpose here, minimizing that window matters more than shaving
latency — proposal keeps it synchronous-but-failure-isolated (§6). Worth revisiting if this
write turns out to be a real latency problem in practice, not before.

---

# Compatibility

- **APIs**: additive only — two new routes (`POST /refusal/verify`, `GET
/refusal/:businessTransactionId`). No existing route's request/response shape changes.
  `ExecutionGate.enforce()`'s existing throw behavior (status, code, message) is unchanged — a
  caller today cannot tell the difference in their own response between "REJECT with a Refusal
  Record" and today's "REJECT with nothing," by design (§6).
- **Runtime**: one new step in `RuntimeEngine.execute()`, on the REJECT path only. Zero change to
  the APPROVED path.
- **Verification/Evidence**: additive — a new, parallel evidence type. Does not touch
  `ExecutionTrustRecord`, `Verification`, `Receipt`, or their existing verification logic.
- **Storage**: one new table, one new repository interface/implementation. No existing table
  altered.
- **SDK**: out of scope for this RFC — a client-facing SDK method for verifying a refusal record
  would be a natural follow-up, not proposed here.

---

# Migration

Purely additive: new table, new domain type, new repository, new routes, one new step in an
existing function. No backfill possible (see Non-Goals) — refusal evidence starts from the
implementation date forward.

---

# Risks

- **Technical**: the synchronous-write-before-throw design (§6) adds latency to every REJECT
  response, proportional to one storage write. Given REJECTs are not the hot path this
  system optimizes for, judged acceptable, but worth measuring once implemented.
- **Operational**: a storage outage now produces a _known, flagged_ gap in refusal evidence
  (§6) rather than blocking refusals — correct per this RFC's own reasoning, but means "we have a
  Refusal Record for every REJECT" is a claim that's true _except during outages_, and that
  caveat needs to be stated as precisely in any public claim as the original gap was.
- **Compatibility risk**: none identified — see Compatibility above.

---

# Open Questions

1. **Scope of "policy-level REJECT."** This RFC covers `PolicyEngine.evaluate` REJECTs and
   `SignalIntentBinder` binding-violation REJECTs — both reach `ExecutionGate.enforce()` with a
   `Decision`. It explicitly does _not_ cover `PolicyNotFoundError`/`PolicyValidationError`/
   `SignalValidationError` (couldn't evaluate at all, not a decision) or caller-auth/webhook
   rejections (separate, already-scoped milestone). Confirm this boundary is where the public
   claim should actually be drawn — "every policy decided to reject" vs. "every rejected request
   of any kind" are different, both defensible, claims.
2. **Shared signing key vs. dedicated refusal key** (§2) — one root of trust for both artifact
   types, vs. independent rotation at the cost of a second key to manage. No strong technical
   reason to prefer one; this is a trust-model/operational preference call.
3. **Retention.** `ExecutionTrustRecord`s are (implicitly) kept indefinitely today. Should
   Refusal Records have the same retention policy, given they may capture rejected attempts at
   scale in a way approvals don't (e.g., a misconfigured client retrying the same rejected
   request repeatedly)? Not addressed by this RFC.
4. **Rate/volume.** If refusal volume is ever much higher than approval volume (e.g., a
   misbehaving or malicious caller hammering `/execute` with requests designed to be rejected),
   does synchronous signing-and-storage on every REJECT become a DoS vector against the signing
   key's throughput or the database? Not modeled in this RFC — worth a load-test pass before
   this ships if REJECT volume in production is or could become high.

---

# Acceptance Criteria

- A REJECT from either covered path produces exactly one `RefusalRecord`, persisted before the
  caller's response, per Open Question 1's confirmed scope.
- `POST /refusal/verify` correctly validates a genuine record and correctly rejects a tampered
  one, with no caller authentication required.
- `GET /refusal/:businessTransactionId` is ownership-scoped identically to `/verify`.
- A storage failure during the Refusal Record write never prevents, delays past an acceptable
  bound, or alters the outcome of the underlying REJECT.
- The G-24-class end-to-end test (§7) passes.

---

# References

- `docs/VERIFICATION-GAPS.md` G-24
- `packages/runtime/src/{RuntimeEngine,ExecutionGate,Runtime}.ts`
- `packages/policy/src/SignalIntentBinder.ts`
- `packages/shared/src/domain/{execution-trust-record,decision,signature}.ts`
- `packages/crypto/src/VerificationCrypto.ts`
- `packages/api/src/routes/verify.ts`, `packages/api/src/auth/isOwnedByCaller.ts`
- `supabase/migrations/20260629013035_initial_schema.sql`,
  `20260702183000_add_signature_to_execution_trust_records.sql`
- `parmana-sign` (github.com/pavancharak/parmana-sign) — referenced in §2 for the signing
  decision, not proposed as a direct dependency
