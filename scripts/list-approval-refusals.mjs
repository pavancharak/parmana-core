// Read-only: looks up Refusal Records and sorts them into retry-after-approval
// and final refusals. It never calls any POST route and never resubmits.
//
// Usage:
//   PARMANA_API_KEY=... node list-approval-refusals.mjs ids.txt [--rule reject-manager-approval-required] [--out report.json]
//   ids.txt: one businessTransactionId per line (or a JSON array of strings).
// Env: PARMANA_BASE_URL (default http://localhost:3000).

import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const inputPath = args.find((a) => !a.startsWith("--") && !isValue(a));
if (!inputPath) {
  console.error(
    "usage: node list-approval-refusals.mjs <ids file> [--rule <ruleId>]... [--approval-signal <name>] [--out <file>]",
  );
  process.exit(2);
}
const approvalRules = [];
let outPath;
let approvalSignal = "managerApproved";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--rule") approvalRules.push(args[++i]);
  if (args[i] === "--out") outPath = args[++i];
  if (args[i] === "--approval-signal") approvalSignal = args[++i];
}
if (approvalRules.length === 0)
  approvalRules.push("reject-manager-approval-required");

function isValue(a) {
  const i = args.indexOf(a);
  return (
    i > 0 && ["--rule", "--out", "--approval-signal"].includes(args[i - 1])
  );
}

/**
 * The start-here guide's test for "a person's signed approval is needed":
 * the refusal came from an approval rule, the approval signal was not true,
 * and every other boolean signal was true. Anything else is not sorted as an
 * approval case, so it goes to manual review.
 */
function classify(decision) {
  if (!approvalRules.includes(decision.matchedRuleId)) return "final_refusal";
  const signals = decision.signals ?? {};
  if (signals[approvalSignal] === true) return "manual_review";
  for (const [name, value] of Object.entries(signals)) {
    if (name === approvalSignal) continue;
    if (typeof value === "boolean" && value !== true) return "manual_review";
  }
  return "retry_after_approval";
}

const base = (process.env.PARMANA_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const key = process.env.PARMANA_API_KEY;
if (!key) {
  console.error("PARMANA_API_KEY is not set");
  process.exit(2);
}

const raw = readFileSync(inputPath, "utf8").trim();
const ids = raw.startsWith("[")
  ? JSON.parse(raw)
  : raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

const rows = [];
for (const id of ids) {
  const row = { businessTransactionId: id };
  try {
    const res = await fetch(`${base}/refusal/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      redirect: "error",
    });
    if (res.status === 404) {
      row.category = "not_found";
    } else if (res.status !== 200) {
      row.category = "lookup_failed";
      row.httpStatus = res.status;
    } else {
      const rec = await res.json();
      const d = rec.decision ?? {};
      row.policy = d.policy
        ? `${d.policy.name}@${d.policy.version}`
        : undefined;
      row.matchedRuleId = d.matchedRuleId;
      row.reason = d.reason;
      row.refusalRecordId = rec.refusalRecordId;
      row.createdAt = rec.createdAt;
      row.category = classify(d);
    }
  } catch (err) {
    row.category = "lookup_failed";
    row.error = String(err.message ?? err);
  }
  rows.push(row);
}

const counts = {};
for (const r of rows) counts[r.category] = (counts[r.category] ?? 0) + 1;
const report = {
  generatedAt: new Date().toISOString(),
  approvalRules,
  counts,
  rows,
};

console.log(JSON.stringify(counts, null, 2));
for (const r of rows.filter((r) => r.category === "retry_after_approval")) {
  console.log(
    `retry_after_approval  ${r.businessTransactionId}  ${r.matchedRuleId}`,
  );
}
if (outPath) {
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`report written to ${outPath}`);
}
