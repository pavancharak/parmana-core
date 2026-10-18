/**
 * Challenge Record (RFC-0022).
 *
 * A durable, structured trace of one specific challenge to a Parmana
 * claim or assumption: what was challenged, who/how it surfaced, what
 * was actually checked (the investigation method, not only the
 * conclusion), the finding, what changed as a result (if anything),
 * and whether/where it was disclosed.
 *
 * Deliberately NOT signed — see RFC-0022 § Proposal 3. A
 * ChallengeRecord is evidence of an organizational process (a human
 * or agent deciding what to investigate and what it means), not a
 * runtime transaction outcome; the party who could misrepresent it is
 * the same party who writes it, so a signature would prove
 * tamper-evidence of bytes-on-disk while leaving the actual trust
 * question (was the investigation honest) unaddressed. Trustworthy
 * instead through citation discipline (every investigation step and
 * finding should cite something independently checkable) and, where
 * applicable, public disclosure — the same discipline docs/CLAIMS.md
 * and docs/VERIFICATION-GAPS.md already rely on with no cryptography.
 *
 * Append-only, per ADR-0005-Evidence-Is-Append-Only.md, but unlike
 * RefusalRecord (a single terminal event with nothing to append to),
 * a ChallengeRecord is investigated over real time: investigationSteps
 * accumulates, and status moves forward (open -> investigating ->
 * resolved) without ever reopening by mutating a prior entry — a
 * challenge believed resolved that later needs more work becomes a
 * NEW ChallengeRecord linked via `supersedes`, not an edit to this
 * one. See ChallengeRecordRepository.append, which enforces this.
 */
export interface ChallengeRecord {
  /**
   * Unique Challenge Record identifier.
   */
  readonly challengeRecordId: string;

  /**
   * Lifecycle status. Only ever moves forward (open ->
   * investigating -> resolved); never reopens in place.
   */
  readonly status: ChallengeRecordStatus;

  /**
   * The specific claim or assumption being challenged, stated
   * precisely enough that someone unfamiliar with the conversation
   * that raised it can tell exactly what's being checked. Where
   * possible, cites the exact claim (a CLAIMS.md line, a doc page, a
   * piece of code, a specific public statement) — the same citation
   * discipline docs/CLAIMS.md already applies to its own claims.
   */
  readonly claimChallenged: string;

  /**
   * How the challenge surfaced. Set once, at creation; not part of
   * the append-only lifecycle.
   */
  readonly source: ChallengeRecordSource;

  /**
   * The investigation itself, in order. Append-only: existing entries
   * are never edited or removed, only added to.
   */
  readonly investigationSteps: readonly ChallengeRecordInvestigationStep[];

  /**
   * The finding, in a fixed, precise vocabulary. Absent while the
   * challenge is still open/investigating. Immutable once set — a
   * later correction is a new ChallengeRecord (see `supersedes`),
   * never an edit here.
   */
  readonly finding?: ChallengeRecordFinding;

  /**
   * What changed as a result, including the explicit "nothing
   * changed" case. Immutable once set, same as `finding`.
   */
  readonly outcome?: ChallengeRecordOutcome;

  /**
   * Whether and where this was disclosed publicly. A ChallengeRecord
   * may exist and stay fully internal — disclosure is a separate,
   * explicit fact, never implied by the record's own existence.
   * Immutable once set, same as `finding`.
   */
  readonly disclosure?: ChallengeRecordDisclosure;

  /**
   * The prior ChallengeRecord this one supersedes or follows up on
   * (e.g. a challenge believed resolved that needed reopening).
   * ADR-0005's "corrections are new artifacts, not edits" discipline
   * applied to this artifact type.
   */
  readonly supersedes?: string;

  /**
   * UTC timestamp when this Challenge Record was created.
   */
  readonly createdAt: Date;

  /**
   * UTC timestamp of the most recent append (investigation step,
   * status change, finding, outcome, or disclosure). Equal to
   * createdAt until the first append.
   */
  readonly updatedAt: Date;
}

/**
 * Fixed lifecycle vocabulary. Deliberately closed (not free text) so
 * "is this still being worked on" is always a checkable field, never
 * inferred from prose — the same reasoning behind `finding.outcome`
 * below.
 */
export type ChallengeRecordStatus = "open" | "investigating" | "resolved";

/**
 * Where a challenge came from. A closed, reviewable set covering
 * every source RFC-0022's own survey of this year's informal
 * challenge-handling found in practice.
 */
export interface ChallengeRecordSource {
  readonly kind:
    | "public-comment"
    | "internal-review"
    | "customer-question"
    | "adversarial-exercise"
    | "self-identified";

  /**
   * A URL, a name, or an internal identifier — whatever attribution
   * is actually available and has been explicitly cleared for
   * inclusion. Defaults to withheld: omit this field rather than
   * populate it with a name/identifier that hasn't been explicitly
   * confirmed safe to record (RFC-0022 Open Question 3 resolution —
   * attribution never defaults toward disclosure).
   */
  readonly attribution?: string;

  readonly raisedAt: Date;
}

/**
 * One discrete investigative step: what was actually examined, not
 * only what was concluded. Mirrors the "cites a file, a line, or a
 * specific test" discipline docs/VERIFICATION-GAPS.md's own Purpose
 * section already states.
 */
export interface ChallengeRecordInvestigationStep {
  readonly performedAt: Date;

  /**
   * What was actually examined: a file path, a test name, a command
   * run, a specific log query, a specific data record.
   */
  readonly method: string;

  readonly observation: string;
}

/**
 * The finding, in a fixed, precise vocabulary — deliberately narrower
 * than free prose so it cannot be quietly rounded up ("inconclusive"
 * becoming "confirmed there's no issue") or down.
 */
export interface ChallengeRecordFinding {
  readonly outcome:
    "confirmed" | "partially-confirmed" | "ruled-out" | "inconclusive";

  /**
   * Precise statement of what, exactly, the outcome means here. A
   * bare enum value with no explanation is exactly the kind of
   * unchecked assertion this record type exists to prevent.
   */
  readonly statement: string;
}

/**
 * What changed as a result of the challenge. `changed: false` is a
 * first-class, disclosed outcome, not an implicit absence of this
 * field.
 */
export interface ChallengeRecordOutcome {
  readonly changed: boolean;

  /**
   * If changed: the design decision, code change, disclosure, or new
   * RFC/gap this produced. If not changed: the reason, stated as
   * precisely as `finding.statement`.
   */
  readonly description: string;

  /**
   * Cross-links to whatever this produced — a commit hash, an RFC
   * number, a VERIFICATION-GAPS.md gap id, a docs/site page path.
   * Deliberately free-form: the set of things a challenge can produce
   * is open-ended.
   */
  readonly references: readonly string[];
}

/**
 * Whether and where a Challenge Record was disclosed publicly.
 */
export interface ChallengeRecordDisclosure {
  readonly disclosedPublicly: boolean;

  /** A docs/site path, a changelog entry, a public repo file. */
  readonly location?: string;

  readonly disclosedAt?: Date;
}
