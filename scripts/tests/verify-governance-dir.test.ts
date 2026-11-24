import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

/**
 * The verify script reads the signed log from PARMANA_GOVERNANCE_DIR, so an
 * organization can keep its own log in its own repository. These tests copy the
 * committed governance files into a folder of their own and run the script there.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = path.join(repoRoot, "scripts", "verify-policy-changes-approved.ts");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function copyGovernance(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "parmana-governance-"));
  dirs.push(dir);
  for (const file of ["policy-approvals.jsonl", "policy-approval-keys.json"]) {
    cpSync(path.join(repoRoot, "governance", file), path.join(dir, file));
  }
  return dir;
}

function verify(governanceDir: string): { code: number; output: string } {
  // The verifier does not run its checks when VITEST is set, because it is also imported by
  // tests. The child process must start without any Vitest variable, so it runs as a command.
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("VITEST")) env[key] = value;
  }
  const run = spawnSync(process.execPath, ["--import", "tsx", script, "--full-scan"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...env,
      PARMANA_GOVERNANCE_DIR: governanceDir,
      PARMANA_POLICY_DIR: path.join(repoRoot, "policies"),
    },
  });
  if (run.error) throw run.error;
  return { code: run.status ?? 1, output: `${run.stdout ?? ""}${run.stderr ?? ""}` };
}

describe("verify script with PARMANA_GOVERNANCE_DIR", () => {
  it("passes on an untouched copy of the governance files", () => {
    const result = verify(copyGovernance());
    expect(result.code).toBe(0);
    expect(result.output).toContain("have a matching approval record");
  }, 120_000);

  it("fails when a record in the copied log is changed", () => {
    const dir = copyGovernance();
    const file = path.join(dir, "policy-approvals.jsonl");
    writeFileSync(file, readFileSync(file, "utf8").replace(/"approvedBy":"[^"]*"/, '"approvedBy":"tampered"'));
    const result = verify(dir);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("does not verify");
  }, 120_000);
});
