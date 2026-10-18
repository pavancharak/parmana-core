/**
 * Generates the proof-audit gap status table in docs/REMAINING-WORK.md from the
 * `Status:` sentence of each gap entry in docs/VERIFICATION-GAPS.md.
 *
 *   npx tsx scripts/gap-status.ts          rewrite the table
 *   npx tsx scripts/gap-status.ts --check  exit 1 if the table is out of date
 *
 * Scope: G-103 onward, the proof audit (CLAIMS 2.57). Older gaps keep their own history.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const GAPS_FILE = resolve(root, "docs/VERIFICATION-GAPS.md");
export const REMAINING_FILE = resolve(root, "docs/REMAINING-WORK.md");
export const START = "<!-- gap-status:start -->";
export const END = "<!-- gap-status:end -->";
const FROM = 103;

export interface GapRow {
  readonly id: string;
  readonly title: string;
  readonly status: string;
}

/** Reads each proof-audit gap's title and first Status sentence. */
export function readGaps(text: string): GapRow[] {
  const rows: GapRow[] = [];
  const entry = /\*\*(G-(\d+))\. ([^*]+?)\*\*([\s\S]*?)(?=\n\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = entry.exec(text)) !== null) {
    const number = Number(m[2]);
    if (number < FROM) continue;
    const body = m[4] ?? "";
    const statusMatch = body.match(/Status(?:: | is )([^]*?)\.(?=\s|$)/);
    if (!statusMatch) throw new Error(`${m[1]} has no Status sentence.`);
    rows.push({
      id: m[1]!,
      title: m[3]!.trim(),
      status: statusMatch[1]!.replace(/\s+/g, " ").trim(),
    });
  }
  return rows;
}

/**
 * The status table as Markdown, between the markers. Cells are padded to equal
 * width, as Prettier formats Markdown tables, so `npm run format` leaves it unchanged.
 */
export function renderTable(rows: readonly GapRow[]): string {
  const header = ["Gap", "Item", "Status"];
  const body = rows.map((r) => [r.id, r.title.replace(/\|/g, "/"), r.status.replace(/\|/g, "/")]);
  const all = [header, ...body];
  const widths = header.map((_, c) => Math.max(...all.map((row) => row[c]!.length)));
  const line = (cells: string[]) =>
    "| " + cells.map((cell, c) => cell.padEnd(widths[c]!)).join(" | ") + " |";
  const rule = "| " + widths.map((w) => "-".repeat(w)).join(" | ") + " |";
  return [START, "", line(header), rule, ...body.map(line), "", END].join("\n");
}

/** Replaces the block between the markers in the remaining-work text. */
export function spliceTable(remaining: string, table: string): string {
  const start = remaining.indexOf(START);
  const end = remaining.indexOf(END);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(`docs/REMAINING-WORK.md must contain ${START} and ${END}.`);
  }
  return remaining.slice(0, start) + table + remaining.slice(end + END.length);
}

function main(): void {
  const check = process.argv.includes("--check");
  const table = renderTable(readGaps(readFileSync(GAPS_FILE, "utf8")));
  const current = readFileSync(REMAINING_FILE, "utf8");
  const next = spliceTable(current, table);

  if (check) {
    if (next !== current) {
      console.error("docs/REMAINING-WORK.md gap status table is out of date. Run: npx tsx scripts/gap-status.ts");
      process.exit(1);
    }
    console.log("gap status table is up to date");
    return;
  }

  writeFileSync(REMAINING_FILE, next);
  console.log("gap status table written");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
