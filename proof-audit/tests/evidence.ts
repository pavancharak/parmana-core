import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Where proof-audit tests write their evidence (artifacts and results).
//
// By default each run writes to a fresh temporary folder, so the evidence
// committed under proof-audit/ does not change on every test run. To
// regenerate the committed evidence on purpose, set PARMANA_EVIDENCE_DIR to
// the proof-audit folder, for example:
//   PARMANA_EVIDENCE_DIR=$PWD/proof-audit npx vitest run proof-audit
export const evidenceRoot =
  process.env.PARMANA_EVIDENCE_DIR ?? mkdtempSync(join(tmpdir(), "parmana-evidence-"));

export const evidencePath = (...parts: string[]) => join(evidenceRoot, ...parts);
