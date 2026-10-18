import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

/**
 * Checks that the code in the SDK documentation only uses names that exist in
 * the real SDKs.
 *
 * TypeScript: reads typescript/dist/index.d.ts with the compiler API, so the
 * exports, the ParmanaClient members and the Configuration options are the
 * real ones. Python: reads the SDK sources directly, so no Python install is
 * needed.
 *
 * It checks names, not behavior: every import from the SDK, every method called
 * on a client, and every constructor option must exist. That is the class of
 * mistake that makes a copy pasted example fail, and the one a rename of the SDK
 * causes silently.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export const TYPESCRIPT_DOC_PAGES = [
  "sdks/typescript",
  "guides/typescript-sdk-overview",
  "guides/typescript-sdk-quickstart",
  "guides/typescript-sdk-ai-agents",
  "guides/typescript-sdk-production",
] as const;

export const PYTHON_DOC_PAGES = [
  "sdks/python",
  "guides/python-sdk-overview",
  "guides/python-sdk-quickstart",
  "guides/python-sdk-ai-agents",
  "guides/python-sdk-production",
] as const;

interface CodeBlock {
  readonly page: string;
  readonly language: string;
  readonly startLine: number;
  readonly code: string;
}

function readPage(page: string): string {
  return readFileSync(join(repoRoot, "docs", "site", `${page}.mdx`), "utf8");
}

function codeBlocks(page: string): CodeBlock[] {
  const lines = readPage(page).split(/\r?\n/);
  const blocks: CodeBlock[] = [];
  let current: { language: string; startLine: number; body: string[] } | null =
    null;

  lines.forEach((line, index) => {
    const fence = line.match(/^\s*```(\w*)/);

    if (fence !== null) {
      if (current === null) {
        current = {
          language: (fence[1] ?? "").toLowerCase(),
          startLine: index + 2,
          body: [],
        };
      } else {
        blocks.push({
          page,
          language: current.language,
          startLine: current.startLine,
          code: current.body.join("\n"),
        });
        current = null;
      }

      return;
    }

    current?.body.push(line);
  });

  return blocks;
}

// ------------------------------------------------------------------ TypeScript

interface TypeScriptSurface {
  readonly exports: ReadonlySet<string>;
  readonly clientMembers: ReadonlySet<string>;
  readonly configurationKeys: ReadonlySet<string>;
}

function typeScriptSurface(): TypeScriptSurface {
  const entry = resolve(repoRoot, "typescript", "dist", "index.d.ts");
  const program = ts.createProgram([entry], {});
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);

  if (source === undefined) {
    throw new Error(
      "typescript/dist/index.d.ts not found. Build the SDK first (npm run build --workspace=typescript).",
    );
  }

  const moduleSymbol = checker.getSymbolAtLocation(source);

  if (moduleSymbol === undefined) {
    throw new Error("Could not read the SDK module symbol.");
  }

  const exported = checker.getExportsOfModule(moduleSymbol);
  const byName = new Map(exported.map((symbol) => [symbol.getName(), symbol]));

  const membersOf = (name: string): Set<string> => {
    const symbol = byName.get(name);

    if (symbol === undefined) return new Set();

    const resolved =
      (symbol.flags & ts.SymbolFlags.Alias) !== 0
        ? checker.getAliasedSymbol(symbol)
        : symbol;

    return new Set(
      checker
        .getPropertiesOfType(checker.getDeclaredTypeOfSymbol(resolved))
        .filter((property) => {
          // Private and protected members are not part of the public API.
          const declaration = property.valueDeclaration;

          return (
            declaration === undefined ||
            (ts.getCombinedModifierFlags(declaration) &
              ts.ModifierFlags.NonPublicAccessibilityModifier) ===
              0
          );
        })
        .map((property) => property.getName()),
    );
  };

  return {
    exports: new Set(byName.keys()),
    clientMembers: membersOf("ParmanaClient"),
    configurationKeys: membersOf("Configuration"),
  };
}

const TS_LANGUAGES = new Set(["ts", "typescript", "tsx", "js", "javascript"]);

/** Returns the top level keys of the object literal that starts at `open`. */
function topLevelKeys(text: string, open: number): string[] {
  const keys: string[] = [];
  let depth = 0;
  let index = open;

  for (; index < text.length; index += 1) {
    const char = text[index];

    if (char === "{" || char === "(" || char === "[") depth += 1;
    if (char === "}" || char === ")" || char === "]") {
      depth -= 1;
      if (depth === 0) break;
    }

    if (depth === 1 && (char === "{" || char === ",")) {
      const rest = text.slice(index + 1);
      const match = rest.match(/^\s*(?:\/\/[^\n]*\n\s*)*(\w+)\s*[:,}]/);

      if (match?.[1] !== undefined) keys.push(match[1]);
    }
  }

  return keys;
}

function checkTypeScriptBlock(
  block: CodeBlock,
  surface: TypeScriptSurface,
): string[] {
  const problems: string[] = [];
  const where = `${block.page}.mdx:${block.startLine}`;
  const code = block.code;

  for (const match of code.matchAll(
    /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']@parmana\/sdk["']/g,
  )) {
    for (const raw of (match[1] ?? "").split(",")) {
      const name = raw
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]
        ?.trim();

      if (name && !surface.exports.has(name)) {
        problems.push(
          `${where}: "${name}" is imported from @parmana/sdk but is not exported`,
        );
      }
    }
  }

  for (const match of code.matchAll(/instanceof\s+(\w+)/g)) {
    const name = match[1] as string;
    const isSdkError = /(Error)$/.test(name);

    if (isSdkError && name !== "Error" && !surface.exports.has(name)) {
      problems.push(
        `${where}: instanceof ${name}, which the SDK does not export`,
      );
    }
  }

  const clientVariables = new Set<string>();

  for (const match of code.matchAll(
    /(?:const|let|var)\s+(\w+)\s*=\s*new\s+ParmanaClient\s*\(/g,
  )) {
    clientVariables.add(match[1] as string);
  }

  for (const variable of clientVariables) {
    for (const call of code.matchAll(
      new RegExp(`\\b${variable}\\.(\\w+)`, "g"),
    )) {
      const member = call[1] as string;

      if (!surface.clientMembers.has(member)) {
        problems.push(
          `${where}: ${variable}.${member} is not a member of ParmanaClient`,
        );
      }
    }
  }

  for (const match of code.matchAll(/new\s+ParmanaClient\s*\(\s*\{/g)) {
    const open = (match.index ?? 0) + match[0].length - 1;

    for (const key of topLevelKeys(code, open)) {
      if (!surface.configurationKeys.has(key)) {
        problems.push(
          `${where}: new ParmanaClient({ ${key} }) is not a Configuration option`,
        );
      }
    }
  }

  return problems;
}

// ---------------------------------------------------------------------- Python

interface PythonSurface {
  readonly topLevelExports: ReadonlySet<string>;
  readonly errorExports: ReadonlySet<string>;
  readonly modelExports: ReadonlySet<string>;
  readonly cryptoExports: ReadonlySet<string>;
  readonly clientMethods: ReadonlySet<string>;
  /** Client attributes that are @property, so calling them is a mistake. */
  readonly clientProperties: ReadonlySet<string>;
  readonly subApis: ReadonlyMap<string, ReadonlySet<string>>;
  readonly constructorParameters: ReadonlySet<string>;
}

function read(file: string): string {
  return readFileSync(join(repoRoot, "python", "parmana", file), "utf8");
}

function allList(source: string): string[] {
  const match = source.match(/__all__\s*=\s*\[([\s\S]*?)\]/);

  return [...(match?.[1] ?? "").matchAll(/["'](\w+)["']/g)].map(
    (entry) => entry[1] as string,
  );
}

function classMethods(source: string): Map<string, Set<string>> {
  const classes = new Map<string, Set<string>>();
  let current: Set<string> | null = null;

  for (const line of source.split(/\r?\n/)) {
    const cls = line.match(/^class\s+(\w+)/);

    if (cls?.[1] !== undefined) {
      current = new Set();
      classes.set(cls[1], current);
      continue;
    }

    const method = line.match(/^ {4}(?:async\s+)?def\s+([a-zA-Z]\w*)\(/);

    if (method?.[1] !== undefined && current !== null) current.add(method[1]);
  }

  return classes;
}

function pythonSurface(): PythonSurface {
  const errorExports = new Set(allList(read("errors/__init__.py")));
  const modelExports = new Set(allList(read("models/__init__.py")));
  const cryptoExports = new Set(allList(read("crypto/__init__.py")));

  const client = read("client.py");
  const clientMethods = classMethods(client).get("ParmanaClient") ?? new Set();

  const clientProperties = new Set(
    [...client.matchAll(/@property\s*\n\s*def\s+(\w+)\(/g)].map(
      (entry) => entry[1] as string,
    ),
  );

  const apiFiles = [
    "audit_api",
    "execution_api",
    "policy_api",
    "receipt_api",
    "refusal_api",
    "replay_api",
    "transaction_api",
    "trust_record_api",
    "verification_api",
  ];

  const methodsByClass = new Map<string, Set<string>>();

  for (const file of apiFiles) {
    for (const [name, methods] of classMethods(read(`api/${file}.py`))) {
      methodsByClass.set(name, methods);
    }
  }

  const subApis = new Map<string, ReadonlySet<string>>();

  for (const match of client.matchAll(/self\.(\w+)\s*=\s*(\w+Api)\(/g)) {
    subApis.set(
      match[1] as string,
      methodsByClass.get(match[2] as string) ?? new Set(),
    );
  }

  const init = client.match(/def __init__\(([\s\S]*?)\)\s*->\s*None/);
  const constructorParameters = new Set(
    [...(init?.[1] ?? "").matchAll(/^\s+(\w+)\s*:/gm)].map(
      (entry) => entry[1] as string,
    ),
  );

  return {
    topLevelExports: new Set([
      "__version__",
      "ParmanaClient",
      "create_business_transaction",
      ...errorExports,
      ...modelExports,
    ]),
    errorExports,
    modelExports,
    cryptoExports,
    clientMethods,
    clientProperties,
    subApis,
    constructorParameters,
  };
}

const PY_LANGUAGES = new Set(["python", "py"]);

function importedNames(list: string): string[] {
  return list
    .replace(/[()]/g, " ")
    .split(",")
    .map(
      (entry) =>
        entry
          .trim()
          .split(/\s+as\s+/)[0]
          ?.trim() ?? "",
    )
    .filter((name) => name !== "");
}

function checkPythonBlock(block: CodeBlock, surface: PythonSurface): string[] {
  const problems: string[] = [];
  const where = `${block.page}.mdx:${block.startLine}`;
  const code = block.code;

  const modules: Array<[string, ReadonlySet<string>]> = [
    ["parmana", surface.topLevelExports],
    ["parmana.errors", surface.errorExports],
    ["parmana.models", surface.modelExports],
    ["parmana.crypto", surface.cryptoExports],
  ];

  for (const [module, names] of modules) {
    const pattern = new RegExp(
      `from\\s+${module.replace(".", "\\.")}\\s+import\\s+(\\([^)]*\\)|[^\\n]+)`,
      "g",
    );

    for (const match of code.matchAll(pattern)) {
      for (const name of importedNames(match[1] ?? "")) {
        if (!names.has(name)) {
          problems.push(
            `${where}: "${name}" is imported from ${module} but is not exported`,
          );
        }
      }
    }
  }

  const clientVariables = new Set<string>();

  for (const match of code.matchAll(/(\w+)\s*=\s*ParmanaClient\s*\(/g)) {
    clientVariables.add(match[1] as string);
  }

  for (const variable of clientVariables) {
    for (const call of code.matchAll(
      new RegExp(`\\b${variable}\\.(\\w+)(?:\\.(\\w+))?`, "g"),
    )) {
      const first = call[1] as string;
      const second = call[2];

      if (surface.subApis.has(first)) {
        if (second !== undefined && !surface.subApis.get(first)?.has(second)) {
          problems.push(
            `${where}: ${variable}.${first}.${second} does not exist`,
          );
        }
      } else if (
        surface.clientProperties.has(first) &&
        new RegExp(`\\b${variable}\\.${first}\\(`).test(code)
      ) {
        problems.push(
          `${where}: ${variable}.${first} is a property, do not call it`,
        );
      } else if (!surface.clientMethods.has(first)) {
        problems.push(
          `${where}: ${variable}.${first} is not a ParmanaClient method or sub API`,
        );
      }
    }
  }

  for (const match of code.matchAll(/ParmanaClient\s*\(([^)]*)\)/g)) {
    for (const key of (match[1] ?? "").matchAll(/(\w+)\s*=/g)) {
      const name = key[1] as string;

      if (!surface.constructorParameters.has(name)) {
        problems.push(
          `${where}: ParmanaClient(${name}=...) is not a constructor parameter`,
        );
      }
    }
  }

  return problems;
}

// ---------------------------------------------------------------------- Public

export function checkSdkDocs(): string[] {
  const problems: string[] = [];
  const typescriptSurface = typeScriptSurface();
  const pythonApi = pythonSurface();

  for (const page of TYPESCRIPT_DOC_PAGES) {
    for (const block of codeBlocks(page)) {
      if (TS_LANGUAGES.has(block.language)) {
        problems.push(...checkTypeScriptBlock(block, typescriptSurface));
      }
    }
  }

  for (const page of PYTHON_DOC_PAGES) {
    for (const block of codeBlocks(page)) {
      if (PY_LANGUAGES.has(block.language)) {
        problems.push(...checkPythonBlock(block, pythonApi));
      }
    }
  }

  return problems;
}

/**
 * The real public surface of both SDKs, for tests that require the
 * configuration and behavior reference pages to cover all of it.
 */
export function sdkSurfaces(): {
  typescript: { clientMembers: string[]; configurationKeys: string[] };
  python: {
    clientMethods: string[];
    constructorParameters: string[];
    subApis: Array<{ name: string; methods: string[] }>;
  };
} {
  const typescript = typeScriptSurface();
  const python = pythonSurface();

  return {
    typescript: {
      clientMembers: [...typescript.clientMembers].sort(),
      configurationKeys: [...typescript.configurationKeys].sort(),
    },
    python: {
      clientMethods: [...python.clientMethods].sort(),
      constructorParameters: [...python.constructorParameters].sort(),
      subApis: [...python.subApis].map(([name, methods]) => ({
        name,
        methods: [...methods].sort(),
      })),
    },
  };
}
