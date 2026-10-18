/**
 * `npm run evaluate:agentrust-refund`: runs the AgenTrust refund evaluation
 * (packages/api/tests/integration/agentrust-refund-evaluation.integration.test.ts),
 * adds the commit and the Node.js version to its report, writes it to
 * evaluations/agentrust-refund/report.json, writes the full signed records,
 * the signed approval and both public keys to
 * evaluations/agentrust-refund/fixtures/ and prints one line per case.
 * Exits 1 if the test fails. See docs/evaluation/agentrust-refund/README.md.
 */

import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = path.join(
  root,
  "evaluations",
  "agentrust-refund",
  "report.json",
);
const test =
  "packages/api/tests/integration/agentrust-refund-evaluation.integration.test.ts";

// Checked before the run, so the report written by the run does not count.
const commit = execSync("git rev-parse HEAD", { cwd: root }).toString().trim();
const dirty =
  execSync("git status --porcelain", { cwd: root }).toString().trim() !== "";

const run = spawnSync("npx", ["vitest", "run", test], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    AGENTRUST_REPORT: report,
    AGENTRUST_FIXTURES: path.join(
      root,
      "evaluations",
      "agentrust-refund",
      "fixtures",
    ),
  },
});

if (run.status !== 0) {
  console.error("The evaluation test failed; no report was written.");
  process.exit(1);
}

const data = JSON.parse(readFileSync(report, "utf8")) as {
  cases: {
    case: string;
    httpStatus: number;
    decision: string;
    connectorInvocations: number;
    connectorResult: string;
  }[];
};

writeFileSync(
  report,
  JSON.stringify(
    {
      commit,
      workingTreeClean: !dirty,
      node: process.version,
      ranAt: new Date().toISOString(),
      ...data,
    },
    null,
    2,
  ) + "\n",
);

console.log(
  "\nCase            HTTP  Decision  Connector calls  Connector result",
);
for (const c of data.cases) {
  console.log(
    `${c.case.padEnd(16)}${String(c.httpStatus).padEnd(6)}${c.decision.padEnd(10)}${String(c.connectorInvocations).padEnd(17)}${c.connectorResult}`,
  );
}
console.log(
  `\nReport: ${path.relative(root, report)} (commit ${commit.slice(0, 8)}${dirty ? ", uncommitted changes" : ""})`,
);
