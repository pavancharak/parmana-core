/**
 * Runs the Python and TypeScript code blocks in docs/site against a Parmana
 * endpoint, and reports what happens to each one.
 *
 * Most docs blocks are fragments: they use a `client` or a variable that the
 * page defines elsewhere. So each block runs with a short prelude that
 * creates `client` against the endpoint, and each result is classified:
 *
 *   PASS          the block ran and exited 0
 *   CONTEXT       it stopped on something the fragment assumes exists (a name,
 *                 a file, an environment variable, an authenticated caller).
 *                 Not a failure: the block needs its page or its environment.
 *   DEPENDENCY    it imports a package the repository does not install.
 *   SYNTAX        the block does not parse. A docs bug.
 *   FAIL          it ran and threw: the SDK or the server disagreed with the
 *                 sample. A docs or SDK bug to look at.
 *   TIMEOUT       it ran longer than the limit.
 *   LIVE          it names a production or sandbox host. Never run.
 *
 * Usage (the endpoint must already be running, see docs/dev if you need one):
 *   npx tsx scripts/run-docs-samples.ts --endpoint http://127.0.0.1:3000
 *   npx tsx scripts/run-docs-samples.ts --language python --json out.json
 *
 * Never point this at a production endpoint. Blocks that create real
 * transactions or change policies will do so.
 */

import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

type Language = "python" | "typescript";
type Outcome =
  "PASS" | "CONTEXT" | "DEPENDENCY" | "SYNTAX" | "FAIL" | "TIMEOUT" | "LIVE";

interface Block {
  page: string;
  line: number;
  language: Language;
  code: string;
}

interface Result extends Block {
  outcome: Outcome;
  detail: string;
}

const repoRoot = path.resolve(import.meta.dirname, "..");
const docsDir = path.join(repoRoot, "docs", "site");
const scratchDir = path.join(repoRoot, ".docs-samples-tmp");
const TIMEOUT_MS = 60_000;

const CONTEXT =
  /NameError|ReferenceError|is not defined|Cannot find name|No such file|ENOENT|FileNotFoundError|KeyError: '[A-Z_]+'|Missing required environment variable|Caller authentication is required|No authenticated caller identity|requires a caller credential provisioned as a verified human|No policy is bound|Execution Trust Record not found/;

// A block that names a live host would send real requests, so it is never run.
const LIVE_HOST =
  /https?:\/\/[^"'\s`)]*(vercel\.app|parmanasystems\.com|parmana\.com)/;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

// Generated signature listings are not samples: their code blocks show a
// method's signature, such as `class ApproverApi()`, and do not run.
const NOT_SAMPLES = ["sdks/reference/"];

function mdxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return mdxFiles(full);
    const relative = path.relative(docsDir, full).split(path.sep).join("/");
    if (NOT_SAMPLES.some((prefix) => relative.startsWith(prefix))) return [];
    return name.endsWith(".mdx") ? [full] : [];
  });
}

// A fence inside a list item is indented with its item. Remove the common
// indentation so the block parses the way it reads.
function dedent(code: string): string {
  const lines = code.split("\n");
  const indents = lines
    .filter((l) => l.trim() !== "")
    .map((l) => /^\s*/.exec(l)![0].length);
  const common = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(common)).join("\n");
}

function extractBlocks(language: Language): Block[] {
  const fence =
    language === "python"
      ? /```python[^\n]*\n/
      : /```(?:ts|typescript)[^\n]*\n/;
  const found: Block[] = [];
  for (const file of mdxFiles(docsDir)) {
    const text = readFileSync(file, "utf8");
    const pattern = new RegExp(fence.source + "([\\s\\S]*?)```", "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const line = text.slice(0, match.index).split("\n").length;
      found.push({
        page: path.relative(docsDir, file),
        line,
        language,
        code: dedent(match[1]),
      });
    }
  }
  return found;
}

function preludeFor(block: Block, endpoint: string): string {
  // A block that creates its own client keeps it: a second declaration would
  // not parse. The fragment's own client is what the page is showing.
  const declaresClient =
    block.language === "python"
      ? /^client\s*=/m.test(block.code)
      : /\b(const|let|var)\s+client\b/.test(block.code);
  if (block.language === "python") {
    return declaresClient
      ? ""
      : `from parmana import ParmanaClient\nclient = ParmanaClient(endpoint=${JSON.stringify(endpoint)})\n`;
  }
  return declaresClient
    ? ""
    : `import { ParmanaClient } from "@parmana/sdk";\nconst client = new ParmanaClient({ endpoint: ${JSON.stringify(endpoint)} });\n`;
}

function classify(block: Block, endpoint: string, index: number): Result {
  const live = LIVE_HOST.exec(block.code);
  if (live)
    return {
      ...block,
      outcome: "LIVE",
      detail: `names live host ${live[0]}; not run`,
    };
  const prelude = preludeFor(block, endpoint);
  let file: string;
  let command: string;
  let args: string[];
  if (block.language === "python") {
    file = path.join(scratchDir, `sample_${index}.py`);
    command = "python3";
    args = [file];
  } else {
    file = path.join(scratchDir, `sample_${index}.mts`);
    command = "npx";
    args = ["tsx", file];
  }
  writeFileSync(file, prelude + block.code);
  const run = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    env: {
      ...process.env,
      PARMANA_ENDPOINT: endpoint,
      PYTHONDONTWRITEBYTECODE: "1",
    },
  });
  const stderr = `${run.stderr ?? ""}`;
  const stdout = `${run.stdout ?? ""}`;
  // The first line that names an error. For tsx the last line is Node's
  // version banner, which says nothing about the sample.
  const errorLine =
    stderr
      .split("\n")
      .find((l) => /(Error|error)[:\s]|Cannot find|is not defined/.test(l))
      ?.trim() ?? "";
  const lastLine = errorLine;

  if (run.error && (run.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
    return { ...block, outcome: "TIMEOUT", detail: "over 60 seconds" };
  }
  if (run.status === 0) return { ...block, outcome: "PASS", detail: "" };
  if (
    /SyntaxError|IndentationError|Unexpected token|Expected .* but found|Transform failed/.test(
      stderr,
    )
  ) {
    return { ...block, outcome: "SYNTAX", detail: lastLine.slice(0, 200) };
  }
  // The fragment depends on something the reader sets up or what an earlier
  // step on the page creates: a variable, a file, an environment variable, an
  // authenticated caller, or server state from an earlier request.
  // An illustrative integration imports a framework the repository does not
  // install (flask, langchain, crewai, fastapi, ...). Not a docs error.
  if (/No module named|Cannot find package|ERR_MODULE_NOT_FOUND/.test(stderr)) {
    return { ...block, outcome: "DEPENDENCY", detail: lastLine.slice(0, 200) };
  }
  if (CONTEXT.test(stderr)) {
    return { ...block, outcome: "CONTEXT", detail: lastLine.slice(0, 200) };
  }
  const message =
    lastLine || stdout.trim().split("\n").pop() || `exit ${run.status}`;
  return { ...block, outcome: "FAIL", detail: message.slice(0, 300) };
}

function main(): void {
  const endpoint =
    arg("endpoint") ?? process.env.PARMANA_ENDPOINT ?? "http://127.0.0.1:3000";
  const only = arg("language") as Language | undefined;
  const jsonOut = arg("json");
  const languages: Language[] = only ? [only] : ["python", "typescript"];

  if (/parmana(\.com|\.systems)|vercel\.app/.test(endpoint)) {
    throw new Error(
      `Refusing to run against ${endpoint}: this harness creates real records.`,
    );
  }

  mkdirSync(scratchDir, { recursive: true });
  const results: Result[] = [];
  let index = 0;
  try {
    for (const language of languages) {
      for (const block of extractBlocks(language)) {
        results.push(classify(block, endpoint, index++));
      }
    }
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }

  const counts: Record<Outcome, number> = {
    PASS: 0,
    CONTEXT: 0,
    DEPENDENCY: 0,
    SYNTAX: 0,
    FAIL: 0,
    TIMEOUT: 0,
    LIVE: 0,
  };
  for (const r of results) counts[r.outcome]++;
  console.log(`endpoint ${endpoint}`);
  console.log(
    `blocks ${results.length}: ${Object.entries(counts)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
  );
  for (const r of results.filter(
    (x) =>
      x.outcome === "SYNTAX" || x.outcome === "FAIL" || x.outcome === "TIMEOUT",
  )) {
    console.log(
      `${r.outcome.padEnd(8)} ${r.language.padEnd(10)} ${r.page}:${r.line}  ${r.detail}`,
    );
  }
  if (jsonOut)
    writeFileSync(
      jsonOut,
      JSON.stringify({ endpoint, counts, results }, null, 2),
    );
}

main();
