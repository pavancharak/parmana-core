import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Code samples in the docs are not run by anything else, and on
 * 2026-10-02 the page by page audit found samples that could never have
 * worked: SDK guides naming a policy version that no longer loads,
 * sending signals the policy does not declare, and an AI agent sample
 * with undefined variables. These tests check what such samples get
 * wrong, without requiring every fragment to be a complete program:
 *
 *  1. TypeScript samples that import @parmana/sdk are type checked
 *     against the built SDK. Only errors that mean the sample disagrees
 *     with the SDK fail (a missing export, method or property, a wrong
 *     argument); a name the fragment assumes exists does not.
 *  2. Every policy a request sample names (a name and version pair, in
 *     any language) exists and declares a human approval.
 *  3. Every signal such a sample sends is declared by that policy.
 *
 * Python samples are checked by python/tests/test_docs_code_samples.py.
 */

const root = process.cwd();
const docsDir = path.join(root, "docs", "site");
const policiesDir = path.join(root, "policies");

interface Sample {
  readonly file: string;
  readonly line: number;
  readonly language: string;
  readonly code: string;
}

function mdxFiles(dir: string): string[] {
  const out: string[] = [];

  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);

    if (statSync(full).isDirectory()) {
      out.push(...mdxFiles(full));
    } else if (name.endsWith(".mdx")) {
      out.push(full);
    }
  }
  return out;
}

function samples(): Sample[] {
  const out: Sample[] = [];
  const fence = /^([ \t]*)```([a-zA-Z]*)[^\n]*\n([\s\S]*?)^\1```/gm;

  for (const file of mdxFiles(docsDir)) {
    const text = readFileSync(file, "utf8");

    for (const match of text.matchAll(fence)) {
      const indent = match[1] ?? "";
      const code = (match[3] ?? "")
        .split("\n")
        .map((line) =>
          line.startsWith(indent) ? line.slice(indent.length) : line,
        )
        .join("\n");

      out.push({
        file: path.relative(root, file).replace(/\\/g, "/"),
        line: text.slice(0, match.index).split("\n").length,
        language: (match[2] ?? "").toLowerCase(),
        code,
      });
    }
  }
  return out;
}

const all = samples();

// ---------------------------------------------------------------------------
// 1. TypeScript samples against the SDK
// ---------------------------------------------------------------------------

/**
 * Diagnostics that mean the sample disagrees with the SDK. Everything
 * else (a name the fragment assumes is in scope, an implicit any, an
 * unused value) is what a fragment is allowed to leave out.
 */
const SDK_MISMATCH_CODES = new Set([
  2305, // Module has no exported member
  2724, // Module has no exported member, did you mean
  2339, // Property does not exist on type
  2551, // Property does not exist on type, did you mean
  2353, // Object literal may only specify known properties
  2561, // Object literal may only specify known properties, did you mean
  2345, // Argument of type is not assignable to parameter
  2554, // Expected N arguments, but got M
  2555, // Expected at least N arguments
  2322, // Type is not assignable to type
  2741, // Property is missing in type
  2739, // Type is missing properties
]);

function typescriptSdkSamples(): Sample[] {
  return all.filter(
    (sample) =>
      (sample.language === "typescript" || sample.language === "ts") &&
      sample.code.includes('from "@parmana/sdk"'),
  );
}

function typeCheck(list: readonly Sample[]): string[] {
  const virtual = new Map<string, Sample>();

  list.forEach((sample, index) => {
    virtual.set(
      path
        .join(root, ".docs-samples", `sample-${index}.ts`)
        .replace(/\\/g, "/"),
      sample,
    );
  });

  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    // No DOM: a sample's `event` or `fetch` is then a name the fragment
    // assumes, not the browser's.
    lib: ["lib.es2022.d.ts"],
    types: ["node"],
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);

  const source = (fileName: string): string | undefined => {
    const sample = virtual.get(fileName.replace(/\\/g, "/"));
    // `export {}` makes each sample a module, so top level await and
    // imports type check, and samples do not see each other's names.
    return sample === undefined ? undefined : `${sample.code}\nexport {};\n`;
  };

  host.fileExists = (fileName) =>
    source(fileName) !== undefined || fileExists(fileName);
  host.readFile = (fileName) => source(fileName) ?? readFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const text = source(fileName);

    return text !== undefined
      ? ts.createSourceFile(fileName, text, languageVersion, true)
      : getSourceFile(fileName, languageVersion, onError, shouldCreate);
  };

  const program = ts.createProgram([...virtual.keys()], options, host);
  const problems: string[] = [];

  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    const fileName = diagnostic.file?.fileName.replace(/\\/g, "/");
    const sample = fileName === undefined ? undefined : virtual.get(fileName);

    if (sample === undefined || !SDK_MISMATCH_CODES.has(diagnostic.code)) {
      continue;
    }

    const { line } = diagnostic.file!.getLineAndCharacterOfPosition(
      diagnostic.start ?? 0,
    );

    problems.push(
      `${sample.file}:${sample.line + 1 + line} TS${diagnostic.code} ` +
        ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
    );
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 2 and 3. Policies and signals named by request samples
// ---------------------------------------------------------------------------

interface PolicyReferenceInSample {
  readonly sample: Sample;
  readonly name: string;
  readonly version: string;
  readonly offset: number;
}

const REFERENCE_PATTERNS = [
  // TypeScript and JSON: name: "x", version: "1.0.0" (quoted keys or not)
  /"?name"?\s*:\s*"([a-z0-9][a-z0-9-]*)"\s*,\s*"?version"?\s*:\s*"(\d+\.\d+\.\d+)"/g,
  // Python: PolicyReference(name="x", version="1.0.0"
  /PolicyReference\(\s*name\s*=\s*"([a-z0-9][a-z0-9-]*)"\s*,\s*version\s*=\s*"(\d+\.\d+\.\d+)"/g,
];

function policyReferences(): PolicyReferenceInSample[] {
  const out: PolicyReferenceInSample[] = [];

  for (const sample of all) {
    for (const pattern of REFERENCE_PATTERNS) {
      for (const match of sample.code.matchAll(pattern)) {
        const name = match[1] as string;

        // Only names that are policies in this repository: a sample may
        // also show { name, version } of a package or an SDK.
        if (existsSync(path.join(policiesDir, name))) {
          out.push({
            sample,
            name,
            version: match[2] as string,
            offset: match.index ?? 0,
          });
        }
      }
    }
  }
  return out;
}

interface PolicyFile {
  readonly signalsSchema?: Record<string, unknown>;
  readonly approvalSignals?: Record<string, { artifact?: string }>;
}

function loadPolicy(name: string, version: string): PolicyFile | undefined {
  const file = path.join(policiesDir, name, version, "policy.json");

  return existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as PolicyFile)
    : undefined;
}

/** The text of the first balanced { ... } after `from`, or undefined. */
function balancedObject(code: string, from: number): string | undefined {
  const open = code.indexOf("{", from);

  if (open < 0) return undefined;

  let depth = 0;

  for (let index = open; index < code.length; index++) {
    const char = code[index];

    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) return code.slice(open + 1, index);
    }
  }
  return undefined;
}

/** Keys at the top level of an object literal body. */
function topLevelKeys(body: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of body) {
    if (char === "{" || char === "[" || char === "(") depth++;
    if (char === "}" || char === "]" || char === ")") depth--;
    if (char === "," && depth === 0) {
      keys.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  keys.push(current);

  return keys
    .map((entry) => entry.replace(/\/\/[^\n]*|#[^\n]*/g, "").trim())
    .map(
      (entry) => /^["']?([A-Za-z_][A-Za-z0-9_]*)["']?\s*[:=]/.exec(entry)?.[1],
    )
    .filter((key): key is string => key !== undefined);
}

/** The signals the sample sends after this policy reference, if any. */
function signalKeys(reference: PolicyReferenceInSample): string[] | undefined {
  // Only a request carries an Intent (or an action); a response such as
  // GET /policies/in-effect also has a `signals` object, of requirements.
  // SDK builders take `action` instead of an `intent` object.
  if (!/intent|["']?action["']?\s*[:=]/i.test(reference.sample.code)) {
    return undefined;
  }

  const rest = reference.sample.code.slice(reference.offset);
  const at = /["']?signals["']?\s*[:=]\s*(?:dict\()?\{/.exec(rest);

  if (at === null || at.index > 600) return undefined;

  const body = balancedObject(rest, at.index);

  return body === undefined ? undefined : topLevelKeys(body);
}

describe("code samples in the docs", () => {
  it("finds the samples it checks", () => {
    expect(typescriptSdkSamples().length).toBeGreaterThan(20);
    expect(policyReferences().length).toBeGreaterThan(20);
  });

  it("TypeScript samples agree with the SDK", () => {
    expect(typeCheck(typescriptSdkSamples())).toEqual([]);
  });

  it("every policy a sample names exists and requires a signed human approval", () => {
    const problems: string[] = [];

    for (const reference of policyReferences()) {
      const policy = loadPolicy(reference.name, reference.version);
      const where = `${reference.sample.file}:${reference.sample.line}`;

      if (policy === undefined) {
        problems.push(
          `${where} ${reference.name} ${reference.version} does not exist`,
        );
      } else if (Object.keys(policy.approvalSignals ?? {}).length === 0) {
        problems.push(
          `${where} ${reference.name} ${reference.version} has no approvalSignals, so it is refused when it loads`,
        );
      }
    }
    expect(problems).toEqual([]);
  });

  it("every signal a sample sends is declared by the policy it names", () => {
    const problems: string[] = [];

    for (const reference of policyReferences()) {
      const policy = loadPolicy(reference.name, reference.version);
      const keys = signalKeys(reference);

      if (policy === undefined || keys === undefined) continue;

      const declared = new Set([
        ...Object.keys(policy.signalsSchema ?? {}),
        "approvalArtifact",
        ...Object.values(policy.approvalSignals ?? {}).flatMap((entry) =>
          entry.artifact === undefined ? [] : [entry.artifact],
        ),
      ]);

      for (const key of keys) {
        if (!declared.has(key)) {
          problems.push(
            `${reference.sample.file}:${reference.sample.line} signal "${key}" is not declared by ${reference.name} ${reference.version}`,
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
