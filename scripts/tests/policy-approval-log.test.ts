import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { PolicyChangeCrypto } from "@parmana/crypto";
import type { PolicyChangeApprovalRecord } from "@parmana/shared";

import {
  appendFromDatabase,
  checkChain,
  checkPolicyCoverage,
  checkSignatures,
  isAppendOnly,
  parseLog,
  recordFromRow,
  serializeLog,
  sha256Hex,
  type LoggedApprovalRecord,
  type LogEntry,
} from "../policy-approval-log/policyApprovalLog.js";

/**
 * The public policy approval log must verify records signed by the
 * server's own PolicyChangeCrypto, read back the way Supabase returns
 * them, and must catch every change to the log: an edited, removed or
 * reordered entry, and a database record that changed after it was
 * logged.
 */

const crypto = new PolicyChangeCrypto();
let keys: Record<string, string[]>;

async function signedRow(
  index: number,
  overrides: Partial<PolicyChangeApprovalRecord> = {},
): Promise<Record<string, unknown>> {
  const draft = {
    policyChangeApprovalRecordId: `pcar-${index}`,
    pendingPolicyChangeId: `ppc-${index}`,
    policyName: "customer-refund",
    policyVersion: "1.2.0",
    proposedBy: "human-maker",
    approvedBy: "human-checker",
    proposedAt: new Date(Date.UTC(2026, 8, 1, 0, index)),
    approvedAt: new Date(Date.UTC(2026, 8, 1, 1, index)),
    contentHashAfter: `hash-${index}`,
    ...overrides,
  } as PolicyChangeApprovalRecord;
  const signature = await crypto.sign(draft);
  // As Supabase returns a row: snake_case, timestamps with an offset,
  // absent optional values as null, the signature as stored JSON.
  return {
    policy_change_approval_record_id: draft.policyChangeApprovalRecordId,
    pending_policy_change_id: draft.pendingPolicyChangeId,
    policy_name: draft.policyName,
    policy_version: draft.policyVersion,
    proposed_by: draft.proposedBy,
    approved_by: draft.approvedBy,
    proposed_at: draft.proposedAt.toISOString().replace("Z", "+00:00"),
    approved_at: draft.approvedAt.toISOString().replace("Z", "+00:00"),
    content_hash_before: draft.contentHashBefore ?? null,
    content_hash_after: draft.contentHashAfter,
    previous_record_hash: draft.previousRecordHash ?? null,
    signature_json: JSON.parse(JSON.stringify(signature)),
  };
}

let records: LoggedApprovalRecord[];
let log: LogEntry[];

beforeAll(async () => {
  const keyDir = process.env.PARMANA_KEY_DIR!;
  keys = {
    default: [readFileSync(path.join(keyDir, "default.public.pem"), "utf8")],
  };
  records = [
    recordFromRow(await signedRow(1)),
    recordFromRow(
      await signedRow(2, {
        contentHashBefore: "hash-1",
        previousRecordHash: "prev-1",
      }),
    ),
    recordFromRow(
      await signedRow(3, {
        policyName: "github-pr-approval",
        policyVersion: "1.1.0",
      }),
    ),
  ];
  log = appendFromDatabase([], records).entries;
});

const clone = (entries: readonly LogEntry[]) =>
  JSON.parse(JSON.stringify(entries)) as LogEntry[];

describe("the policy approval log", () => {
  it("builds a chain whose every record verifies with the server's key", () => {
    expect(log).toHaveLength(3);
    expect(log[0]!.prevEntryHash).toBeNull();
    expect(log[1]!.prevEntryHash).toBe(log[0]!.entryHash);
    expect(checkChain(log)).toEqual([]);
    expect(checkSignatures(log, keys)).toEqual([]);
  });

  it("round trips through the file format", () => {
    const parsed = parseLog(serializeLog(log));
    expect(parsed).toEqual(log);
    expect(checkChain(parsed)).toEqual([]);
    expect(checkSignatures(parsed, keys)).toEqual([]);
  });

  it("verifies the same records the server's own verify accepts", async () => {
    const row = await signedRow(9, { contentHashBefore: "x" });
    const original = {
      ...recordFromRow(row),
      proposedAt: new Date(String(row.proposed_at)),
      approvedAt: new Date(String(row.approved_at)),
    } as unknown as PolicyChangeApprovalRecord;
    expect(await crypto.verify(original)).toBe(true);
    expect(
      checkSignatures(
        appendFromDatabase([], [recordFromRow(row)]).entries,
        keys,
      ),
    ).toEqual([]);
  });

  it("rejects a record edited after signing, even with the chain rebuilt", () => {
    const edited = records.map((record, index) =>
      index === 1 ? { ...record, approvedBy: "human-maker" } : record,
    );
    const rebuilt = appendFromDatabase([], edited).entries;
    expect(checkChain(rebuilt)).toEqual([]);
    expect(checkSignatures(rebuilt, keys)).toHaveLength(1);
  });

  it("rejects a record signed by another key", () => {
    const otherKey = {
      default: [
        "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA8DDY1SMMZC/HT+ec/tMAdxofJVCNTj/FFOVgqQKsUdY=\n-----END PUBLIC KEY-----\n",
      ],
    };
    expect(checkSignatures(log, otherKey)).toHaveLength(3);
  });

  it("detects an entry edited, removed or reordered in the file", () => {
    const edited = clone(log);
    (edited[0]!.record as { contentHashAfter: string }).contentHashAfter =
      "other";
    expect(checkChain(edited).length).toBeGreaterThan(0);

    const removed = clone(log).filter((_, index) => index !== 1);
    expect(checkChain(removed).length).toBeGreaterThan(0);

    const reordered = clone(log);
    [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
    expect(checkChain(reordered).length).toBeGreaterThan(0);
  });

  it("allows growth only: earlier entries may not change", () => {
    const first = appendFromDatabase([], records.slice(0, 2)).entries;
    expect(isAppendOnly(first, log)).toBe(true);
    expect(isAppendOnly(log, first)).toBe(false);
    const rewritten = appendFromDatabase(
      [],
      [
        records[0]!,
        { ...records[1]!, approvedBy: "someone-else" },
        records[2]!,
      ],
    ).entries;
    expect(isAppendOnly(first, rewritten)).toBe(false);
  });

  it("appends only new database records, in approval order", async () => {
    const extra = recordFromRow(await signedRow(4, { policyVersion: "1.3.0" }));
    const { entries, added, problems } = appendFromDatabase(log, [
      extra,
      ...records,
    ]);
    expect(problems).toEqual([]);
    expect(added).toBe(1);
    expect(entries.slice(0, 3)).toEqual(log);
    expect(entries[3]!.record).toEqual(extra);
    expect(checkChain(entries)).toEqual([]);
  });

  it("refuses when a logged record changed or disappeared in the database", () => {
    const changed = appendFromDatabase(log, [
      records[0]!,
      { ...records[1]!, contentHashAfter: "swapped" },
      records[2]!,
    ]);
    expect(changed.problems).toEqual([
      "record pcar-2 in the database differs from the logged copy.",
    ]);
    const deleted = appendFromDatabase(log, [records[0]!, records[2]!]);
    expect(deleted.problems).toEqual([
      "record pcar-2 is in the log but no longer in the database.",
    ]);
  });

  it("hashes policy content the way the server does", async () => {
    const content = {
      name: "customer-refund",
      version: "1.2.0",
      rules: [{ id: "a" }],
    };
    expect(sha256Hex(content)).toBe(await crypto.hashPolicyContent(content));
  });

  it("reports policy files with no approval or a different approved content", async () => {
    const content = { name: "customer-refund", rules: [] };
    const hash = await crypto.hashPolicyContent(content);
    const approved = appendFromDatabase(
      [],
      [{ ...records[0]!, contentHashAfter: hash }],
    ).entries;
    expect(
      checkPolicyCoverage(
        approved,
        new Map([["customer-refund/1.2.0", content]]),
      ),
    ).toEqual([]);
    expect(
      checkPolicyCoverage(
        approved,
        new Map<string, unknown>([
          ["customer-refund/1.2.0", { ...content, rules: [{ id: "new" }] }],
          ["slack-post-message/1.1.0", {}],
        ]),
      ),
    ).toEqual([
      "policies/customer-refund/1.2.0/policy.json does not match its latest logged approval.",
      "policies/slack-post-message/1.1.0/policy.json has no approval in the log.",
    ]);
  });
});
