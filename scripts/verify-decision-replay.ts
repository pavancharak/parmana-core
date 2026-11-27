import { readFileSync } from "node:fs";

import { FilePolicyRepository } from "@parmana/policy";
import { replayStoredDecision } from "@parmana/runtime";
import type { Decision } from "@parmana/shared";

/**
 * Re-runs one stored decision against its named evaluation method (R3). Offline: it reads the
 * decision JSON and a policy directory laid out as <name>/<version>/policy.json. No database.
 *
 * Usage:
 *   npx tsx scripts/verify-decision-replay.ts <decision.json> <policy-directory>
 *
 * Exit codes:
 *   0  reproduced
 *   1  differs (the recorded verdict is not what the named method produces), or unverifiable
 *   2  usage or input error
 *
 * "unverifiable" is not a pass. It is reported with its reason, and exits 1.
 */

const [decisionPath, policyDirectory] = process.argv.slice(2);

if (!decisionPath || !policyDirectory) {
  console.error(
    "Usage: verify-decision-replay.ts <decision.json> <policy-directory>",
  );
  process.exit(2);
}

const decision = JSON.parse(readFileSync(decisionPath, "utf8")) as Decision;

const policy = await new FilePolicyRepository(policyDirectory).load(
  decision.policy.name,
  decision.policy.version,
);

const result = await replayStoredDecision(decision, policy);

console.log(
  JSON.stringify({ decisionId: decision.decisionId, ...result }, null, 2),
);

process.exit(result.status === "reproduced" ? 0 : 1);
