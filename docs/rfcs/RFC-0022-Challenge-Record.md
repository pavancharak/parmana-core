# RFC-0022 — Challenge Record: a durable, checkable trace from "an assumption was questioned" to "what changed"

Status: Draft

Author: (session investigation + design, pending Pavan review)

Created: 2026-08-03

Updated: 2026-08-03

Target Version: unset — design document only, no implementation started

---

# Summary

A public commenter raised a precise, correct distinction: challenge is only operationally
valuable when it changes what an organization can _prove_, not just what it believes. They
asked how Parmana preserves the trace from "an assumption was questioned" through "evidence was
gathered" to "what changed because of it" as a first-class, durable, checkable record — the way
RFC-0021 made refusals as provable as approvals — rather than as scattered commit messages and
one-off blog posts.

This RFC proposes a **Challenge Record**: a structured, append-only artifact type that captures
a single challenge's full lifecycle — the claim questioned, its source, the investigation
method, the finding, what changed (if anything), and whether/where it was disclosed. It examines
what already exists informally today (§ Background — the honest answer is: real rigor, but
scattered across five different document shapes with no common schema, no identifier scheme, and
no cross-linking), proposes a schema and lifecycle, and gives a real recommendation on whether
this should be cryptographically signed like `RefusalRecord` and the audit-sink events (§
Proposal 3 — recommendation: **no**, for reasons specific to what this artifact is evidence
_of_, not a default extension of "sign everything").

This is a design document only. No implementation code is included or should be inferred as
approved by this document's existence, per this repository's existing RFC convention (see
RFC-0021's own framing).

---

# Motivation

Parmana's central claim is that trust in what a system did should not rest on hoping it behaved
— it should be a verifiable record (`docs/CLAIMS.md` § Mission). That standard has, so far, been
applied to _runtime_ outcomes: an execution, a refusal, a webhook receipt. The commenter's
objection is that the same standard has not been applied to the organization's own epistemic
process — the record of _how Parmana itself came to believe or disbelieve something about its
own system_. Today, that record exists, but only as a byproduct of whatever document a given
session happened to produce: a paragraph in `VERIFICATION-GAPS.md`, a git commit message, a
one-off `docs/site` page, a stale incident log. There is no single place to ask "what has Parmana
been challenged on, what did it check, and what changed" and get a complete, structured answer.

This matters for the same reason RFC-0021 mattered: an organization that says "we take challenge
seriously" but can only point to prose scattered across five documents, written in five different
styles, some of them stale, is making a claim about its own process that is no more checkable
than "trust us." The specific gap this RFC closes is process-evidentiary, not runtime-evidentiary
— but the underlying discipline (a claim without a citation is not a claim, an artifact edited
in place is not evidence) is identical to what already governs `CLAIMS.md`, `RefusalRecord`, and
`ADR-0005-Evidence-Is-Append-Only.md`.

---

# Background — what already exists, informally

This section surveys the actual shape of how challenges have been handled this year, honestly.
The short version: the _investigative rigor_ is often genuinely good — better than most projects
this size produce — but the _record-keeping_ is scattered, inconsistent in format, has no shared
identifier scheme, and in at least one case has gone stale without anyone noticing, which is
itself the strongest evidence this RFC is not solving an imaginary problem.

At least five distinct document shapes currently carry pieces of what a Challenge Record would
unify, none of them aware of the others as a category:

**1. `04-INCIDENTS-LOG.md`** (repo root) — the closest existing thing to a "challenge → finding →
resolution" ledger, with five numbered incidents (INC-1 through INC-5, plus an unnumbered "minor
findings" tail) each carrying a What/Impact/Resolution/Still-open shape. This is genuinely close
to what's being asked for. But it is dated "Snapshot: July 5, 2026" and has not been touched
since — G-24 (the most severe finding in the project's history, an external adversarial
security exercise, occurring after this log's last entry) is not in it. Neither is any part of
the Refusal Record or audit-sink signing work. It is a snapshot, not a living record, and nothing
enforces that it stays current — the exact failure mode a durable record type exists to prevent.

**2. `docs/VERIFICATION-GAPS.md`** — the most rigorous existing document by far. Each numbered gap
(G-1 through G-24) already contains, in prose, most of what a Challenge Record's fields would be:
what was checked, the finding stated precisely, what changed, and citations to the exact file/
line/test that backs each claim. G-24's entry in particular is close to a complete Challenge
Record narrative: source ("found via an external adversarial security exercise, not this
codebase's own internal audit process"), method (live proof-of-concept, reproduced twice, with
exact request payloads and before/after HTTP responses), finding (confirmed, precisely quantified
severity), and resolution (two-part code fix, cited files, 28 new tests). **What it lacks**: a
stable per-challenge identifier independent of "which numbered gap this happened to become" (a
challenge that turns out _not_ to be a gap — see "ruled out" below — has nowhere to go in this
document at all, since it's a gaps register by definition, not a challenges register); a common
schema enforced across entries (each gap's prose is shaped by whoever wrote it that session, not
by a template); and no distinction between "gap" (a defect VERIFICATION-GAPS.md is scoped to
track) and "challenge" (a question that was investigated and _resolved as unfounded_ — which
never becomes a gap and currently has no home anywhere).

**3. `docs/site/trust-and-claims/trl7-verification.mdx`** — the single closest existing artifact
to a Challenge Record in spirit, and worth naming directly: this page already does almost exactly
what § Proposal below formalizes, for one session. It has a table distinguishing what was
independently re-derived (`[AVAILABLE]`) from what rests on unverified prior-session claims
("attested, not re-verified") — precisely the confirmed/partially-confirmed/inconclusive
distinction this RFC's finding field needs. It documents a declined request (the live-money
refund) with its reasoning, not just its outcome — precisely the "what changed, or explicitly
nothing changed and here's why not" field this RFC needs. It is dated, scoped to one commit, and
publicly disclosed by construction (it's a public docs site page). **What it lacks**: everything
about it is bespoke prose written for that one page — there is no schema a second session's
equivalent page is checked against, no identifier linking it to the specific claims it
investigated, and nothing would flag it as stale the way `04-INCIDENTS-LOG.md` silently went
stale.

**4. Git commit messages and RFC "Motivation" sections** — RFC-0021's own Motivation section
opens with "A public technical objection, raised twice, is precise and correct as investigated"
— that sentence _is_ a challenge record, informally: source (public, twice), claim (refusals
leave no durable trace), method (code-level trace through four call sites, cited by file:line),
finding (confirmed in full), what changed (the entire rest of the RFC). This is high-quality
content, permanently trapped inside prose that only makes sense in the context of the RFC it
motivates — it is not independently discoverable, linkable, or queryable as "here is every claim
that has ever been challenged and what happened."

**5. `docs/CLAIMS.md` § Key Compromise Notice** — a live example of a disclosed finding
(INC-1, the exposed signing key) folded into the claims document itself rather than kept
separate, presumably because it directly qualifies a claim CLAIMS.md makes. Correct instinct
(a claim and its known defect belong near each other for a reader), but it means the same
information exists in two places (here and `04-INCIDENTS-LOG.md`) with no link between them and
no guarantee they stay consistent.

**Honest characterization**: the investigation quality is real — G-24's entry and the TRL 7 page
are not performative, they cite specific files, specific tests, specific commands run and their
output. What's missing is not rigor, it's _durability of the record as a record_: a stable
identifier per challenge, a common schema across all five shapes above, an explicit lifecycle
(so "still investigating" is distinguishable from "silently abandoned," which is exactly what
happened to `04-INCIDENTS-LOG.md`), and a way to ask "show me every challenge" that doesn't
require grepping five different documents and guessing at date ranges.

---

# Goals

- Every challenge to a specific Parmana claim or assumption — regardless of source (public
  comment, internal review, customer question, adversarial exercise, an RFC's own motivation) —
  can be recorded as one Challenge Record with a stable identifier, from the moment it's raised.
- The record captures the investigation itself (method: what was actually read, run, or queried
  — not only the conclusion), separately from the finding, separately from what changed.
- The finding is stated in one of a fixed, precise vocabulary (see § Proposal 1) — not free-form
  prose that can quietly round "we didn't find anything conclusive" up to "confirmed there's no
  issue," the exact rounding-up `docs/site/trust-and-claims/claims-discipline.mdx` already
  identifies as the failure mode CLAIMS.md exists to prevent.
- A challenge that turns out to be unfounded ("ruled out") gets recorded with the same rigor as
  one that turns out to be real — today, an unfounded challenge has no durable home at all (it
  isn't a gap, so `VERIFICATION-GAPS.md` doesn't take it; it isn't a resolution, so nothing else
  does either), which silently biases the visible record toward "things we were wrong about,"
  the opposite of what a credible challenge-tracking record should show.
- A Challenge Record's lifecycle is append-only, matching `ADR-0005-Evidence-Is-Append-Only.md`'s
  existing discipline: a correction or a later update to an already-recorded investigation is a
  new entry linked to the record, never an edit of a prior one.
- Existing documents (`VERIFICATION-GAPS.md`, `CLAIMS.md`, RFC Motivation sections, the `docs/
site/trust-and-claims` pages) keep doing what they already do well — this is not a proposal to
  replace any of them.

# Non-Goals

- Retrofitting Challenge Records onto historical challenges already resolved this year (G-24, the
  audit-sink signing work, INC-1 through INC-5, the TRL 7 session) — explicitly out of scope per
  the task that produced this RFC. This is about the record going forward.
- Cryptographic signing of Challenge Records at creation time, the way `RefusalRecord` and the
  audit-sink events are signed — see § Proposal 3 for the reasoning; the recommendation is that
  this is the wrong mechanism for this artifact type, not an oversight.
- Tracking every organizational decision ever made. Scoped narrowly to _challenges to a specific,
  identifiable Parmana claim or assumption_ — see § Practical Scope for the precise boundary,
  deliberately mirroring how RFC-0021 scoped itself to policy/binding REJECTs rather than every
  possible rejection type.
- Automating challenge _detection_ (e.g., scraping public comments, monitoring a support inbox).
  This RFC assumes a human decides something is worth opening a Challenge Record for; it does not
  propose how that decision gets triggered.
- Replacing `04-INCIDENTS-LOG.md`, `VERIFICATION-GAPS.md`, or `CLAIMS.md`. Each stays as the
  authoritative source for what it already does (a security/defect ledger, a gaps register, a
  capability register, respectively); § Proposal 4 defines the relationship precisely.
- A public-facing UI, feed, or search interface over Challenge Records. This RFC proposes the
  artifact and its storage shape only; a public browsing surface (arguably the more direct answer
  to "how do I check this as a third party") is real future work, named but not designed here.

---

# Proposal

## 1. The artifact — `ChallengeRecord`

Working name evaluated against Parmana's existing conventions: `Record` suffix is already used
for a durable, identifiable, storage-backed artifact (`ExecutionTrustRecord`, `RefusalRecord`),
while `Event` is used for an append-to-a-stream audit-sink entry with no independent lifecycle
of its own (`CallerAuditEvent`, `RazorpayWebhookAuditEvent`). A challenge has an identity that
persists across multiple updates (opened → investigating → resolved) the way a transaction's
trust record does, not a one-shot fact the way an audit event does — `ChallengeRecord` fits the
existing naming pattern correctly. Proposed name: **`ChallengeRecord`**.

Unlike `RefusalRecord` (explicitly "a single, terminal event for a given transaction... no
lifecycle to append to"), a `ChallengeRecord` is closer to `ExecutionTrustRecord`'s own shape: an
identity with an append-only sequence of entries recording the challenge's progress, per
`ADR-0005`. Proposed structure:

```ts
export interface ChallengeRecord {
  /** Unique Challenge Record identifier (same ID scheme as trustRecordId/refusalRecordId). */
  readonly challengeRecordId: string;

  /** Fixed vocabulary — see below. Append-only: only ever moves forward, never reopens by
   *  mutating this field; a challenge believed closed that turns out to need more work becomes
   *  a NEW ChallengeRecord that references the prior one (see "linkage," below), not a status
   *  flip on the old one. */
  readonly status: "open" | "investigating" | "resolved";

  /** The specific claim or assumption being challenged, stated precisely enough that someone
   *  unfamiliar with the conversation that raised it can tell exactly what's being checked.
   *  Where possible, a citation to the exact claim (a CLAIMS.md line, a specific doc page, a
   *  specific piece of code or a specific public statement) — mirrors CLAIMS.md's own
   *  citation discipline: a challenge without a citable claim is not yet a Challenge Record,
   *  it's a vague concern. */
  readonly claimChallenged: string;

  /** How the challenge surfaced. Structured, not free text, so "where do challenges come
   *  from" is a queryable field, not something buried in prose. */
  readonly source: {
    readonly kind:
      | "public-comment"
      | "internal-review"
      | "customer-question"
      | "adversarial-exercise"
      | "self-identified";
    /** A URL, a name, "anonymous," or an internal identifier — whatever attribution is
     *  actually available and appropriate to disclose; may be withheld (see Open Question 3). */
    readonly attribution?: string;
    readonly raisedAt: Date;
  };

  /** The investigation itself — an ordered, append-only list of entries, each one a discrete
   *  investigative step. This is the field the motivating objection is most specifically
   *  about: "not just the conclusion, the method." Mirrors the granularity
   *  docs/VERIFICATION-GAPS.md and the TRL 7 page already achieve in prose, made structured. */
  readonly investigationSteps: readonly {
    readonly performedAt: Date;
    /** What was actually examined: a file path, a test name, a command run and its output,
     *  a specific log query, a specific data record — the same "cites a file, a line, or a
     *  specific test" discipline VERIFICATION-GAPS.md's own Purpose section already states. */
    readonly method: string;
    readonly observation: string;
  }[];

  /** The finding, in a fixed, precise vocabulary — deliberately narrower than free prose so it
   *  cannot be quietly rounded up or down. */
  readonly finding?: {
    readonly outcome:
      "confirmed" | "partially-confirmed" | "ruled-out" | "inconclusive";
    /** Precise statement of what, exactly, "confirmed" or "ruled out" means here — this field
     *  is required whenever outcome is set; a bare enum value with no explanation is exactly
     *  the kind of unchecked assertion this record type exists to prevent. */
    readonly statement: string;
  };

  /** What changed as a result. Explicitly supports "nothing changed" as a first-class,
   *  disclosed outcome, not an implicit absence — see Goals. */
  readonly outcome?: {
    readonly changed: boolean;
    /** If changed: a design decision, a code change (cite the commit/PR), a public disclosure
     *  (cite the page), a new RFC, a VERIFICATION-GAPS.md gap number, etc. If not changed: the
     *  reason, stated as precisely as the finding itself. */
    readonly description: string;
    /** Cross-links to whatever this actually produced — a commit hash, an RFC number, a
     *  VERIFICATION-GAPS.md gap ID, a docs/site page path. Free-form, deliberately: the set of
     *  things a challenge can produce is open-ended, and an enum here would just be worked
     *  around with an "other" bucket. */
    readonly references: readonly string[];
  };

  /** Disclosure: whether and where this was made public. A ChallengeRecord can exist and be
   *  fully internal (e.g., a customer question resolved privately) — disclosure is a separate,
   *  explicit fact, not implied by the record's own existence. */
  readonly disclosure?: {
    readonly disclosedPublicly: boolean;
    readonly location?: string; // e.g. a docs/site path, a changelog entry, a public repo file
    readonly disclosedAt?: Date;
  };

  /** Links this record to a prior ChallengeRecord it supersedes or follows up on — e.g. a
   *  challenge believed "resolved" that later needed reopening becomes a new record linked
   *  here, per ADR-0005's "corrections are new artifacts, not edits" discipline. */
  readonly supersedes?: string; // challengeRecordId

  readonly createdAt: Date;
  readonly updatedAt: Date;
}
```

Two deliberate departures from `RefusalRecord`'s shape, both because the underlying thing being
modeled is different:

- **No single `signature` field** — see § Proposal 3.
- **An append-only `investigationSteps` array and a mutable-only-by-new-record `status`**,
  rather than one immutable object written once. A challenge is investigated over time, often
  across multiple sessions; forcing it into a single write-once shape (as `RefusalRecord`
  correctly does for an instantaneous rejection) would either produce records written
  prematurely (before the investigation is actually done) or force awkward "supersedes" chains
  for what is really one continuous investigation. `ExecutionTrustRecord`'s own precedent
  (`executions`/`verifications`/`receipts` as accumulating arrays on one identity) is the closer
  match here, not `RefusalRecord`'s.

## 2. Multiple sources, one schema

The `source.kind` enum is deliberately a closed but reviewable set covering everything the
Background survey found in practice this year: `public-comment` (this RFC's own motivating
example, and RFC-0021's), `internal-review` (an author or reviewer questioning their own or a
colleague's prior claim mid-session), `customer-question`, `adversarial-exercise` (G-24's
source), and `self-identified` (a session finding something questionable without external
prompting — the TRL 7 page's leftover-flag discovery is this kind). Every existing informal
record surveyed in § Background maps cleanly onto one of these five, which is evidence the
enum is grounded in what actually happens here rather than speculative.

## 3. Should this be signed? — Recommendation: no

**Recommendation: do not sign Challenge Records the way `RefusalRecord` and the audit-sink
events are signed.** This needs a real reason, not a default, so here is the reasoning through:

**What signing actually buys, in the cases where Parmana already does it.** `RefusalRecord` and
the audit-sink events are signed because they are evidence of a _runtime transaction outcome_ —
a specific, momentary fact ("this request was rejected at this instant, for this reason") that
(a) happens automatically, without a human deciding what to write, (b) is adversarial by
construction — the entity most motivated to dispute or alter the record (a caller who was
rejected, an attacker who wants to claim they weren't) is a different party from the one who
wrote it, and (c) needs to be verifiable by a third party _without trusting Parmana's own
database_, because the whole point is proving something happened even if Parmana later wanted to
deny it.

**Why that doesn't transfer here.** A Challenge Record is evidence of an _organizational
process_ — a human (or an AI agent acting on a human's behalf, as in this very task) deciding
what to investigate, how, and what it means. It is not adversarial in the same sense: the party
with an incentive to misrepresent a Challenge Record is the same party who writes it (Parmana
itself, choosing what counts as "confirmed" versus "ruled out"), not an external party being held
accountable by a signature they can't forge. A cryptographic signature over a `ChallengeRecord`
would prove "this exact JSON existed, signed with this key, at this time" — which is a real,
non-trivial property (it would catch a later silent edit) — but it does **not** prove the
investigation was conducted honestly, that the method described was actually followed, or that
"ruled out" wasn't a face-saving mischaracterization of "inconclusive." Signing would buy tamper-
evidence for a record whose actual trust problem is upstream of tampering: whether the person (or
agent) writing it was rigorous and honest in the first place. That is not a problem a signature
can solve, and presenting one as if it did would overstate what's actually being proven — exactly
the kind of overclaim `docs/CLAIMS.md` and this project's own discipline exist to prevent.

**What actually does the work here, instead:**

- **Append-only storage** (§ Proposal 1's `investigationSteps` array, ADR-0005's discipline) —
  catches "was this edited after the fact," which is the property signing would have provided
  that's actually relevant, without needing key management for a process artifact.
- **Citation discipline** — every `investigationSteps` entry and `finding.statement` should cite
  a specific, independently-checkable thing (a file, a commit, a command's real output), the same
  discipline that already makes `CLAIMS.md` and `VERIFICATION-GAPS.md` credible without any
  cryptography at all. A reader doesn't need a signature to check "does
  `packages/runtime/src/ExecutionGate.ts` actually say what this record claims it says" —
  they need the citation, and the ability to go look, same as today.
- **Public disclosure** (§ Proposal 1's `disclosure` field) — for challenges disclosed publicly,
  the durable evidence against silent alteration is the same mechanism `docs/site` pages, git
  history, and this very RFC already rely on: it's public, it's dated, and a later silent edit is
  itself detectable by anyone who saved or cited the original. This is weaker than a signature in
  the abstract, but it is the mechanism that actually matches the trust problem (public
  accountability for a process claim), where a signature would answer a question nobody asked
  ("was the bytes-on-disk tampered with") while leaving the real question ("was the investigation
  honest") completely unaddressed.

**Where the recommendation could be wrong** — flagged honestly rather than glossed over: if
Challenge Records ever become the substrate for a compliance or contractual claim ("we commit to
disclosing every confirmed security finding within N days, verifiably"), signing plus a
disclosure timestamp would start to matter for a different reason — proving _when_ a finding was
first recorded internally, to defend against a later claim that Parmana sat on something. That is
a real, different property than the "who wrote this and were they honest" problem above, and if
that use case materializes, revisit this recommendation specifically for the timestamp-integrity
property, not for a general "sign everything" reflex. Not proposed now because no such compliance
commitment exists today to make it load-bearing.

## 4. Relationship to `CLAIMS.md` and `VERIFICATION-GAPS.md`

Genuinely different purposes, precisely stated:

- **`CLAIMS.md` tracks current capability state** — what Parmana claims to be true _right now_,
  present tense, each claim tiered (`[AVAILABLE]`/`[PARTIAL]`/`[ROADMAP]`) and cited. It answers
  "what can I rely on today."
- **`VERIFICATION-GAPS.md` tracks currently-open (and recently-closed) defects and unverified
  edges** — a companion register scoped specifically to gaps, severity-tiered. It answers "where
  are the unproven edges right now."
- **A `ChallengeRecord` tracks the historical _process_ of how one specific doubt was raised and
  resolved** — not the current state of anything, but the record of a single episode:
  who/what questioned it, what was checked, what was found, what changed. It answers "how did
  Parmana come to believe or disbelieve this specific thing, and when."

**No duplication, but real overlap at the edges, handled by cross-reference not merger**: when a
Challenge Record's investigation confirms a real defect, its `outcome.references` field should
cite the resulting `VERIFICATION-GAPS.md` gap number (the way this very RFC's Motivation section
already cites G-24 informally) — the gap entry stays the authoritative "is this still open"
answer (a gap can be reopened, revised, tracked over months); the Challenge Record stays the
authoritative "what was the investigation that found it" answer, frozen at the time it happened.
Similarly, if a Challenge Record's finding changes what `CLAIMS.md` should say, `CLAIMS.md`'s own
entry is what gets edited/promoted (it must stay present-tense and current), while the Challenge
Record stays the historical account of _why_ it changed. The Challenge Record is never a
substitute for updating either document — it is the audit trail explaining why an update
happened, one level of abstraction removed from "what is currently true," the same relationship
a commit message has to the code it changed, made structured and durable rather than prose in a
scrolling git log.

---

## 5. Practical scope for a first version

**In scope for v1:**

- The `ChallengeRecord` schema as specified in § Proposal 1, stored durably (mirroring
  `RefusalRecord`'s storage precedent: a dedicated table, one row per record, `investigationSteps`
  as an appendable JSON array column rather than a separate child table — simplest thing that
  respects append-only semantics without a join).
- Manual creation and append, by whoever (human or AI agent, under human direction) is doing the
  investigating — no automated triggering. A `ChallengeRecordRepository` with `create`, `append`
  (adds an investigation step or sets the finding/outcome/disclosure — never edits a prior
  field), and `findById`/`list`, mirroring the repository patterns `RefusalRecordRepository` and
  `ExecutionTrustRecordRepository` already establish.
- Every field required by § Proposal 1 to be filled with a real citation, not boilerplate — the
  same discipline enforced by convention (review, not tooling) that already governs
  `VERIFICATION-GAPS.md` and `CLAIMS.md` entries today.
- One worked example, written going forward (not retrofit — see Non-Goals) the first time a real
  challenge is investigated after this RFC is accepted, to prove the schema survives contact with
  a real case before anything is declared done.

**Explicitly out of scope for v1, named so it isn't silently assumed:**

- Any signing or cryptographic verification (§ Proposal 3).
- A public API route or `docs/site` browsing surface over Challenge Records — records exist in
  storage and can be manually rendered into a doc page (as the TRL 7 page already does by hand
  today) but no dedicated `/challenges` endpoint or public index page is proposed here.
- Automated detection/triage of incoming challenges (public comments, support tickets).
- Retention policy — same open question RFC-0021 left open for `RefusalRecord` (Open Question 3
  there); inherits the same unresolved status here, not re-litigated.
- Migrating or backfilling `04-INCIDENTS-LOG.md`'s five existing incidents, `VERIFICATION-GAPS.md`'s
  24 gaps, or the TRL 7 page's findings into `ChallengeRecord` rows. Those documents remain
  authoritative for what already happened; this RFC governs what gets recorded from here forward.
- A decision on whether `04-INCIDENTS-LOG.md` should be retired in favor of `ChallengeRecord`
  going forward, or kept as a lighter-weight, faster-to-write parallel format for pure code
  defects that never had an external "challenge" framing. Real question, not decided here — see
  Open Question 1.

---

# Alternatives Considered

**A. Extend `VERIFICATION-GAPS.md`'s existing gap format to also cover "ruled out" challenges**,
rather than a new artifact type. Rejected: `VERIFICATION-GAPS.md`'s own stated Purpose is "every
place a claim, a code path, or a piece of production behavior is _not_ independently verified
today" — it is a gaps register by definition. Forcing "we checked and there is no gap here" into
a gaps register either misrepresents a non-finding as a finding (weakening the document for
every real gap) or requires a parallel "checked, found nothing" section that is, in effect, a
different artifact type wearing the same document's name. A separate type is more honest about
what it is, the same reasoning RFC-0021 gave for not folding `RefusalRecord` into
`ExecutionTrustRecord`.

**B. Sign Challenge Records after all, reusing `DEFAULT_KEY_ID`** (mirroring `RefusalRecord`'s
own reuse-the-existing-key decision). Considered directly and rejected in § Proposal 3, not for
lack of mechanism (the mechanism is trivially available) but because it would prove a property
(tamper-evidence of bytes-on-disk) that isn't the actual trust gap this artifact has, while
implying a stronger guarantee (investigation honesty) that it cannot provide.

**C. Treat every `ChallengeRecord` as automatically, immediately public**, removing the
`disclosure` field's optionality. Rejected: some challenges are legitimately investigated and
resolved without ever being appropriate to disclose (an internal review of a claim that turns out
to be fine, a customer question specific to their own deployment) — see the source and
attribution note in Open Question 3. Making disclosure a first-class, explicit, per-record
decision (as designed) rather than an automatic default is more honest about the fact that not
every internal check is a public disclosure, and avoids creating pressure to under-document
internal investigations for fear that documenting them means publishing them.

**D. Make `ChallengeRecord` a single write-once object like `RefusalRecord`**, rather than an
append-only-array lifecycle. Rejected in § Proposal 1's own text: a challenge is investigated
over real time, often across sessions, and forcing single-shot writes would either produce
premature records or an awkward chain of `supersedes` links for what is really one continuous
investigation.

---

# Compatibility

- **Existing documents**: additive only. `CLAIMS.md`, `VERIFICATION-GAPS.md`,
  `04-INCIDENTS-LOG.md`, and every RFC keep functioning exactly as they do today; § Proposal 4
  defines cross-referencing, not replacement.
- **Storage/API/Runtime**: no runtime code path is touched by this RFC at all — `ChallengeRecord`
  is a process artifact, not a runtime one, created by a human/agent investigating something, not
  by any request-handling code. This is a meaningful difference from `RefusalRecord`, which
  required a specific insertion point in `RuntimeEngine.execute()`; nothing analogous exists here
  because nothing in the runtime request path produces a Challenge Record.

# Migration

Purely additive, going forward only (see Non-Goals — no backfill).

---

# Risks

- **Process risk, not technical risk, dominates here.** The entire value of this artifact type
  depends on people (or agents) actually using it — writing a `ChallengeRecord` is more overhead
  than a commit message, and nothing in this RFC's technical design forces its own adoption the
  way, say, `ExecutionGate.enforce()`'s single choke point forced every REJECT through
  `RefusalRecord`'s write path in RFC-0021. Without a habit or a lightweight trigger (a PR
  template checklist item, a session-closeout convention), this could become exactly the kind of
  well-designed-but-unused artifact `04-INCIDENTS-LOG.md` already demonstrates is possible even
  for a good-faith, well-intentioned document. Named directly as Open Question 4, not solved here.
- **Honesty risk**: because signing is deliberately not proposed (§ Proposal 3), the entire
  credibility of a `ChallengeRecord` rests on citation discipline and human/reviewer honesty, the
  same as `CLAIMS.md` and `VERIFICATION-GAPS.md` already do. This is a known, accepted trade-off
  given § Proposal 3's reasoning, not an oversight, but it means a `ChallengeRecord` is only ever
  as trustworthy as the review process around it, and that should be stated as plainly in any
  public description of this feature as the underlying limitation is here.
- **Compatibility risk**: none identified.

---

# Open Questions

1. **Does `04-INCIDENTS-LOG.md` get retired, kept as a lighter-weight parallel format, or folded
   into `ChallengeRecord` going forward?** Real, unresolved question. Arguments for keeping it
   separate: pure code defects found via internal review (most of INC-1 through INC-5) don't
   always have an external "challenge" framing, and a lighter free-text format may stay more
   likely to actually get used (see Risk above) than a fuller schema. Arguments for folding it
   in: maintaining two overlapping formats is exactly the "five different shapes, no common
   schema" problem this RFC exists to fix. This is a process/positioning call, not a technical
   one — flagged rather than decided.

2. **Storage backend and repository shape.** This RFC assumes Supabase, mirroring every other
   durable record type in this codebase, but does not specify the table DDL or repository
   interface in the detail RFC-0021 did for `RefusalRecord` — that level of detail belongs to an
   implementation-planning pass, not this design document, once the schema in § Proposal 1 is
   confirmed.

3. **Attribution and disclosure defaults for non-public sources.** When a challenge comes from an
   internal review or a customer question, should `source.attribution` default to withheld, or
   should there be an explicit policy for when a customer's identity can appear in a record that
   might later be disclosed? Real privacy/positioning question, not addressed here.

4. **Adoption mechanism.** What actually causes a `ChallengeRecord` to get written, given nothing
   in the runtime forces it the way `ExecutionGate.enforce()` forces `RefusalRecord`? A checklist
   item in a PR/session-closeout template is the most obvious candidate but is itself a process
   decision outside this RFC's technical scope, named in Risks but not designed here.

5. **Should "ruled out" findings ever be withheld from disclosure** (e.g., a public challenge that
   turns out to reveal something else sensitive in the course of ruling out the original claim)?
   RFC-0021's own Refusal Record work assumed disclosure is always safe once a record exists;
   that assumption may not hold identically here, since a Challenge Record's `investigationSteps`
   can reference things (internal logs, specific data) that a Refusal Record's fixed schema
   never would. Worth a real answer before any public-disclosure tooling is built on top of this,
   not before this RFC itself.

---

# References

- `docs/rfcs/RFC-0021-Refusal-Record.md` — structural precedent this RFC mirrors, and the
  artifact type § Proposal 3 compares against directly.
- `docs/adr/ADR-0005-Evidence-Is-Append-Only.md` — the append-only discipline this RFC's
  `investigationSteps`/lifecycle design applies to a non-runtime artifact for the first time.
- `04-INCIDENTS-LOG.md` — surveyed in § Background; the closest existing informal precedent, and
  itself evidence of the staleness problem this RFC addresses.
- `docs/VERIFICATION-GAPS.md`, especially the G-24 entry and its own Purpose section's citation
  discipline — surveyed in § Background; relationship defined precisely in § Proposal 4.
- `docs/site/trust-and-claims/trl7-verification.mdx` — surveyed in § Background; the single
  closest existing artifact to a Challenge Record in spirit, referenced directly in § Proposal 1
  and 3 for its confirmed/attested-not-reverified distinction and its disclosed-declined-request
  precedent.
- `docs/site/trust-and-claims/claims-discipline.mdx`, `docs/CLAIMS.md` — the citation and
  present-tense discipline this RFC's `finding`/`investigationSteps` fields are modeled on;
  relationship defined precisely in § Proposal 4.
- `packages/shared/src/domain/execution-trust-record.ts` — the accumulating-array precedent
  `ChallengeRecord.investigationSteps` follows, in preference to `RefusalRecord`'s single-shot
  shape.
