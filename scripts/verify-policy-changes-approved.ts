import "dotenv/config";

import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PolicyChangeCrypto } from "@parmana/crypto";

import {
  checkChain,
  checkSignatures,
  latestApprovedHashes,
  parseLog,
  type LogEntry,
  type PublicKeys,
} from "./policy-approval-log/policyApprovalLog.js";

/**
 * Preventive deploy-time gate (Policy Governance, maker-checker). It holds
 * no database or API credential: it reads the signed approval log in
 * governance/policy-approvals.jsonl, which is committed to the repository.
 * The log must verify first (hash chain and every signature against the
 * committed public keys). Then each policy file must match its latest
 * logged approval.
 *
 * confirms every policies/{name}/{version}/policy.json this run is
 * asked to check has a real, matching PolicyChangeApprovalRecord --
 * closing the gap the independent audit found, that a direct file
 * edit to policies/*.json bypasses the maker-checker API entirely.
 * Unlike verifyPolicyGovernanceIntegrityAtStartup.ts (fail-open, a
 * detection-after-the-fact log that must never block the running
 * server), this is fail-CLOSED by design: it is meant to block a PR
 * merge or a deploy, and any failure to complete the check --
 * the log unreadable or unverifiable, a malformed file, anything -- is treated
 * exactly the same as finding a real unapproved file. There is no
 * "couldn't check, let it through" path here.
 *
 * The log is written by policy-log:export, from the database's approval
 * records, and the drift check (policy-log-drift.yml) reconciles the two.
 *
 * Invoked with a list of changed files, or with --full-scan to check
 * every policy file in the tree. CI's verify-policy-approvals job runs
 * --full-scan on every push and pull request (G-79): every policy
 * version in the tree has been approved through the API since the
 * 2026-09-16 backfill, so any file reported here is a real finding.
 */

const VALID_NAME_OR_VERSION = /^[A-Za-z0-9._-]+$/;

export interface UnapprovedFile {
  readonly filePath: string;
  readonly policyName: string;
  readonly policyVersion: string;
  readonly reason: "no-approval-record" | "content-hash-mismatch";
}

export interface VerificationSuccess {
  readonly ok: true;
  readonly checked: number;
}

export interface VerificationFailure {
  readonly ok: false;
  readonly reason: "unapproved-files" | "verification-unavailable";
  readonly message: string;
  readonly unapprovedFiles?: readonly UnapprovedFile[];
}

export type VerificationResult = VerificationSuccess | VerificationFailure;

export interface MostRecentApproval {
  readonly contentHashAfter: string;
}

/**
 * Looks up the most recent PolicyChangeApprovalRecord for a
 * (policyName, policyVersion) pair -- the same "most recent wins"
 * semantics PolicyChangeApprovalRecordRepository.findMostRecentFor
 * and verifyPolicyGovernanceIntegrityAtStartup.ts already use, so a
 * re-approved (in-place-patched) version is judged consistently
 * everywhere in this codebase, not by a second, independently
 * invented definition of "approved" here.
 */
export interface ApprovalLookup {
  findMostRecentApproval(
    policyName: string,
    policyVersion: string,
  ): Promise<MostRecentApproval | null>;
}

/**
 * Looks approvals up in the signed log that has already been verified. It needs
 * no database or REST credential.
 */
export function createLogApprovalLookup(
  entries: readonly LogEntry[],
): ApprovalLookup {
  // latestApprovedHashes keeps the last logged approval for each name/version,
  // which is the same "most recent wins" rule the rest of the codebase uses.
  const latest = latestApprovedHashes(entries);

  return {
    async findMostRecentApproval(policyName, policyVersion) {
      const contentHashAfter = latest.get(`${policyName}/${policyVersion}`);

      return contentHashAfter === undefined ? null : { contentHashAfter };
    },
  };
}

/**
 * Derives (policyName, policyVersion) from a
 * policies/{name}/{version}/policy.json path -- same shape
 * FilePolicyRepository uses, same VALID_NAME_OR_VERSION allowlist
 * every other path-from-untrusted-input site in this codebase
 * applies, so a malformed or unexpected path fails loudly here rather
 * than silently passing through to a query that can never match.
 */
function parsePolicyFilePath(
  filePath: string,
  policiesDir: string,
): { readonly policyName: string; readonly policyVersion: string } {
  const relative = path.relative(policiesDir, filePath).split(path.sep);

  if (
    relative.length !== 3 ||
    relative[2] !== "policy.json" ||
    !VALID_NAME_OR_VERSION.test(relative[0]) ||
    !VALID_NAME_OR_VERSION.test(relative[1])
  ) {
    throw new Error(
      `'${filePath}' does not look like a policies/{name}/{version}/policy.json path.`,
    );
  }

  return { policyName: relative[0], policyVersion: relative[1] };
}

/**
 * Walks policiesDir for every policy.json path -- --full-scan mode.
 */
export async function findAllPolicyFiles(
  policiesDir: string,
): Promise<readonly string[]> {
  const files: string[] = [];

  // A read failure must surface as an error. Treating it as an empty
  // directory would let a full scan report success having checked nothing.
  const names = await readdir(policiesDir, { withFileTypes: true });

  for (const nameEntry of names) {
    // Symlinks are walked too: the runtime follows them, so the gate must.
    if (!nameEntry.isDirectory() && !nameEntry.isSymbolicLink()) continue;

    const versionDir = path.join(policiesDir, nameEntry.name);
    const versions = await readdir(versionDir, { withFileTypes: true });

    for (const versionEntry of versions) {
      if (!versionEntry.isDirectory() && !versionEntry.isSymbolicLink()) {
        continue;
      }

      const candidate = path.join(versionDir, versionEntry.name, "policy.json");

      files.push(candidate);
    }
  }

  return files;
}

/**
 * Core check, fail-closed throughout: a single lookup failure (network,
 * auth, malformed response) immediately stops the whole run as
 * "verification-unavailable", distinct from "unapproved-files" --
 * never a partial pass, never "these N are fine, couldn't check the
 * rest." A caller that can't distinguish "verified clean" from
 * "didn't fully check" has no business treating either as a pass.
 */
export async function verifyPolicyChangesApproved(
  filePaths: readonly string[],
  options: {
    readonly policiesDir: string;
    readonly approvalLookup: ApprovalLookup;
    readonly readPolicyFile?: (filePath: string) => Promise<string>;
  },
): Promise<VerificationResult> {
  const policyChangeCrypto = new PolicyChangeCrypto();
  const readPolicyFile =
    options.readPolicyFile ??
    ((filePath: string) => readFile(filePath, "utf8"));

  const unapprovedFiles: UnapprovedFile[] = [];

  for (const filePath of filePaths) {
    const { policyName, policyVersion } = parsePolicyFilePath(
      filePath,
      options.policiesDir,
    );

    let raw: string;

    try {
      raw = await readPolicyFile(filePath);
    } catch (error) {
      return {
        ok: false,
        reason: "verification-unavailable",
        message: `Could not read '${filePath}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    const content = JSON.parse(raw) as unknown;
    const contentHash = await policyChangeCrypto.hashPolicyContent(content);

    let mostRecent: MostRecentApproval | null;

    try {
      mostRecent = await options.approvalLookup.findMostRecentApproval(
        policyName,
        policyVersion,
      );
    } catch (error) {
      return {
        ok: false,
        reason: "verification-unavailable",
        message: `Could not verify approval for '${filePath}' (${policyName}@${policyVersion}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    if (mostRecent === null) {
      unapprovedFiles.push({
        filePath,
        policyName,
        policyVersion,
        reason: "no-approval-record",
      });
      continue;
    }

    if (mostRecent.contentHashAfter !== contentHash) {
      unapprovedFiles.push({
        filePath,
        policyName,
        policyVersion,
        reason: "content-hash-mismatch",
      });
    }
  }

  if (unapprovedFiles.length > 0) {
    return {
      ok: false,
      reason: "unapproved-files",
      message: `${unapprovedFiles.length} changed policy file(s) have no matching approved content.`,
      unapprovedFiles,
    };
  }

  return { ok: true, checked: filePaths.length };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_PATH = path.join(root, "governance", "policy-approvals.jsonl");
const KEYS_PATH = path.join(root, "governance", "policy-approval-keys.json");

/**
 * Reads the committed approval log and checks it offline: the hash chain, and
 * every record's signature against the committed public keys. Returns the
 * entries, or the problems that stop them from being trusted.
 */
function loadApprovalLog(): { entries: LogEntry[]; problems: string[] } {
  if (!existsSync(LOG_PATH) || !existsSync(KEYS_PATH)) {
    return {
      entries: [],
      problems: [
        "The signed approval log or its public keys are missing from the repository.",
      ],
    };
  }

  const entries = parseLog(readFileSync(LOG_PATH, "utf8"));
  const keys = JSON.parse(readFileSync(KEYS_PATH, "utf8")) as PublicKeys;

  return {
    entries,
    problems: [...checkChain(entries), ...checkSignatures(entries, keys)],
  };
}

function parseArgs(args: string[]): {
  readonly fullScan: boolean;
  readonly policiesDir: string;
  readonly changedFiles: readonly string[];
} {
  const policiesDirIndex = args.indexOf("--policies-dir");
  const policiesDir =
    policiesDirIndex !== -1 && policiesDirIndex + 1 < args.length
      ? args[policiesDirIndex + 1]
      : process.env.PARMANA_POLICY_DIR !== undefined
        ? path.resolve(process.cwd(), process.env.PARMANA_POLICY_DIR)
        : path.resolve(process.cwd(), "policies");

  const fullScan = args.includes("--full-scan");

  const changedFiles = args.filter(
    (arg, index) =>
      !arg.startsWith("--") && args[index - 1] !== "--policies-dir",
  );

  return { fullScan, policiesDir, changedFiles };
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const { fullScan, policiesDir, changedFiles } = parseArgs(argv);

  if (!fullScan && changedFiles.length === 0) {
    console.log("No changed policy files to verify.");
    return;
  }

  const { entries, problems } = loadApprovalLog();

  if (problems.length > 0) {
    console.error(
      "::error::The signed approval log does not verify. Nothing is trusted until it does:",
    );
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }

  const filePaths = fullScan
    ? await findAllPolicyFiles(policiesDir)
    : changedFiles.map((file) => path.resolve(process.cwd(), file));

  if (fullScan && filePaths.length === 0) {
    console.error(
      `::error::No policy files found under ${policiesDir}. A full scan that ` +
        "checks nothing is treated as a failure, not a pass.",
    );
    process.exitCode = 1;
    return;
  }

  const result = await verifyPolicyChangesApproved(filePaths, {
    policiesDir,
    approvalLookup: createLogApprovalLookup(entries),
  });

  if (result.ok) {
    console.log(
      `All ${result.checked} checked policy file(s) have a matching approval record.`,
    );
    return;
  }

  if (result.reason === "verification-unavailable") {
    console.error(
      `::error::Policy approval verification could not run: ${result.message} ` +
        "This is a fail-CLOSED check -- treated as a failure, not skipped.",
    );
    process.exitCode = 1;
    return;
  }

  console.error(`::error::${result.message}`);

  for (const unapproved of result.unapprovedFiles ?? []) {
    const reasonText =
      unapproved.reason === "no-approval-record"
        ? "no PolicyChangeApprovalRecord exists for this (name, version) at all"
        : "the live content does not match the most recent approval's contentHashAfter";

    console.error(
      `  - ${unapproved.filePath} (${unapproved.policyName}@${unapproved.policyVersion}): ${reasonText}`,
    );
  }

  console.error(
    "Every policy change must go through POST /policies/:name/:version/pending-changes " +
      "and be approved via the maker-checker flow before merging. See scripts/sign-policy-change-step-up.ts.",
  );

  process.exitCode = 1;
}

if (process.env.VITEST === undefined) {
  main().catch((error: unknown) => {
    console.error(
      `::error::${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}

export { main };
