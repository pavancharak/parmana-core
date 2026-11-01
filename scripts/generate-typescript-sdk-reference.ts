import ts from "typescript";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Generates the TypeScript SDK reference pages under
 * docs/site/sdks/reference/typescript from the TypeScript source, using the
 * TypeScript compiler API directly. One page per exported declaration, in a
 * folder per kind, with the same paths the llms text builder and the API
 * manifest link to (for example classes/ParmanaClient). Replaces typedoc and
 * typedoc-plugin-markdown, which pinned an old minimatch.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = path.join(root, "typescript", "src", "index.ts");
const TSCONFIG = path.join(root, "typescript", "tsconfig.json");
const DOCS_DIR = path.join(
  root,
  "docs",
  "site",
  "sdks",
  "reference",
  "typescript",
);
const DOCS_JSON_PATH = path.join(root, "docs", "site", "docs.json");
const NAV_BASE = "sdks/reference/typescript";

const CATEGORY_LABELS: Record<string, string> = {
  classes: "Classes",
  interfaces: "Interfaces",
  enumerations: "Enumerations",
  "type-aliases": "Type Aliases",
  functions: "Functions",
  variables: "Variables",
};

const KIND_LABELS: Record<string, string> = {
  classes: "Class",
  interfaces: "Interface",
  enumerations: "Enumeration",
  "type-aliases": "Type Alias",
  functions: "Function",
  variables: "Variable",
};

type Category = keyof typeof CATEGORY_LABELS;

function categoryOf(decl: ts.Declaration): Category | undefined {
  if (ts.isClassDeclaration(decl)) return "classes";
  if (ts.isInterfaceDeclaration(decl)) return "interfaces";
  if (ts.isEnumDeclaration(decl)) return "enumerations";
  if (ts.isTypeAliasDeclaration(decl)) return "type-aliases";
  if (ts.isFunctionDeclaration(decl)) return "functions";
  if (ts.isVariableDeclaration(decl)) return "variables";
  return undefined;
}

/** Escapes text so MDX does not read braces or angle brackets as JSX. */
function prose(text: string): string {
  return text
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/</g, "&lt;")
    .trim();
}

/** A type or signature shown in an inline code span, with table-safe pipes. */
function code(text: string): string {
  return "`" + text.replace(/\n/g, " ").replace(/`/g, "'") + "`";
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

function isHidden(decl: ts.Declaration): boolean {
  const flags = ts.getCombinedModifierFlags(decl as ts.Declaration);
  return (
    (flags & ts.ModifierFlags.Private) !== 0 ||
    (flags & ts.ModifierFlags.Protected) !== 0
  );
}

function describe(checker: ts.TypeChecker, symbol: ts.Symbol): string {
  return prose(
    ts.displayPartsToString(symbol.getDocumentationComment(checker)),
  );
}

function memberRows(checker: ts.TypeChecker, type: ts.Type): string[] {
  const rows: string[] = [];
  for (const member of checker.getPropertiesOfType(type)) {
    const decl = member.declarations?.[0];
    if (decl && isHidden(decl)) continue;
    const memberType = checker.getTypeOfSymbol(member);
    const isMethod = (member.flags & ts.SymbolFlags.Method) !== 0;
    const optional = (member.flags & ts.SymbolFlags.Optional) !== 0;
    const kind = isMethod ? "Method" : "Property";
    const name = member.name + (optional ? "?" : "");
    rows.push(
      `| ${cell(code(name))} | ${kind} | ${cell(code(checker.typeToString(memberType)))} | ${cell(describe(checker, member))} |`,
    );
  }
  return rows;
}

function renderPage(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  decl: ts.Declaration,
): string {
  const parts: string[] = [];
  const description = describe(checker, symbol);
  if (description) parts.push(description);

  if (ts.isFunctionDeclaration(decl) || ts.isVariableDeclaration(decl)) {
    const type = checker.getTypeOfSymbol(symbol);
    const signatures = type.getCallSignatures();
    if (signatures.length > 0) {
      parts.push("## Signature");
      for (const signature of signatures) {
        parts.push("```ts\n" + checker.signatureToString(signature) + "\n```");
      }
    } else {
      parts.push("## Type");
      parts.push("```ts\n" + checker.typeToString(type) + "\n```");
    }
  } else if (ts.isTypeAliasDeclaration(decl)) {
    parts.push("## Type");
    parts.push(
      "```ts\n" +
        checker.typeToString(checker.getTypeAtLocation(decl)) +
        "\n```",
    );
  } else if (ts.isEnumDeclaration(decl)) {
    const type = checker.getTypeOfSymbol(symbol);
    const rows = checker
      .getPropertiesOfType(type)
      .map(
        (member) =>
          `| ${cell(code(member.name))} | ${cell(describe(checker, member))} |`,
      );
    if (rows.length > 0) {
      parts.push(
        ["## Members", "| Name | Description |", "| --- | --- |", ...rows].join(
          "\n",
        ),
      );
    }
  } else if (ts.isClassDeclaration(decl) || ts.isInterfaceDeclaration(decl)) {
    const type = checker.getDeclaredTypeOfSymbol(symbol);
    const rows = memberRows(checker, type);
    if (rows.length > 0) {
      parts.push(
        [
          "## Members",
          "| Name | Kind | Type | Description |",
          "| --- | --- | --- | --- |",
          ...rows,
        ].join("\n"),
      );
    }
  }

  return parts.filter((part) => part.length > 0).join("\n\n") + "\n";
}

function run(): void {
  console.log(
    "generate-typescript-sdk-reference: reading the TypeScript source...",
  );

  const parsed = ts.getParsedCommandLineOfConfigFile(
    TSCONFIG,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        );
      },
    },
  );
  const program = ts.createProgram([ENTRY], parsed?.options ?? {});
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(ENTRY);
  if (!sourceFile) {
    throw new Error(`generate-typescript-sdk-reference: ${ENTRY} not found`);
  }
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) {
    throw new Error(
      "generate-typescript-sdk-reference: no module symbol for the entry point",
    );
  }

  if (existsSync(DOCS_DIR)) {
    rmSync(DOCS_DIR, { recursive: true, force: true });
  }

  const navByCategory: Record<string, string[]> = {};
  let written = 0;

  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exported)
        : exported;
    const decl = symbol.declarations?.[0];
    if (!decl) continue;
    const category = categoryOf(decl);
    if (!category) continue;

    const name = exported.name;
    const destDir = path.join(DOCS_DIR, category);
    mkdirSync(destDir, { recursive: true });

    const title = `${KIND_LABELS[category]}: ${name}`;
    const body = renderPage(checker, symbol, decl);
    writeFileSync(
      path.join(destDir, `${name}.mdx`),
      `---\ntitle: ${JSON.stringify(title)}\n---\n\n${body}`,
      "utf8",
    );
    (navByCategory[category] ??= []).push(`${NAV_BASE}/${category}/${name}`);
    written++;
  }

  for (const pages of Object.values(navByCategory)) pages.sort();
  updateNav(navByCategory);

  console.log(
    `generate-typescript-sdk-reference: wrote ${written} pages to ${DOCS_DIR}`,
  );
}

/**
 * Replaces the pages of the "API reference" group in the "TypeScript SDK" tab
 * with the freshly computed sub groups. Every other group and tab is untouched.
 */
function updateNav(navByCategory: Record<string, string[]>): void {
  const config = JSON.parse(readFileSync(DOCS_JSON_PATH, "utf8"));

  const tab = (
    config.navigation.tabs as {
      tab: string;
      groups?: { group: string; pages: unknown[] }[];
    }[]
  ).find((candidate) => candidate.tab === "TypeScript SDK");

  const referenceGroup = tab?.groups?.find(
    (group) => group.group === "API reference",
  );

  if (!referenceGroup) {
    throw new Error(
      "generate-typescript-sdk-reference: the 'API reference' group in the 'TypeScript SDK' tab was not found in docs.json",
    );
  }

  referenceGroup.pages = Object.entries(CATEGORY_LABELS)
    .filter(([category]) => (navByCategory[category] ?? []).length > 0)
    .map(([category, label]) => ({
      group: label,
      pages: navByCategory[category],
    }));

  writeFileSync(DOCS_JSON_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

run();
