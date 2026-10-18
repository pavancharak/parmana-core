import type { Pool } from "pg";

import type {
  ExecutionIntent,
  ExecutionIntentFinalizationMode,
  ExecutionIntentRepository,
  ExecutionIntentResolution,
  ExecutionIntentResolutionInput,
  ExecutionIntentState,
  StoredExecutionIntent,
} from "@parmana/shared";

/**
 * Postgres implementation of ExecutionIntentRepository (ADR-0012), following
 * SupabaseRefusalRecordRepository. The state transitions are enforced in SQL
 * so they hold under concurrency: markReleased and markErrored only move a
 * PREPARED row, markResolved only moves a PREPARED or ERRORED row, and
 * markFinalized never moves a FINALIZED row. markFinalized
 * also deletes the saved release context: once the Trust Record exists that
 * copy has no further use, and it holds the full execution context.
 */
export class SupabaseExecutionIntentRepository implements ExecutionIntentRepository {
  constructor(private readonly pool: Pool) {}

  async create(intent: ExecutionIntent): Promise<ExecutionIntent> {
    await this.pool.query(INSERT_SQL, [
      intent.intentId,
      intent.businessTransactionId,
      intent.decisionId,
      intent.authorizationId,
      intent.policyName,
      intent.policyVersion,
      intent.policyContentHash ?? null,
      intent.signalsHash ?? null,
      intent.businessTransactionHash,
      intent.action,
      intent.target,
      intent.submittedBy ?? null,
      intent.grantedCapability ?? null,
      intent.intentHash,
      JSON.stringify(intent.signature),
      intent.createdAt.toISOString(),
    ]);

    return intent;
  }

  async findByTransactionId(
    businessTransactionId: string,
  ): Promise<StoredExecutionIntent | null> {
    const { rows } = await this.pool.query(SELECT_BY_TRANSACTION_ID_SQL, [
      businessTransactionId,
    ]);

    const row = rows[0] as ExecutionIntentRow | undefined;

    return row ? toStored(row) : null;
  }

  async markReleased(
    businessTransactionId: string,
    releasedContext: unknown,
    releasedAt: Date,
  ): Promise<void> {
    await this.pool.query(MARK_RELEASED_SQL, [
      businessTransactionId,
      JSON.stringify(releasedContext),
      releasedAt.toISOString(),
    ]);
  }

  async markFinalized(
    businessTransactionId: string,
    trustRecordId: string,
    mode: ExecutionIntentFinalizationMode,
    finalizedAt: Date,
  ): Promise<void> {
    await this.pool.query(MARK_FINALIZED_SQL, [
      businessTransactionId,
      trustRecordId,
      mode,
      finalizedAt.toISOString(),
    ]);
  }

  async markErrored(
    businessTransactionId: string,
    reason: string,
  ): Promise<void> {
    await this.pool.query(MARK_ERRORED_SQL, [businessTransactionId, reason]);
  }

  async markResolved(
    businessTransactionId: string,
    input: ExecutionIntentResolutionInput,
  ): Promise<boolean> {
    const result = await this.pool.query(MARK_RESOLVED_SQL, [
      businessTransactionId,
      input.resolution,
      input.note,
      input.resolvedBy ?? null,
      input.resolvedAt.toISOString(),
    ]);

    return result.rowCount === 1;
  }

  async listUnfinalized(
    limit: number,
  ): Promise<readonly StoredExecutionIntent[]> {
    const { rows } = await this.pool.query(LIST_UNFINALIZED_SQL, [limit]);

    return (rows as ExecutionIntentRow[]).map(toStored);
  }
}

function toStored(row: ExecutionIntentRow): StoredExecutionIntent {
  const intent: ExecutionIntent = {
    intentId: row.intent_id,
    businessTransactionId: row.business_transaction_id,
    decisionId: row.decision_id,
    authorizationId: row.authorization_id,
    policyName: row.policy_name,
    policyVersion: row.policy_version,
    ...(row.policy_content_hash !== null
      ? { policyContentHash: row.policy_content_hash }
      : {}),
    ...(row.signals_hash !== null ? { signalsHash: row.signals_hash } : {}),
    businessTransactionHash: row.business_transaction_hash,
    action: row.action,
    target: row.target,
    ...(row.submitted_by !== null ? { submittedBy: row.submitted_by } : {}),
    ...(row.granted_capability !== null
      ? { grantedCapability: row.granted_capability }
      : {}),
    createdAt: new Date(row.created_at),
    intentHash: row.intent_hash,
    signature: row.signature_json,
  };

  return {
    intent,
    status: {
      state: row.state,
      ...(row.released_at !== null
        ? { releasedAt: new Date(row.released_at) }
        : {}),
      ...(row.finalized_at !== null
        ? { finalizedAt: new Date(row.finalized_at) }
        : {}),
      ...(row.finalization_mode !== null
        ? { finalizationMode: row.finalization_mode }
        : {}),
      ...(row.trust_record_id !== null
        ? { trustRecordId: row.trust_record_id }
        : {}),
      ...(row.failure_reason !== null
        ? { failureReason: row.failure_reason }
        : {}),
      ...(row.resolution !== null ? { resolution: row.resolution } : {}),
      ...(row.resolution_note !== null
        ? { resolutionNote: row.resolution_note }
        : {}),
      ...(row.resolved_by !== null ? { resolvedBy: row.resolved_by } : {}),
      ...(row.resolved_at !== null
        ? { resolvedAt: new Date(row.resolved_at) }
        : {}),
    },
    ...(row.released_context_json !== null
      ? { releasedContext: row.released_context_json }
      : {}),
  };
}

const INSERT_SQL = `
  INSERT INTO execution_intents
    (intent_id, business_transaction_id, decision_id, authorization_id,
     policy_name, policy_version, policy_content_hash, signals_hash,
     business_transaction_hash, action, target, submitted_by,
     granted_capability, intent_hash, signature_json, created_at)
  VALUES
    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16)
`;

const SELECT_BY_TRANSACTION_ID_SQL = `
  SELECT * FROM execution_intents WHERE business_transaction_id = $1
`;

const MARK_RELEASED_SQL = `
  UPDATE execution_intents
     SET state = 'RELEASED',
         released_context_json = $2::jsonb,
         released_at = $3
   WHERE business_transaction_id = $1
     AND state = 'PREPARED'
`;

const MARK_FINALIZED_SQL = `
  UPDATE execution_intents
     SET state = 'FINALIZED',
         released_context_json = NULL,
         trust_record_id = $2,
         finalization_mode = $3,
         finalized_at = $4
   WHERE business_transaction_id = $1
     AND state <> 'FINALIZED'
`;

const MARK_ERRORED_SQL = `
  UPDATE execution_intents
     SET state = 'ERRORED',
         failure_reason = $2
   WHERE business_transaction_id = $1
     AND state = 'PREPARED'
`;

const MARK_RESOLVED_SQL = `
  UPDATE execution_intents
     SET state = 'RESOLVED',
         resolution = $2,
         resolution_note = $3,
         resolved_by = $4,
         resolved_at = $5
   WHERE business_transaction_id = $1
     AND state IN ('PREPARED', 'ERRORED')
`;

const LIST_UNFINALIZED_SQL = `
  SELECT * FROM execution_intents
   WHERE state NOT IN ('FINALIZED', 'RESOLVED')
   ORDER BY created_at ASC
   LIMIT $1
`;

interface ExecutionIntentRow {
  readonly intent_id: string;
  readonly business_transaction_id: string;
  readonly decision_id: string;
  readonly authorization_id: string;
  readonly policy_name: string;
  readonly policy_version: string;
  readonly policy_content_hash: string | null;
  readonly signals_hash: string | null;
  readonly business_transaction_hash: string;
  readonly action: string;
  readonly target: string;
  readonly submitted_by: string | null;
  readonly granted_capability: string | null;
  readonly intent_hash: string;
  readonly signature_json: ExecutionIntent["signature"];
  readonly created_at: string | Date;
  readonly state: ExecutionIntentState;
  readonly released_context_json: unknown | null;
  readonly released_at: string | Date | null;
  readonly finalized_at: string | Date | null;
  readonly finalization_mode: ExecutionIntentFinalizationMode | null;
  readonly trust_record_id: string | null;
  readonly failure_reason: string | null;
  readonly resolution: ExecutionIntentResolution | null;
  readonly resolution_note: string | null;
  readonly resolved_by: string | null;
  readonly resolved_at: string | Date | null;
}
