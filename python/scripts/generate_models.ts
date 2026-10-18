/**
 * Generates Python dataclasses/enums for the Parmana Python SDK from the
 * canonical wire types in packages/shared/src/domain/*.ts (and the
 * SignatureAlgorithm union in packages/shared/src/config/CryptoAlgorithms.ts).
 *
 * This is the single source of truth for SDK model shape. Field names,
 * optionality, and nesting are read directly from the TypeScript AST so the
 * Python models cannot silently drift from @parmana/shared.
 *
 * Usage:
 *   npx tsx python/scripts/generate_models.ts          # write python/parmana/models/*.py
 *   npx tsx python/scripts/generate_models.ts --check  # fail if regeneration would change output
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SHARED_DOMAIN = path.join(REPO_ROOT, "packages/shared/src/domain");
const SHARED_CONFIG = path.join(REPO_ROOT, "packages/shared/src/config");
const OUT_DIR = path.join(REPO_ROOT, "python/parmana/models");

const CHECK_MODE = process.argv.includes("--check");

//
// ---------------------------------------------------------------------------
// AST extraction
// ---------------------------------------------------------------------------
//

interface FieldSpec {
  name: string;
  pyName: string;
  optional: boolean;
  pyType: string;
  refs: string[];
}

interface InterfaceSpec {
  kind: "interface";
  name: string;
  fields: FieldSpec[];
}

interface EnumSpec {
  kind: "enum";
  name: string;
  members: { name: string; value: string }[];
}

type TypeSpec = InterfaceSpec | EnumSpec;

const registry = new Map<string, TypeSpec>();

/** TS identifier -> Python identifier for known non-1:1 renames. */
const NAME_OVERRIDES: Record<string, string> = {
  TransactionMetadata: "BusinessTransactionMetadata",
};

/** TS type aliases that resolve to a plain Python type rather than a class. */
const ALIAS_MAP: Record<string, MappedType> = {
  ExecutionMetadata: plain("dict[str, Any]"),
  JsonValue: plain("Any"),
};

function pyClassName(tsName: string): string {
  return NAME_OVERRIDES[tsName] ?? tsName;
}

function toSnake(name: string): string {
  return name.replace(/(?<!^)(?=[A-Z])/g, "_").toLowerCase();
}

interface MappedType {
  py: string;
  refs: Set<string>;
}

function plain(py: string): MappedType {
  return { py, refs: new Set() };
}

function ref(name: string): MappedType {
  return { py: pyClassName(name), refs: new Set([name]) };
}

function mapType(node: ts.TypeNode): MappedType {
  if (
    ts.isTypeOperatorNode(node) &&
    node.operator === ts.SyntaxKind.ReadonlyKeyword
  ) {
    return mapType(node.type);
  }

  if (ts.isArrayTypeNode(node)) {
    const inner = mapType(node.elementType);
    return { py: `list[${inner.py}]`, refs: inner.refs };
  }

  if (ts.isTypeReferenceNode(node)) {
    const typeName = node.typeName.getText();

    if (typeName === "Readonly" && node.typeArguments?.length) {
      return mapType(node.typeArguments[0]);
    }

    if (typeName === "ReadonlyArray" && node.typeArguments?.length) {
      const inner = mapType(node.typeArguments[0]);
      return { py: `list[${inner.py}]`, refs: inner.refs };
    }

    if (typeName === "Record" && node.typeArguments?.length === 2) {
      return plain("dict[str, Any]");
    }

    if (typeName === "Date") {
      return plain("datetime");
    }

    if (ALIAS_MAP[typeName]) {
      return ALIAS_MAP[typeName];
    }

    return ref(typeName);
  }

  if (ts.isLiteralTypeNode(node)) {
    const literal = node.literal;

    if (ts.isNumericLiteral(literal)) {
      return plain(`Literal[${literal.text}]`);
    }

    if (ts.isStringLiteral(literal)) {
      return plain(`Literal["${literal.text}"]`);
    }
  }

  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword:
      return plain("str");
    case ts.SyntaxKind.BooleanKeyword:
      return plain("bool");
    case ts.SyntaxKind.NumberKeyword:
      return plain("float");
    case ts.SyntaxKind.UnknownKeyword:
      return plain("Any");
  }

  console.warn(
    `generate_models: falling back to Any for unhandled type node: ${node.getText()}`,
  );

  return plain("Any");
}

function isExported(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node)
    ? ts.getModifiers(node)
    : undefined;

  return (
    modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
  );
}

function parseInterface(stmt: ts.InterfaceDeclaration): InterfaceSpec {
  const fields: FieldSpec[] = [];

  for (const member of stmt.members) {
    if (!ts.isPropertySignature(member) || !member.type) {
      continue;
    }

    const name = (member.name as ts.Identifier).text;
    const optional = !!member.questionToken;
    const mapped = mapType(member.type);

    fields.push({
      name,
      pyName: toSnake(name),
      optional,
      pyType: mapped.py,
      refs: [...mapped.refs],
    });
  }

  return { kind: "interface", name: stmt.name.text, fields };
}

function parseEnum(stmt: ts.EnumDeclaration): EnumSpec {
  const members = stmt.members.map((member) => {
    const name = (member.name as ts.Identifier).text;
    const init = member.initializer;
    const value = init && ts.isStringLiteral(init) ? init.text : name;

    return { name, value };
  });

  return { kind: "enum", name: stmt.name.text, members };
}

function parseSignatureAlgorithm(sourceFile: ts.SourceFile): EnumSpec {
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt) || !isExported(stmt)) {
      continue;
    }

    for (const decl of stmt.declarationList.declarations) {
      let initializer = decl.initializer;

      while (initializer && ts.isAsExpression(initializer)) {
        initializer = initializer.expression;
      }

      if (
        ts.isIdentifier(decl.name) &&
        decl.name.text === "SignatureAlgorithms" &&
        initializer &&
        ts.isObjectLiteralExpression(initializer)
      ) {
        const members = initializer.properties
          .filter(ts.isPropertyAssignment)
          .map((prop) => {
            const name = (prop.name as ts.Identifier).text;
            const init = prop.initializer;
            const value = ts.isStringLiteral(init) ? init.text : name;

            return { name, value };
          });

        return { kind: "enum", name: "SignatureAlgorithm", members };
      }
    }
  }

  throw new Error(
    "generate_models: SignatureAlgorithms const not found in CryptoAlgorithms.ts",
  );
}

/**
 * Converts `export type X = "A" | "B" | ...` (a plain string-literal
 * union, no numeric/computed members) into the same EnumSpec shape
 * parseEnum() produces from a real `enum` declaration -- Python has no
 * such distinction, and unlike DecisionOutcome/PolicyOutcome (real TS
 * enums on both sides of a package boundary, deliberately kept
 * separate and explicitly mapped between at the boundary, e.g.
 * DecisionBuilder.toDecisionOutcome()), a plain string-literal union
 * type is structurally compatible wherever it's reused, so no such
 * mapping is needed for a type like this.
 */
function tryParseStringUnionTypeAlias(
  stmt: ts.Statement,
): EnumSpec | undefined {
  if (!ts.isTypeAliasDeclaration(stmt) || !isExported(stmt)) {
    return undefined;
  }

  if (!ts.isUnionTypeNode(stmt.type)) {
    return undefined;
  }

  const members: { name: string; value: string }[] = [];

  for (const member of stmt.type.types) {
    if (!ts.isLiteralTypeNode(member) || !ts.isStringLiteral(member.literal)) {
      return undefined;
    }

    members.push({ name: member.literal.text, value: member.literal.text });
  }

  return { kind: "enum", name: stmt.name.text, members };
}

function loadSourceFile(filePath: string): ts.SourceFile {
  const text = fs.readFileSync(filePath, "utf-8");

  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
}

function registerDomainFile(fileName: string): void {
  const filePath = path.join(SHARED_DOMAIN, fileName);
  const sourceFile = loadSourceFile(filePath);

  for (const stmt of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(stmt) && isExported(stmt)) {
      const spec = parseInterface(stmt);
      registry.set(spec.name, spec);
    } else if (ts.isEnumDeclaration(stmt) && isExported(stmt)) {
      const spec = parseEnum(stmt);
      registry.set(spec.name, spec);
    } else {
      const unionSpec = tryParseStringUnionTypeAlias(stmt);

      if (unionSpec) {
        registry.set(unionSpec.name, unionSpec);
      }
    }
  }
}

const DOMAIN_FILES = [
  "authority.ts",
  "authorization.ts",
  "intent.ts",
  "policy-reference.ts",
  "metadata.ts",
  "business-transaction.ts",
  "signature.ts",
  "signature-entry.ts",
  "execution-evidence.ts",
  "business-validation.ts",
  "decision.ts",
  "execution.ts",
  "override.ts",
  "receipt.ts",
  "verification.ts",
  "evidence-anchor.ts",
  "execution-trust-record.ts",
  "execution-authorization.ts",
  "refusal-record.ts",
  "execution-intent.ts",
  "pending-policy-change.ts",
];

for (const file of DOMAIN_FILES) {
  registerDomainFile(file);
}

const signatureAlgorithmSpec = parseSignatureAlgorithm(
  loadSourceFile(path.join(SHARED_CONFIG, "CryptoAlgorithms.ts")),
);
registry.set("SignatureAlgorithm", signatureAlgorithmSpec);

//
// ---------------------------------------------------------------------------
// Module manifest
//
// Each entry is one generated Python file. Type order within a module must
// respect intra-module dependencies (a type may only reference types defined
// earlier in the same module, or in another module).
// ---------------------------------------------------------------------------
//

interface ModuleSpec {
  file: string;
  types: string[];
  docSource: string;
}

const MODULES: ModuleSpec[] = [
  {
    file: "authority",
    types: ["AuthorityType", "Authority"],
    docSource: "domain/authority.ts",
  },
  {
    file: "authorization",
    types: ["Authorization"],
    docSource: "domain/authorization.ts",
  },
  {
    file: "intent",
    types: ["Intent"],
    docSource: "domain/intent.ts",
  },
  {
    file: "policy",
    types: [
      "PolicyGovernanceAnchorStatus",
      "PolicyGovernanceAnchor",
      "PolicyReference",
    ],
    docSource: "domain/policy-reference.ts",
  },
  {
    file: "business_transaction",
    types: [
      "TransactionMetadata",
      "BusinessTransactionStatus",
      "BusinessTransaction",
    ],
    docSource: "domain/metadata.ts, domain/business-transaction.ts",
  },
  {
    file: "signature",
    types: ["SignatureAlgorithm", "Signature", "SignatureEntry"],
    docSource:
      "config/CryptoAlgorithms.ts, domain/signature.ts, domain/signature-entry.ts",
  },
  {
    file: "execution_evidence",
    types: ["ExecutionEvidence"],
    docSource: "domain/execution-evidence.ts",
  },
  {
    file: "business_validation",
    types: [
      "AuthorityStatus",
      "BusinessValidationStatus",
      "ExecutionAssessmentStatus",
      "TrustedSignalIntegrityProof",
      "TrustedSignal",
      "BusinessValidationFailure",
      "AuthorityGrantLimit",
      "AuthorityGrantReference",
      "AuthorityAssessment",
      "BusinessValidationAssessment",
      "ExecutionAssessment",
      "DecisionAssessment",
    ],
    docSource: "domain/business-validation.ts",
  },
  {
    file: "execution",
    types: [
      "DecisionOutcome",
      "Decision",
      "ExecutionStatus",
      "ExecutionMode",
      "Execution",
    ],
    docSource: "domain/decision.ts, domain/execution.ts",
  },
  {
    file: "override",
    types: ["Override"],
    docSource: "domain/override.ts",
  },
  {
    file: "receipt",
    types: ["Receipt"],
    docSource: "domain/receipt.ts",
  },
  {
    file: "verification",
    types: ["VerificationStatus", "Verification"],
    docSource: "domain/verification.ts",
  },
  {
    file: "trust_record",
    types: ["EvidenceAnchor", "ExecutionTrustRecord"],
    docSource: "domain/evidence-anchor.ts, domain/execution-trust-record.ts",
  },
  {
    file: "execution_authorization",
    types: [
      "AuthorizationBusinessCondition",
      "AuthorizationGrantBound",
      "ExecutionAuthorizationPayload",
      "SignedExecutionAuthorization",
    ],
    docSource: "domain/execution-authorization.ts",
  },
  {
    file: "refusal_record",
    types: [
      "RefusalIntentSnapshot",
      "RefusalBindingViolation",
      "RefusalRecord",
    ],
    docSource: "domain/refusal-record.ts",
  },
  {
    file: "execution_intent",
    types: [
      "ExecutionIntentState",
      "ExecutionIntentResolution",
      "ExecutionIntentFinalizationMode",
      "ExecutionIntent",
      "ExecutionIntentStatus",
    ],
    docSource: "domain/execution-intent.ts",
  },
  {
    file: "policy_change",
    types: ["PendingPolicyChangeStatus", "PendingPolicyChange"],
    docSource: "domain/pending-policy-change.ts",
  },
];

const typeToModule = new Map<string, string>();
for (const mod of MODULES) {
  for (const typeName of mod.types) {
    typeToModule.set(typeName, mod.file);
  }
}

//
// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------
//

function applyRenames(pyType: string): string {
  return pyType.replace(
    /\bTransactionMetadata\b/g,
    "BusinessTransactionMetadata",
  );
}

function emitEnum(spec: EnumSpec): string {
  const lines = [`class ${spec.name}(str, Enum):`];

  for (const member of spec.members) {
    lines.push(`    ${member.name} = "${member.value}"`);
  }

  return lines.join("\n");
}

function emitInterface(spec: InterfaceSpec): string {
  const required = spec.fields.filter((f) => !f.optional);
  const optional = spec.fields.filter((f) => f.optional);

  const lines = ["@dataclass(frozen=True)", `class ${pyClassName(spec.name)}:`];

  const bodyLines: string[] = [];

  for (const field of required) {
    bodyLines.push(`    ${field.pyName}: ${applyRenames(field.pyType)}`);
  }

  for (const field of optional) {
    bodyLines.push(
      `    ${field.pyName}: ${applyRenames(field.pyType)} | None = None`,
    );
  }

  if (bodyLines.length === 0) {
    bodyLines.push("    pass");
  }

  return `${lines.join("\n")}\n${bodyLines.join("\n\n")}`;
}

function buildModule(mod: ModuleSpec): string {
  const specs = mod.types.map((name) => {
    const spec = registry.get(name);

    if (!spec) {
      throw new Error(`generate_models: unknown type '${name}' in manifest`);
    }

    return spec;
  });

  let needsDataclass = false;
  let needsEnum = false;
  let needsDatetime = false;
  let needsAny = false;
  let needsLiteral = false;

  const crossImports = new Map<string, Set<string>>();

  function scanTypeString(pyType: string): void {
    if (/\bdatetime\b/.test(pyType)) needsDatetime = true;
    if (/\bAny\b/.test(pyType)) needsAny = true;
    if (/Literal\[/.test(pyType)) needsLiteral = true;
  }

  for (const spec of specs) {
    if (spec.kind === "enum") {
      needsEnum = true;
      continue;
    }

    needsDataclass = true;

    for (const field of spec.fields) {
      const finalType = applyRenames(field.pyType);
      scanTypeString(finalType);

      for (const referenced of field.refs) {
        if (mod.types.includes(referenced)) {
          continue;
        }

        const homeModule = typeToModule.get(referenced);

        if (!homeModule) {
          continue;
        }

        if (!crossImports.has(homeModule)) {
          crossImports.set(homeModule, new Set());
        }

        crossImports.get(homeModule)!.add(pyClassName(referenced));
      }
    }
  }

  const header: string[] = [
    '"""',
    "GENERATED FILE -- DO NOT EDIT BY HAND.",
    "",
    `Generated from packages/shared/src/${mod.docSource} by`,
    'python/scripts/generate_models.ts. Run "npm run',
    'generate:python-models" to regenerate.',
    '"""',
    "",
    "from __future__ import annotations",
    "",
  ];

  if (needsDataclass) header.push("from dataclasses import dataclass");
  if (needsDatetime) header.push("from datetime import datetime");
  if (needsEnum) header.push("from enum import Enum");

  const typingImports = [
    needsAny ? "Any" : null,
    needsLiteral ? "Literal" : null,
  ].filter((x): x is string => x !== null);

  if (typingImports.length) {
    header.push(`from typing import ${typingImports.join(", ")}`);
  }

  if (crossImports.size) {
    header.push("");

    for (const [homeModule, names] of [...crossImports.entries()].sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      header.push(`from .${homeModule} import ${[...names].sort().join(", ")}`);
    }
  }

  const body = specs
    .map((spec) =>
      spec.kind === "enum" ? emitEnum(spec) : emitInterface(spec),
    )
    .join("\n\n\n");

  return `${header.join("\n")}\n\n\n${body}\n`;
}

//
// ---------------------------------------------------------------------------
// __init__.py
// ---------------------------------------------------------------------------
//

function formatImportLine(moduleFile: string, names: string[]): string {
  const singleLine = `from .${moduleFile} import ${names.join(", ")}`;

  if (singleLine.length <= 88) {
    return singleLine;
  }

  const body = names.map((n) => `    ${n},`).join("\n");

  return `from .${moduleFile} import (\n${body}\n)`;
}

function buildInitFile(): string {
  const lines = [
    '"""',
    "GENERATED FILE -- DO NOT EDIT BY HAND.",
    "",
    "Generated by python/scripts/generate_models.ts. Run",
    '"npm run generate:python-models" to regenerate.',
    "",
    "ReplayResult is the one hand-maintained exception: it is the inline",
    "return type of ExecutionTrustApplication.replay() and is not exported",
    "from @parmana/shared, so it cannot be generated from source.",
    '"""',
    "",
  ];

  const allNames: string[] = [];

  for (const mod of MODULES) {
    const names = mod.types.map(pyClassName);
    lines.push(formatImportLine(mod.file, names));
    allNames.push(...names);
  }

  lines.push("from .replay_result import ReplayResult");
  allNames.push("ReplayResult");

  lines.push("");
  lines.push("__all__ = [");

  for (const name of [...allNames].sort()) {
    lines.push(`    "${name}",`);
  }

  lines.push("]");
  lines.push("");

  return lines.join("\n");
}

//
// ---------------------------------------------------------------------------
// Write / check
// ---------------------------------------------------------------------------
//

const outputs = new Map<string, string>();

for (const mod of MODULES) {
  outputs.set(`${mod.file}.py`, buildModule(mod));
}

outputs.set("__init__.py", buildInitFile());

if (CHECK_MODE) {
  let drift = false;

  for (const [fileName, content] of outputs) {
    const filePath = path.join(OUT_DIR, fileName);
    const existing = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, "utf-8")
      : null;

    if (existing !== content) {
      drift = true;
      console.error(
        `generate_models --check: DRIFT DETECTED in python/parmana/models/${fileName}`,
      );
    }
  }

  if (drift) {
    console.error(
      "\nGenerated Python models are out of date. Run `npm run generate:python-models` and commit the result.",
    );
    process.exit(1);
  }

  console.log(
    "generate_models --check: python/parmana/models/*.py are up to date.",
  );
} else {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const [fileName, content] of outputs) {
    fs.writeFileSync(path.join(OUT_DIR, fileName), content, "utf-8");
  }

  console.log(
    `generate_models: wrote ${outputs.size} files to python/parmana/models/`,
  );
}
