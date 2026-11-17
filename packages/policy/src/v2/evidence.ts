/**
 * Evidence and replay for policy version 2 (design 4.9).
 *
 * Each decision is recorded with what replay needs and nothing that depends on the
 * present: the policy by its hash, the request, the signed answers and approvals it
 * used, the keys and thresholds as they stood at the time, and the outcome. Records
 * are appended to a hash-chained log, so an edit to any record breaks the chain.
 * Replay re-runs the decision from the record alone, at the time it was made, and
 * reports any difference. Provenance is not stored: it is derived from the policy.
 *
 * Standalone. The runtime does not use it yet.
 */

import { createHash, createPublicKey, type KeyObject } from "node:crypto";

import { ApproverKeys, approvalChecker } from "./approvals.js";
import {
  decide,
  type Decision,
  type DecisionInputs,
  type DecisionRegister,
  type DecisionRequest,
} from "./decision.js";
import type { ValidationRegister } from "./validatePolicyV2.js";
import {
  canonicalize,
  MemoryNonceStore,
  type SignedAnswer,
} from "./sourceAnswer.js";

export class EvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceError";
  }
}

export function policyHash(policy: unknown): string {
  return createHash("sha256").update(canonicalize(policy)).digest("hex");
}

/** Policies by their hash. A policy cannot be stored under the wrong hash, and a read checks the hash. */
export class PolicyStore {
  private readonly policies = new Map<string, string>();

  put(policy: unknown): string {
    const hash = policyHash(policy);
    this.policies.set(hash, canonicalize(policy));
    return hash;
  }

  /** The policy with this hash, or undefined. Throws if the stored copy no longer matches its hash. */
  get(hash: string): unknown | undefined {
    const stored = this.policies.get(hash);
    if (stored === undefined) return undefined;
    if (policyHash(JSON.parse(stored)) !== hash)
      throw new EvidenceError(`The stored policy ${hash} has been altered.`);
    return JSON.parse(stored);
  }
}

export interface KeySnapshot {
  readonly source: string;
  readonly keyId: string;
  readonly publicKeyPem: string;
  readonly status: "trusted" | "untrusted" | "retired" | "pending";
}

export interface ApproverSnapshot {
  readonly approverId: string;
  readonly keyId: string;
  readonly publicKeyPem: string | null;
  readonly revoked: boolean;
}

export interface ThresholdSnapshot {
  readonly value: number;
  readonly unit: string;
  readonly status: string;
}

/** What replay needs, captured when the decision was made. */
export interface Snapshot {
  readonly sources: readonly KeySnapshot[];
  readonly approvers: readonly ApproverSnapshot[];
  readonly registerView: ValidationRegister;
  /** Keyed by "capability/threshold". */
  readonly thresholds: Readonly<Record<string, ThresholdSnapshot>>;
}

export interface EvidenceRecord {
  readonly recordId: string;
  readonly decidedAt: string;
  readonly request: DecisionRequest;
  readonly policyHash: string;
  readonly decision: Omit<Decision, "inputs">;
  readonly inputs: DecisionInputs;
  readonly snapshot: Snapshot;
  readonly prevHash: string;
  readonly hash: string;
}

type Unhashed = Omit<EvidenceRecord, "prevHash" | "hash">;

function hashRecord(record: object): string {
  return createHash("sha256").update(canonicalize(record)).digest("hex");
}

/** Append-only, hash-chained log of decisions. */
export class EvidenceLog {
  private readonly records: EvidenceRecord[] = [];

  append(unhashed: Unhashed): EvidenceRecord {
    const prevHash = this.records.at(-1)?.hash ?? "genesis";
    const withPrev = { ...unhashed, prevHash };
    const record: EvidenceRecord = {
      ...withPrev,
      hash: hashRecord({ ...withPrev, hash: "" }),
    };
    this.records.push(record);
    return record;
  }

  all(): readonly EvidenceRecord[] {
    return [...this.records];
  }

  /** True only if every record's hash and link are intact. */
  verifyChain(records: readonly EvidenceRecord[] = this.records): boolean {
    let prev = "genesis";
    for (const record of records) {
      if (record.prevHash !== prev) return false;
      if (hashRecord({ ...record, hash: "" }) !== record.hash) return false;
      prev = record.hash;
    }
    return true;
  }
}

/** Builds the snapshot for a decision from the live register and approver keys. */
export function snapshotFor(
  policy: { thresholds?: Record<string, unknown> } | undefined,
  capability: string,
  inputs: DecisionInputs,
  register: DecisionRegister & {
    getSource(
      name: string,
    ): { keyId: string; publicKeyPem: string; status: string } | undefined;
  },
  approvers: ApproverKeys,
): Snapshot {
  const sources: KeySnapshot[] = [];
  const seen = new Set<string>();
  for (const answer of Object.values(inputs.answers) as SignedAnswer[]) {
    const name = answer.payload.source;
    if (seen.has(name)) continue;
    seen.add(name);
    const record = register.getSource(name);
    if (record !== undefined) {
      sources.push({
        source: name,
        keyId: record.keyId,
        publicKeyPem: record.publicKeyPem,
        status: record.status as KeySnapshot["status"],
      });
    }
  }
  const approverList: ApproverSnapshot[] = [];
  for (const artifact of Object.values(inputs.approvals)) {
    if (typeof artifact !== "object" || artifact === null) continue;
    const payload = (
      artifact as { payload?: { approverId?: unknown; keyId?: unknown } }
    ).payload;
    if (
      typeof payload?.approverId !== "string" ||
      typeof payload.keyId !== "string"
    )
      continue;
    const key = approvers.keyFor(payload.approverId, payload.keyId);
    approverList.push({
      approverId: payload.approverId,
      keyId: payload.keyId,
      publicKeyPem:
        key === undefined || key === "revoked"
          ? null
          : (key as KeyObject)
              .export({ type: "spki", format: "pem" })
              .toString(),
      revoked: key === "revoked",
    });
  }
  const thresholds: Record<string, ThresholdSnapshot> = {};
  for (const name of Object.keys(policy?.thresholds ?? {})) {
    const t = register.getThreshold(capability, name);
    if (t !== undefined)
      thresholds[`${capability}/${name}`] = {
        value: t.value,
        unit: t.unit,
        status: t.status,
      };
  }
  return {
    sources,
    approvers: approverList,
    registerView: register.toValidationRegister(),
    thresholds,
  };
}

/** Records a decision with its snapshot, and returns the chained record. */
export function recordDecision(
  log: EvidenceLog,
  request: DecisionRequest,
  decision: Decision,
  snapshot: Snapshot,
  now: Date,
): EvidenceRecord {
  const { inputs, ...rest } = decision;
  return log.append({
    recordId: `ev-${log.all().length + 1}`,
    decidedAt: now.toISOString(),
    request,
    policyHash: decision.policy.hash,
    decision: rest,
    inputs,
    snapshot,
  });
}

/** Result of replaying a record. */
export interface ReplayResult {
  readonly reproduced: boolean;
  readonly differences: readonly string[];
  readonly replayed?: Decision;
}

/**
 * Re-runs a recorded decision from the record alone, at the time it was made. The
 * keys, approver states, thresholds and policy are the ones captured then, so a later
 * revocation does not change what replay concludes.
 */
export async function replay(
  record: EvidenceRecord,
  policies: PolicyStore,
): Promise<ReplayResult> {
  const differences: string[] = [];
  const policy =
    record.policyHash === "" ? undefined : policies.get(record.policyHash);
  if (record.policyHash !== "" && policy === undefined) {
    return {
      reproduced: false,
      differences: [`The policy ${record.policyHash} is not in the store.`],
    };
  }
  const decidedAt = new Date(record.decidedAt);

  const approvers = new ApproverKeys();
  for (const a of record.snapshot.approvers) {
    if (a.publicKeyPem !== null)
      approvers.register(a.approverId, a.keyId, a.publicKeyPem);
    if (a.revoked && a.publicKeyPem !== null)
      approvers.revoke(a.approverId, a.keyId);
  }
  const answers = Object.values(record.inputs.answers);
  const nonces = new MemoryNonceStore(() => decidedAt);

  const register: DecisionRegister = {
    keyFor(source, keyId) {
      const s = record.snapshot.sources.find((k) => k.source === source);
      if (s === undefined || s.keyId !== keyId) return undefined;
      if (s.status === "untrusted" || s.status === "retired") return "revoked";
      if (s.status === "pending") return undefined;
      return createPublicKey(s.publicKeyPem);
    },
    getThreshold(capability, name) {
      return record.snapshot.thresholds[`${capability}/${name}`];
    },
    toValidationRegister() {
      return record.snapshot.registerView;
    },
  };

  const replayed = await decide(record.request, {
    policies: (capability) =>
      capability === record.request.capability && policy !== undefined
        ? { policy }
        : undefined,
    register,
    sources: async (query) => {
      const found = answers.find(
        (a) =>
          a.payload.source === query.source &&
          a.payload.claim === query.claim &&
          a.payload.subject === query.subject,
      );
      if (found === undefined)
        throw new EvidenceError(
          `No recorded answer for ${query.source}/${query.claim}.`,
        );
      return found;
    },
    nonces,
    approvals: approvalChecker({ approvers, nonces }),
    now: () => decidedAt,
  });

  const original = record.decision;
  const compare = (label: string, a: unknown, b: unknown) => {
    if (canonicalize(a) !== canonicalize(b))
      differences.push(
        `${label}: recorded ${canonicalize(a)}, replayed ${canonicalize(b)}`,
      );
  };
  compare("outcome", original.outcome, replayed.outcome);
  compare("matchedRuleId", original.matchedRuleId, replayed.matchedRuleId);
  compare("tier", original.tier, replayed.tier);
  compare("refusal", original.refusal?.code, replayed.refusal?.code);
  compare("values", original.values, replayed.values);
  return { reproduced: differences.length === 0, differences, replayed };
}

/** Checks that each value's provenance is the one the policy declares. Provenance is derived, never stored. */
export function provenanceMatchesPolicy(
  record: EvidenceRecord,
  policy: unknown,
): boolean {
  const signals =
    (
      policy as
        { signals?: Record<string, { provenance?: string }> } | undefined
    )?.signals ?? {};
  return Object.entries(record.decision.values).every(
    ([name, v]) => signals[name]?.provenance === v.provenance,
  );
}
