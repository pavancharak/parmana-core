#!/usr/bin/env node
// Generates the method and endpoint index tables in the developer portal from the
// source of record, so they cannot drift from the code:
//
//   typescript/src/client/ParmanaClient.ts   public methods and their delegation
//   typescript/src/client/*Api.ts            HTTP method and path each call uses
//   typescript/dist/client/ParmanaClient.d.ts  exact signatures (run after the build)
//   openapi/openapi.yaml                     every documented operation
//
// Usage (from the repository root, after `npm run build`):
//   node docs/developer-portal/tools/generate-indexes.mjs
//
// Writes docs/developer-portal/sdk/typescript-method-index.md and
// docs/developer-portal/api/endpoint-index.md. Exits non-zero if a source is missing.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..", "..");
const require = createRequire(join(repo, "package.json"));
const yaml = require("yaml");

const read = (p) => readFileSync(join(repo, p), "utf8");
const must = (p) => {
  if (!existsSync(join(repo, p))) {
    console.error(`missing source: ${p}`);
    process.exit(1);
  }
  return p;
};

// ---------------------------------------------------------------- TypeScript
const clientSrc = read(must("typescript/src/client/ParmanaClient.ts"));
const clientDts = read(must("typescript/dist/client/ParmanaClient.d.ts"));

// field -> API class, from the constructor, e.g. `this.policyApi = new PolicyApi(`
const apiClassByField = {};
for (const m of clientSrc.matchAll(/this\.(\w+)\s*=\s*new (\w+)\(/g)) {
  apiClassByField[m[1]] = m[2];
}

// HTTP method and path inside an API class method body.
function endpointOf(apiClass, fn) {
  const file = join("typescript/src/client", `${apiClass}.ts`);
  if (!existsSync(join(repo, file))) return null;
  const src = read(file);
  const start = src.search(
    new RegExp(`\\n\\s+(public\\s+)?(async\\s+)?${fn}\\s*\\(`),
  );
  if (start < 0) return null;
  const body = src.slice(start, src.indexOf("\n  }", start + 1) + 1);
  const httpMethod = (body.match(/method:\s*"(\w+)"/) || [])[1] ?? null;
  // The first string literal (quoted or template) that starts with "/" after `path:`. Handles
  // ternaries such as `status === undefined ? "/x" : \`/x?status=...\`` by taking the first branch.
  const literal = body.match(/path:[\s\S]*?([`"]\/[^`"\n]*[`"])/);
  let pathLine = literal ? literal[1] : "";
  pathLine = pathLine.replace(/\s+/g, " ").trim();
  // Turn `/transactions/${encodeURIComponent(id)}/status${query}` into /transactions/{id}/status
  const path = pathLine
    .replace(/^[`"]|[`"]$/g, "")
    .replace(/\$\{encodeURIComponent\([^)]*\)\}/g, "{param}")
    .replace(/\$\{[^}]*\}/g, "")
    .replace(/\?.*$/, "")
    .replace(/\s*\+.*$/, "");
  return { httpMethod, path: path || null };
}

// Each public method of ParmanaClient: its signature, and the first API call it makes.
const methodBlocks = [...clientSrc.matchAll(/\n {2}public (\w+)\(/g)].map(
  (m) => ({
    name: m[1],
    index: m.index,
  }),
);
const tsRows = [];
for (let i = 0; i < methodBlocks.length; i++) {
  const { name, index } = methodBlocks[i];
  const end =
    i + 1 < methodBlocks.length ? methodBlocks[i + 1].index : clientSrc.length;
  const body = clientSrc.slice(index, end);
  const call = body.match(/this\.(\w+)\.(\w+)\(/);
  let endpoint = { httpMethod: null, path: null };
  if (call && apiClassByField[call[1]]) {
    endpoint = endpointOf(apiClassByField[call[1]], call[2]) ?? endpoint;
  }
  // Signature from the compiled declaration file.
  const sigMatch = clientDts.match(
    new RegExp(`\\n\\s+${name}\\(([\\s\\S]*?)\\)\\s*:\\s*([^;]+);`),
  );
  const signature = sigMatch
    ? `${name}(${sigMatch[1].replace(/\s+/g, " ").trim()}): ${sigMatch[2].replace(/\s+/g, " ").trim()}`
    : `${name}(…)`;
  // Two cases the parser cannot express as one request. They are recorded by hand, with the source
  // lines that show it, so the table stays true.
  if (name === "endpoint") endpoint = { httpMethod: "local", path: null };
  if (name === "createTransaction") {
    // TransactionApi.create: declare() sends POST /transactions, then execute() sends
    // POST /transactions/{businessTransactionId}/execute (TransactionApi.ts lines 93-98).
    endpoint = {
      httpMethod: "POST",
      path: "/transactions → /transactions/{id}/execute",
    };
  }
  tsRows.push({
    name,
    signature,
    httpMethod: endpoint.httpMethod,
    path: endpoint.path,
  });
}

const tsTable = [
  "| Method | Signature (from `dist/client/ParmanaClient.d.ts`) | HTTP | Path |",
  "| --- | --- | --- | --- |",
  ...tsRows.map((r) => {
    const sig = r.signature.replace(/\|/g, "\\|");
    const path = r.path
      ? r.path.includes("→")
        ? r.path
        : `\`${r.path}\``
      : "—";
    return `| \`${r.name}\` | \`${sig}\` | ${r.httpMethod ?? "—"} | ${path} |`;
  }),
].join("\n");

// ---------------------------------------------------------------- Python
const pyClient = read(must("python/parmana/client.py"));
// attribute -> API class, e.g. `self.execution = ExecutionApi(`
const pyApiByAttr = {};
for (const m of pyClient.matchAll(/self\.(\w+)\s*=\s*(\w+Api)\(/g))
  pyApiByAttr[m[1]] = m[2];
const pyApiFile = (cls) => {
  // ExecutionApi -> execution_api.py, PolicyV2Api -> policy_v2_api.py
  const snake = cls.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  return join("python/parmana/api", `${snake}.py`);
};
function pyEndpointOf(cls, fn) {
  const file = pyApiFile(cls);
  if (!existsSync(join(repo, file))) return null;
  const src = read(file);
  const start = src.search(new RegExp(`\\n\\s+def ${fn}\\s*\\(`));
  if (start < 0) return null;
  const rest = src.slice(start + 1);
  const next = rest.slice(4).search(/\n {4}def |\nclass /);
  const body = next < 0 ? rest : rest.slice(0, next + 4);
  const httpMethod = (body.match(/method\s*=\s*"(\w+)"/) || [])[1] ?? null;
  // Parenthesised concatenation of string pieces: path=( f"..." f"..." )
  const concat = body.match(/path\s*=\s*\(\s*((?:f?"[^"\n]*"\s*)+)\)/);
  let pathExpr = concat
    ? [...concat[1].matchAll(/f?"([^"\n]*)"/g)].map((m) => m[1]).join("")
    : ((body.match(/path\s*=\s*(f?"[^"\n]*"|f?'[^'\n]*')/) ||
        body.match(/path\s*=\s*([^\n]+)/) ||
        [])[1]
        ?.trim()
        .replace(/,$/, "") ?? null);
  // path built by a helper, e.g. path=_change_path(id, "approve"): follow its return statement and
  // substitute literal string arguments for the helper's parameters.
  const helper = pathExpr && pathExpr.match(/^(\w+)\(([^)]*)\)/);
  if (helper) {
    const hs = src.search(new RegExp(`\\ndef ${helper[1]}\\s*\\(([^)]*)\\)`));
    const sig = hs < 0 ? null : src.slice(hs).match(/def \w+\(([^)]*)\)/);
    const ret =
      hs < 0
        ? null
        : (src.slice(hs).match(/return\s*\(?\s*((?:f?"[^"\n]*"\s*)+)\)?/) ||
            [])[1];
    let resolved = ret
      ? [...ret.matchAll(/f?"([^"\n]*)"/g)].map((m) => m[1]).join("")
      : null;
    if (resolved && sig) {
      const params = sig[1]
        .split(",")
        .map((x) => x.trim().split(":")[0].trim());
      const args = helper[2].split(",").map((x) => x.trim());
      params.forEach((name, i) => {
        const arg = args[i];
        if (arg !== undefined && /^["']/.test(arg))
          resolved = resolved.replace(
            new RegExp(`\\{${name}\\}`, "g"),
            arg.slice(1, -1),
          );
      });
    }
    pathExpr = resolved;
  }
  if (pathExpr && /^[A-Za-z_]\w*$/.test(pathExpr)) {
    // path is a bare variable (path=path): take its last assignment in the body.
    const assign = [
      ...body.matchAll(new RegExp(`\\b${pathExpr}\\s*=\\s*([^\\n]+)`, "g")),
    ].pop();
    pathExpr = assign ? assign[1].trim() : null;
  }
  let path = pathExpr
    ? pathExpr
        .replace(/^f?["']|["']$/g, "")
        .replace(/\{query\w*\}/g, "")
        .replace(/\{quote\([^}]*\)\}/g, "{param}")
        .replace(/\{[^}]*\}/g, "{param}")
    : null;
  if (path) path = path.replace(/\?.*$/, "");
  return { httpMethod, path: path || null };
}
const pyClassBlocks = [...pyClient.matchAll(/\n {4}def ([a-z]\w*)\(/g)].map(
  (m) => ({ name: m[1], index: m.index }),
);
const pyRows = [];
for (let i = 0; i < pyClassBlocks.length; i++) {
  const { name, index } = pyClassBlocks[i];
  const end =
    i + 1 < pyClassBlocks.length ? pyClassBlocks[i + 1].index : pyClient.length;
  const body = pyClient.slice(index, end);
  const call = body.match(/return self\.(\w+)\.(\w+)\(/);
  let endpoint = { httpMethod: null, path: null };
  if (call && pyApiByAttr[call[1]])
    endpoint = pyEndpointOf(pyApiByAttr[call[1]], call[2]) ?? endpoint;
  if (name === "version") endpoint = { httpMethod: "local", path: null };
  if (name === "endpoint") endpoint = { httpMethod: "local", path: null };
  const sigStart = pyClient.indexOf(`def ${name}(`, index);
  const sigEnd = pyClient.indexOf(":\n", sigStart);
  const sig = pyClient
    .slice(sigStart + 4, sigEnd)
    .replace(/\s+/g, " ")
    .replace(/\( /, "(")
    .replace(/ \)/, ")")
    .trim();
  // @property members are read as attributes (client.version), not called.
  const isProperty = /@property\s*$/.test(
    pyClient.slice(Math.max(0, sigStart - 40), sigStart),
  );
  // TransactionApi.create on the Python side is the same declare-then-execute composite (api/transaction_api.py, create()).
  if (name === "create_transaction")
    endpoint = {
      httpMethod: "POST",
      path: "/transactions → /transactions/{id}/execute",
    };
  pyRows.push({
    name,
    signature: (isProperty ? "property " : "") + sig,
    httpMethod: endpoint.httpMethod,
    path: endpoint.path,
  });
}
const pyTable = [
  "| Method | Signature (from `python/parmana/client.py`) | HTTP | Path |",
  "| --- | --- | --- | --- |",
  ...pyRows.map((r) => {
    const sig = r.signature.replace(/\|/g, "\\|");
    return `| \`${r.name}\` | \`${sig}\` | ${r.httpMethod ?? "—"} | ${r.path ? `\`${r.path}\`` : "—"} |`;
  }),
].join("\n");

// ---------------------------------------------------------------- OpenAPI
const spec = yaml.parse(read(must("openapi/openapi.yaml")));
const sdkPaths = new Set(); // "METHOD /path" pairs the TypeScript SDK actually calls
for (const r of tsRows)
  if (r.httpMethod && r.path) sdkPaths.add(`${r.httpMethod} ${r.path}`);

const normalize = (p) => p.replace(/\{[^}]+\}/g, "{param}");
const sdkMethodFor = (method, path) => {
  const want = normalize(path);
  const hit = tsRows.find(
    (r) => r.httpMethod === method && r.path && normalize(r.path) === want,
  );
  return hit ? `\`${hit.name}\`` : "—";
};

const opRows = [];
for (const [p, ops] of Object.entries(spec.paths)) {
  for (const [m, op] of Object.entries(ops)) {
    if (!["get", "post", "put", "delete", "patch"].includes(m)) continue;
    const method = m.toUpperCase();
    const sec =
      op.security === undefined
        ? "bearer (global)"
        : op.security.length === 0
          ? "none"
          : op.security.map((s) => Object.keys(s)[0]).join(", ");
    const summary = (op.summary ?? "")
      .replace(/\|/g, "\\|")
      .replace(/\s+/g, " ")
      .trim();
    opRows.push({
      method,
      path: p,
      opId: op.operationId ?? "",
      sec,
      summary,
      sdk: sdkMethodFor(method, p),
    });
  }
}
const endpointTable = [
  `| # | Method | Path | operationId | Auth | TypeScript SDK method | Summary |`,
  `| --- | --- | --- | --- | --- | --- | --- |`,
  ...opRows.map(
    (r, i) =>
      `| ${i + 1} | ${r.method} | \`${r.path}\` | \`${r.opId}\` | ${r.sec} | ${r.sdk} | ${r.summary} |`,
  ),
].join("\n");

const covered = opRows.filter((r) => r.sdk !== "—").length;

// ---------------------------------------------------------------- error codes
// Every upper-case error code literal the server source raises, with the file that raises it most often.
// The meaning comes from the observed runs (see COVERAGE.md) and the OpenAPI document; codes not triggered
// during verification are listed with their source location only.
const CODE_SOURCES = [
  "packages/api/src",
  "packages/runtime/src",
  "packages/execution-gateway/src",
  "packages/execution-control/src",
  "packages/policy/src",
  "packages/shared/src",
  "packages/crypto/src",
  "packages/storage/src",
];
const codeFiles = new Map();
// Environment variable names look like error codes; the example file lists them, so exclude them.
const envNames = new Set(
  [...read(".env.example").matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map(
    (m) => m[1],
  ),
);
const walk = (dir) => {
  const { readdirSync, statSync } = require("node:fs");
  const out = [];
  for (const name of readdirSync(join(repo, dir))) {
    const rel = `${dir}/${name}`;
    const st = statSync(join(repo, rel));
    if (st.isDirectory()) out.push(...walk(rel));
    else if (
      /\.ts$/.test(name) &&
      !/\.test\.ts$/.test(name) &&
      !/\/tests?\//.test(rel)
    )
      out.push(rel);
  }
  return out;
};
for (const dir of CODE_SOURCES) {
  if (!existsSync(join(repo, dir))) continue;
  for (const file of walk(dir)) {
    const text = read(file);
    for (const m of text.matchAll(/["'`]([A-Z][A-Z0-9_]{4,})["'`]/g)) {
      const code = m[1];
      if (
        !/_|^(REPLAYED|DIGEST_MISMATCH|CONTENT_MISMATCH|QUERY_MISMATCH|OUTCOME_UNKNOWN)$/.test(
          code,
        )
      )
        continue;
      if (
        envNames.has(code) ||
        /^(PARMANA_|KEY_|CRYPTO_|HYBRID_|POLICY_CHANGE_CHECKERS|EXECUTION_AUTHORIZATION_TTL|RATE_LIMIT_|KILL_SWITCH_|INBOUND_|ALERT_|PRIMARY_|SECONDARY_)/.test(
          code,
        )
      )
        continue; // environment names
      const entry = codeFiles.get(code) ?? { files: new Map() };
      entry.files.set(file, (entry.files.get(file) ?? 0) + 1);
      codeFiles.set(code, entry);
    }
  }
}
// Codes that a request in this verification actually produced (a response body, an SDK serverCode, or a runner output line).
const OBSERVED = new Set([
  "CAPABILITY_NOT_ALLOWED",
  "CAPABILITY_NOT_BOUND",
  "VERIFICATION_FAILED",
  "SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE",
  "NON_HUMAN_CALLER_DENIED",
  "STEP_UP_AUTHORIZATION_INVALID",
  "SOURCE_UNAVAILABLE",
  "RATE_LIMITED",
]);
const codeRows = [...codeFiles.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([code, e]) => {
    const top = [...e.files.entries()].sort((x, y) => y[1] - x[1])[0][0];
    return `| \`${code}\` | ${OBSERVED.has(code) ? "yes" : "no"} | \`${top}\` |`;
  });

// ---------------------------------------------------------------- write
const header = (what) =>
  `<!-- GENERATED by docs/developer-portal/tools/generate-indexes.mjs. Do not edit by hand. Source: ${what}. -->`;

writeFileSync(
  join(repo, "docs/developer-portal/sdk/typescript-method-index.md"),
  [
    header(
      "typescript/src/client/*.ts and typescript/dist/client/ParmanaClient.d.ts",
    ),
    "",
    "# TypeScript SDK method index",
    "",
    `${tsRows.length} public methods on \`ParmanaClient\`. The HTTP column is the request each method sends, read from the SDK source.`,
    "",
    tsTable,
    "",
  ].join("\n"),
);

writeFileSync(
  join(repo, "docs/developer-portal/sdk/python-method-index.md"),
  [
    header("python/parmana/client.py and python/parmana/api/*.py"),
    "",
    "# Python SDK method index",
    "",
    `${pyRows.length} public methods on \`ParmanaClient\` (\`parmana\` package). Each flat method delegates to a sub-API object (for example \`client.execution\`); the HTTP column is the request it sends.`,
    "",
    pyTable,
    "",
  ].join("\n"),
);

writeFileSync(
  join(repo, "docs/developer-portal/api/endpoint-index.md"),
  [
    header("openapi/openapi.yaml"),
    "",
    "# Endpoint index",
    "",
    `Every operation in \`openapi/openapi.yaml\` (${opRows.length} operations, OpenAPI ${spec.openapi}, API version ${spec.info.version}). "TypeScript SDK method" is the method that sends that exact method and path; "—" means no TypeScript SDK method sends it, so call it with HTTP.`,
    "",
    endpointTable,
    "",
  ].join("\n"),
);

writeFileSync(
  join(repo, "docs/developer-portal/reference/error-code-index.md"),
  [
    header(
      "packages/*/src (upper-case error code literals) and the observed runs",
    ),
    "",
    "# Error code index",
    "",
    `${codeRows.length} error code literals found in the server source. "Triggered in verification" means a request in this portal's runs produced the code. The others are defined in source and were not triggered; their meaning is in the file named, and their HTTP status is in that file's error path.`,
    "",
    "| Code | Triggered in verification | Raised most often in |",
    "| --- | --- | --- |",
    ...codeRows,
    "",
  ].join("\n"),
);

console.log(
  `Error codes in source: ${codeRows.length}, triggered in verification: ${[...OBSERVED].filter((c) => codeFiles.has(c)).length}`,
);
console.log(
  `TypeScript methods: ${tsRows.length} (with a request: ${tsRows.filter((r) => r.path).length}; local: ${tsRows.filter((r) => r.httpMethod === "local").length})`,
);
console.log(
  `OpenAPI operations: ${opRows.length} (covered by a TypeScript SDK method: ${covered})`,
);
console.log(
  `Python methods: ${pyRows.length} (with a request: ${pyRows.filter((r) => r.path).length}; local: ${pyRows.filter((r) => r.httpMethod === "local").length}; unresolved: ${
    pyRows
      .filter((r) => !r.httpMethod)
      .map((r) => r.name)
      .join(", ") || "none"
  })`,
);
console.log(`SDK HTTP pairs: ${sdkPaths.size}`);
