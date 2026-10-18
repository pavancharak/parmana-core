import type { Pool } from "pg";

import {
  applyChallengeRecordAppend,
  ChallengeRecord,
  ChallengeRecordAppendOperation,
  ChallengeRecordDisclosure,
  ChallengeRecordFinding,
  ChallengeRecordInvestigationStep,
  ChallengeRecordNotFoundError,
  ChallengeRecordOutcome,
  ChallengeRecordRepository,
  ChallengeRecordSource,
  ChallengeRecordStatus,
} from "@parmana/shared";

/**
 * Postgres-backed Challenge Record repository (RFC-0022).
 *
 * Writes via a direct Postgres connection (PostgresPoolFactory / a
 * caller-supplied pg.Pool), not supabase-js/PostgREST — the same
 * choice made for SupabaseCallerAuditSink (see that file), extended
 * here deliberately for a brand-new table rather than introducing a
 * new PostgREST dependency this codebase is already working to
 * reduce. Unlike that class, this one was never PostgREST-backed to
 * begin with, so "Postgres" (not "Supabase") is the accurate name.
 *
 * Known limitation, honestly stated rather than silently assumed
 * away: `append()` is a read-then-write, not wrapped in an explicit
 * transaction/row lock. Acceptable for this artifact's actual usage
 * (RFC-0022 scopes ChallengeRecord to manual, human/agent-directed
 * creation and append -- no automated or high-concurrency writer),
 * the same rigor level every other repository in this codebase
 * applies (concurrency-hardening elsewhere, e.g.
 * MemoryBusinessTransactionRepository's G-1 fix, was added only after
 * a demonstrated real race under genuine concurrent load, not
 * speculatively). Revisit if that usage assumption changes.
 */
export class PostgresChallengeRecordRepository implements ChallengeRecordRepository {
  constructor(private readonly pool: Pool) {}

  async create(record: ChallengeRecord): Promise<ChallengeRecord> {
    await this.pool.query(INSERT_CHALLENGE_RECORD_SQL, [
      record.challengeRecordId,
      record.status,
      record.claimChallenged,
      JSON.stringify(record.source),
      JSON.stringify(record.investigationSteps),
      record.finding ? JSON.stringify(record.finding) : null,
      record.outcome ? JSON.stringify(record.outcome) : null,
      record.disclosure ? JSON.stringify(record.disclosure) : null,
      record.supersedes ?? null,
      record.createdAt.toISOString(),
      record.updatedAt.toISOString(),
    ]);

    return record;
  }

  async append(
    challengeRecordId: string,
    operation: ChallengeRecordAppendOperation,
  ): Promise<ChallengeRecord> {
    const existing = await this.findById(challengeRecordId);

    if (!existing) {
      throw new ChallengeRecordNotFoundError(challengeRecordId);
    }

    const updated = applyChallengeRecordAppend(existing, operation, new Date());

    await this.pool.query(UPDATE_CHALLENGE_RECORD_SQL, [
      updated.status,
      JSON.stringify(updated.investigationSteps),
      updated.finding ? JSON.stringify(updated.finding) : null,
      updated.outcome ? JSON.stringify(updated.outcome) : null,
      updated.disclosure ? JSON.stringify(updated.disclosure) : null,
      updated.updatedAt.toISOString(),
      challengeRecordId,
    ]);

    return updated;
  }

  async findById(challengeRecordId: string): Promise<ChallengeRecord | null> {
    const { rows } = await this.pool.query(SELECT_BY_ID_SQL, [
      challengeRecordId,
    ]);

    const row = rows[0] as ChallengeRecordRow | undefined;

    return row ? rowToChallengeRecord(row) : null;
  }

  async list(): Promise<readonly ChallengeRecord[]> {
    const { rows } = await this.pool.query(SELECT_ALL_SQL);

    return (rows as ChallengeRecordRow[]).map(rowToChallengeRecord);
  }
}

const INSERT_CHALLENGE_RECORD_SQL = `
  INSERT INTO challenge_records
    (challenge_record_id, status, claim_challenged, source_json,
     investigation_steps_json, finding_json, outcome_json, disclosure_json,
     supersedes, created_at, updated_at)
  VALUES
    ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11)
`;

const UPDATE_CHALLENGE_RECORD_SQL = `
  UPDATE challenge_records
  SET
    status = $1,
    investigation_steps_json = $2::jsonb,
    finding_json = $3::jsonb,
    outcome_json = $4::jsonb,
    disclosure_json = $5::jsonb,
    updated_at = $6
  WHERE challenge_record_id = $7
`;

const SELECT_BY_ID_SQL = `
  SELECT * FROM challenge_records WHERE challenge_record_id = $1
`;

const SELECT_ALL_SQL = `
  SELECT * FROM challenge_records ORDER BY created_at ASC
`;

interface ChallengeRecordRow {
  readonly challenge_record_id: string;
  readonly status: ChallengeRecordStatus;
  readonly claim_challenged: string;
  readonly source_json: ChallengeRecordSource;
  readonly investigation_steps_json: readonly ChallengeRecordInvestigationStep[];
  readonly finding_json: ChallengeRecordFinding | null;
  readonly outcome_json: ChallengeRecordOutcome | null;
  readonly disclosure_json: ChallengeRecordDisclosure | null;
  readonly supersedes: string | null;
  readonly created_at: string | Date;
  readonly updated_at: string | Date;
}

/**
 * Reconstructs a ChallengeRecord from a raw row, converting every
 * Date-typed field back from Postgres's returned representation
 * (a string inside JSONB, a Date or string for a native timestamptz
 * column depending on driver configuration) -- required here (unlike
 * SupabaseRefusalRecordRepository's decision_json, which round-trips
 * its own nested Date fields as strings without complaint) because
 * ChallengeRecordInvestigationStep.performedAt and friends are read
 * back individually, not only ever passed through opaquely.
 */
function rowToChallengeRecord(row: ChallengeRecordRow): ChallengeRecord {
  const source: ChallengeRecordSource = {
    ...row.source_json,
    raisedAt: new Date(row.source_json.raisedAt),
  };

  const investigationSteps = row.investigation_steps_json.map(
    (step): ChallengeRecordInvestigationStep => ({
      ...step,
      performedAt: new Date(step.performedAt),
    }),
  );

  const disclosure: ChallengeRecordDisclosure | undefined = row.disclosure_json
    ? {
        ...row.disclosure_json,
        ...(row.disclosure_json.disclosedAt
          ? { disclosedAt: new Date(row.disclosure_json.disclosedAt) }
          : {}),
      }
    : undefined;

  return {
    challengeRecordId: row.challenge_record_id,
    status: row.status,
    claimChallenged: row.claim_challenged,
    source,
    investigationSteps,

    ...(row.finding_json ? { finding: row.finding_json } : {}),
    ...(row.outcome_json ? { outcome: row.outcome_json } : {}),
    ...(disclosure ? { disclosure } : {}),
    ...(row.supersedes ? { supersedes: row.supersedes } : {}),

    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
