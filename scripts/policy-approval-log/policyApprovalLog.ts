import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

import {
  CanonicalSerializer,
  commitmentMessage,
  requiresCommitment,
} from "@parmana/crypto";

/**
 * The public, append only log of policy change approvals
 * (governance/policy-approvals.jsonl).
 *
 * Each line is one signed PolicyChangeApprovalRecord, exactly as the
 * server stored and signed it, wrapped in a hash chain:
 *
 *   { seq, prevEntryHash, record, entryHash }
 *
 * entryHash is the SHA-256 of the canonical JSON of
 * { seq, prevEntryHash, record }, and prevEntryHash is the previous
 * line's entryHash (null on the first line). Changing, removing or
 * reordering any line breaks the chain from that line on. Each record
 * also carries the server's own Ed25519 signature, so a record cannot be
 * invented without the signing key.
 *
 * Nothing here needs a database or the server: only the log, the public
 * keys and the policy files in the repository.
 */

export interface LoggedSignature {
  readonly algorithm: string;
  readonly keyId: string;
  readonly value: string;
  readonly signedAt?: string;
}

/** A PolicyChangeApprovalRecord with its dates as ISO strings. */
export interface LoggedApprovalRecord {
  readonly policyChangeApprovalRecordId: string;
  readonly pendingPolicyChangeId: string;
  readonly policyName: string;
  readonly policyVersion: string;
  readonly proposedBy: string;
  readonly approvedBy: string;
  readonly proposedAt: string;
  readonly approvedAt: string;
  readonly contentHashBefore?: string;
  readonly contentHashAfter: string;
  readonly previousRecordHash?: string;
  readonly signature: LoggedSignature;
}

export interface LogEntry {
  readonly seq: number;
  readonly prevEntryHash: string | null;
  readonly record: LoggedApprovalRecord;
  readonly entryHash: string;
}

/** Public keys by keyId; a keyId may list more than one PEM. */
export type PublicKeys = Readonly<Record<string, readonly string[]>>;

const serializer = new CanonicalSerializer();

export function sha256Hex(value: unknown): string {
  return createHash("sha256").update(serializer.serialize(value)).digest("hex");
}

export function entryHashOf(
  seq: number,
  prevEntryHash: string | null,
  record: LoggedApprovalRecord,
): string {
  return sha256Hex({ seq, prevEntryHash, record });
}

/** A database row (as returned by Supabase) to a logged record. */
export function recordFromRow(
  row: Record<string, unknown>,
): LoggedApprovalRecord {
  const iso = (value: unknown) => new Date(String(value)).toISOString();
  const signature = row.signature_json as LoggedSignature;
  return {
    policyChangeApprovalRecordId: String(row.policy_change_approval_record_id),
    pendingPolicyChangeId: String(row.pending_policy_change_id),
    policyName: String(row.policy_name),
    policyVersion: String(row.policy_version),
    proposedBy: String(row.proposed_by),
    approvedBy: String(row.approved_by),
    proposedAt: iso(row.proposed_at),
    approvedAt: iso(row.approved_at),
    ...(row.content_hash_before != null
      ? { contentHashBefore: String(row.content_hash_before) }
      : {}),
    contentHashAfter: String(row.content_hash_after),
    ...(row.previous_record_hash != null
      ? { previousRecordHash: String(row.previous_record_hash) }
      : {}),
    signature: {
      algorithm: signature.algorithm,
      keyId: signature.keyId,
      value: signature.value,
      ...(signature.signedAt !== undefined
        ? { signedAt: new Date(signature.signedAt).toISOString() }
        : {}),
    },
  };
}

/**
 * The fields the server signs (PolicyChangeCrypto.canonicalRecord).
 * Must match it exactly, or no genuine record verifies.
 */
export function signedView(record: LoggedApprovalRecord) {
  return {
    policyChangeApprovalRecordId: record.policyChangeApprovalRecordId,
    pendingPolicyChangeId: record.pendingPolicyChangeId,
    policyName: record.policyName,
    policyVersion: record.policyVersion,
    proposedBy: record.proposedBy,
    approvedBy: record.approvedBy,
    proposedAt: record.proposedAt,
    approvedAt: record.approvedAt,
    contentHashBefore: record.contentHashBefore,
    contentHashAfter: record.contentHashAfter,
    previousRecordHash: record.previousRecordHash,
  };
}

export function verifyRecordSignature(
  record: LoggedApprovalRecord,
  keys: PublicKeys,
): boolean {
  if (record.signature.algorithm !== "ed25519") return false;
  const pems = Object.hasOwn(keys, record.signature.keyId)
    ? keys[record.signature.keyId]!
    : [];
  const bytes = serializer.serialize(signedView(record));
  const signature = Buffer.from(record.signature.value, "base64");
  return pems.some((pem) => {
    const key = createPublicKey(pem);
    return (
      verifySignature(null, bytes, key, signature) ||
      (requiresCommitment(bytes) &&
        verifySignature(null, commitmentMessage(bytes), key, signature))
    );
  });
}

export function parseLog(text: string): LogEntry[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      try {
        return JSON.parse(line) as LogEntry;
      } catch {
        throw new Error(`Line ${index + 1} is not valid JSON.`);
      }
    });
}

export function serializeLog(entries: readonly LogEntry[]): string {
  return entries.map((entry) => `${JSON.stringify(entry)}\n`).join("");
}

/** Problems with the chain itself: sequence, links and entry hashes. */
export function checkChain(entries: readonly LogEntry[]): string[] {
  const problems: string[] = [];
  let previous: string | null = null;
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    const where = `entry ${index + 1}`;
    if (entry.seq !== index + 1) {
      problems.push(`${where}: seq is ${entry.seq}, expected ${index + 1}.`);
    }
    if (entry.prevEntryHash !== previous) {
      problems.push(
        `${where}: prevEntryHash does not match the entry before it.`,
      );
    }
    if (
      entry.entryHash !==
      entryHashOf(entry.seq, entry.prevEntryHash, entry.record)
    ) {
      problems.push(`${where}: entryHash does not match its content.`);
    }
    const id = entry.record.policyChangeApprovalRecordId;
    if (seen.has(id)) problems.push(`${where}: record ${id} appears twice.`);
    seen.add(id);
    previous = entry.entryHash;
  });
  return problems;
}

/** Records whose signature does not verify with the published keys. */
export function checkSignatures(
  entries: readonly LogEntry[],
  keys: PublicKeys,
): string[] {
  return entries
    .filter((entry) => !verifyRecordSignature(entry.record, keys))
    .map(
      (entry) =>
        `entry ${entry.seq}: the signature of ${entry.record.policyName} ${entry.record.policyVersion} (record ${entry.record.policyChangeApprovalRecordId}, key "${entry.record.signature.keyId}") does not verify.`,
    );
}

/**
 * For each (policy, version), the content hash of its latest logged
 * approval, by approval time.
 */
export function latestApprovedHashes(
  entries: readonly LogEntry[],
): Map<string, string> {
  const latest = new Map<string, LoggedApprovalRecord>();
  for (const { record } of entries) {
    const key = `${record.policyName}/${record.policyVersion}`;
    const current = latest.get(key);
    if (!current || record.approvedAt >= current.approvedAt)
      latest.set(key, record);
  }
  return new Map(
    [...latest].map(([key, record]) => [key, record.contentHashAfter]),
  );
}

/**
 * Policy files whose content is not the latest logged approval for that
 * policy and version. `policies` maps "name/version" to parsed content.
 */
export function checkPolicyCoverage(
  entries: readonly LogEntry[],
  policies: ReadonlyMap<string, unknown>,
): string[] {
  const approved = latestApprovedHashes(entries);
  const problems: string[] = [];
  for (const [key, content] of [...policies].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const hash = approved.get(key);
    if (hash === undefined) {
      problems.push(`policies/${key}/policy.json has no approval in the log.`);
    } else if (hash !== sha256Hex(content)) {
      problems.push(
        `policies/${key}/policy.json does not match its latest logged approval.`,
      );
    }
  }
  return problems;
}

/**
 * The log extended with the database's records it does not yet hold,
 * in approval order. Fails if a record already in the log is missing
 * from the database or differs from it: the log is the earlier copy, so
 * that means the database changed.
 */
export function appendFromDatabase(
  entries: readonly LogEntry[],
  databaseRecords: readonly LoggedApprovalRecord[],
): { entries: LogEntry[]; added: number; problems: string[] } {
  const byId = new Map(
    databaseRecords.map((record) => [
      record.policyChangeApprovalRecordId,
      record,
    ]),
  );
  const problems: string[] = [];
  for (const entry of entries) {
    const id = entry.record.policyChangeApprovalRecordId;
    const stored = byId.get(id);
    if (!stored) {
      problems.push(
        `record ${id} is in the log but no longer in the database.`,
      );
    } else if (sha256Hex(stored) !== sha256Hex(entry.record)) {
      problems.push(
        `record ${id} in the database differs from the logged copy.`,
      );
    }
  }
  const logged = new Set(
    entries.map((entry) => entry.record.policyChangeApprovalRecordId),
  );
  const fresh = databaseRecords
    .filter((record) => !logged.has(record.policyChangeApprovalRecordId))
    .sort(
      (a, b) =>
        a.approvedAt.localeCompare(b.approvedAt) ||
        a.policyChangeApprovalRecordId.localeCompare(
          b.policyChangeApprovalRecordId,
        ),
    );
  const result = [...entries];
  for (const record of fresh) {
    const seq = result.length + 1;
    const prevEntryHash =
      result.length > 0 ? result[result.length - 1]!.entryHash : null;
    result.push({
      seq,
      prevEntryHash,
      record,
      entryHash: entryHashOf(seq, prevEntryHash, record),
    });
  }
  return { entries: result, added: fresh.length, problems };
}

/** True when `before` is an unchanged prefix of `after` (append only). */
export function isAppendOnly(
  before: readonly LogEntry[],
  after: readonly LogEntry[],
): boolean {
  return (
    before.length <= after.length &&
    before.every(
      (entry, index) =>
        entry.entryHash === after[index]!.entryHash &&
        entryHashOf(entry.seq, entry.prevEntryHash, entry.record) ===
          entry.entryHash,
    )
  );
}
