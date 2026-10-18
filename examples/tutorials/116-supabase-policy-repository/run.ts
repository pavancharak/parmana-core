import { mkdtemp, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  FilePolicyRepository,
  SupabasePolicyRepository,
  PolicyNotFoundError,
  type Policy,
} from "@parmana/policy";

//
// docs/CLAIMS.md §2.26 "Legacy-policy backfill" (2026-09-16 update):
// PolicyChangeApprovalService.approve() writes the live policy.json
// via PolicyRepository.save() -- FilePolicyRepository writes to the
// local filesystem, which Vercel's serverless Functions serve as
// read-only. The very first real production approval attempt failed
// with EROFS. This tutorial reproduces both halves hermetically: the
// real failure mode (Scenario 1, a genuinely read-only directory --
// skipped automatically on platforms where chmod can't enforce this,
// e.g. Windows) and the real fix (Scenario 2, SupabasePolicyRepository
// against a minimal fake pg.Pool -- no network needed, same pattern
// Tutorial 115 already established for PostgresRateLimitStore).
//

console.log();
console.log("==================================================");
console.log("Tutorial 116 - SupabasePolicyRepository (the EROFS fix)");
console.log("==================================================");
console.log();

const TEST_POLICY: Policy = {
  policyId: "tutorial-116-policy",
  policyVersion: "1.0.0",
  schemaVersion: "1.0.0",
  description: "Minimal policy used to exercise save()/load()/listAll().",
  signalsSchema: { approved: "boolean" },
  unboundSignalReasons: {
    approved: "Independently attested; not derivable from the Intent.",
  },
  rules: [
    {
      id: "approve",
      condition: { fact: "approved", operator: "eq", value: true },
      outcome: { action: "approve", reason: "Approved signal was true." },
    },
    {
      id: "reject-default",
      condition: { always: true },
      outcome: { action: "reject", reason: "Default deny." },
    },
  ],
} as unknown as Policy;

console.log(
  "Scenario 1: FilePolicyRepository.save() against a read-only directory -- the real failure",
);
console.log("--------------------------------------------------");

const scratchDir = await mkdtemp(path.join(tmpdir(), "parmana-116-"));

let scenario1Reproduced = false;
let scenario1Skipped = false;

try {
  await chmod(scratchDir, 0o444); // read-only

  const fileRepo = new FilePolicyRepository(scratchDir);

  try {
    await fileRepo.save("tutorial-116-policy", "1.0.0", TEST_POLICY);
    // On platforms where chmod doesn't actually enforce read-only for
    // the owning process (notably Windows, and root on POSIX), the
    // write silently succeeds instead of throwing EROFS/EACCES --
    // reported here rather than treated as a tutorial failure, since
    // it reflects the OS's own permission model, not this codebase's.
    scenario1Skipped = true;
    console.log(
      "  (skipped: this OS did not enforce the read-only permission for the current user -- " +
        "the real EROFS only reproduces on Vercel's actual read-only filesystem, or as root-less " +
        "POSIX permissions)",
    );
  } catch (error) {
    scenario1Reproduced = true;
    console.log(
      `  ✓ save() failed as expected: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
} finally {
  await chmod(scratchDir, 0o755).catch(() => {});
  await rm(scratchDir, { recursive: true, force: true });
}

console.log();
console.log(
  "Scenario 2: SupabasePolicyRepository against a fake pg.Pool -- the real fix, hermetic",
);
console.log("--------------------------------------------------");

//
// A minimal fake standing in for `pg.Pool` -- just enough of
// `.query(sql, params)` to back an in-memory table, same "fake the
// one method actually called" discipline Tutorial 115 uses for
// PostgresRateLimitStore. No real network, no real database.
//
class FakePool {
  private rows = new Map<string, { content_json: Policy }>();

  async query(sql: string, params: readonly unknown[] = []) {
    if (sql.includes("SELECT content_json")) {
      const [name, version] = params as [string, string];
      const row = this.rows.get(`${name}@${version}`);
      return { rows: row ? [row] : [] };
    }

    if (sql.includes("INSERT INTO policies")) {
      const [name, version, contentJson] = params as [string, string, string];
      this.rows.set(`${name}@${version}`, {
        content_json: JSON.parse(contentJson),
      });
      return { rows: [] };
    }

    if (sql.includes("SELECT policy_name, policy_version")) {
      return {
        rows: [...this.rows.keys()].map((key) => {
          const [policy_name, policy_version] = key.split("@");
          return { policy_name, policy_version };
        }),
      };
    }

    throw new Error(`FakePool: unhandled query: ${sql}`);
  }
}

const dbRepo = new SupabasePolicyRepository(new FakePool() as never);

let notFoundBeforeSave = false;
try {
  await dbRepo.load("tutorial-116-policy", "1.0.0");
} catch (error) {
  notFoundBeforeSave = error instanceof PolicyNotFoundError;
}
console.log(
  `  load() before any save() throws PolicyNotFoundError : ${notFoundBeforeSave}`,
);

await dbRepo.save("tutorial-116-policy", "1.0.0", TEST_POLICY);
console.log("  save() succeeded -- no filesystem involved at all");

const loaded = await dbRepo.load("tutorial-116-policy", "1.0.0");
const roundTripsCorrectly =
  JSON.stringify(loaded) === JSON.stringify(TEST_POLICY);
console.log(
  `  load() after save() round-trips the exact same content : ${roundTripsCorrectly}`,
);

const listed = await dbRepo.listAll();
const listedCorrectly =
  listed.length === 1 &&
  listed[0].name === "tutorial-116-policy" &&
  listed[0].version === "1.0.0";
console.log(
  `  listAll() reports the saved (name, version) : ${listedCorrectly}`,
);

console.log();

const allPassed =
  (scenario1Reproduced || scenario1Skipped) &&
  notFoundBeforeSave &&
  roundTripsCorrectly &&
  listedCorrectly;

if (allPassed) {
  console.log(
    "✓ Same PolicyRepository interface, same PolicyChangeApprovalService.approve() call site -- " +
      "SupabasePolicyRepository just doesn't need a writable filesystem to satisfy it.",
  );
} else {
  console.log(
    "✗ Expected SupabasePolicyRepository to round-trip content with no filesystem access.",
  );
}

console.log();
console.log("Tutorial Complete");
console.log("End of the 2026-09-16 policy-governance-storage tutorial.");
