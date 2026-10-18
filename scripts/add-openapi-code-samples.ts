import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";

import { samplePaths } from "./openapi/codeSamples.js";

/**
 * Adds code samples in cURL, TypeScript and Python to every operation of
 * the bundled OpenAPI file, as `x-codeSamples`, which the docs site shows
 * on every endpoint page. cURL samples: openapi/code-samples/curl/.
 *
 * The samples are real files, one per operation, so they are checked
 * like code: typescript/examples/api-reference/<operationId>.ts is
 * typechecked against the SDK (tests/architecture/
 * openapi-code-samples.test.ts), and python/examples/api_reference/
 * <operation_id>.py is checked by ruff, black and mypy --strict in the
 * Python SDK workflow (python/tests/test_api_reference_samples.py).
 * An operation without both files fails the build.
 *
 * Run by `npm run openapi`, after the bundle is written.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = path.join(root, "openapi", "openapi.bundled.yaml");

const METHODS = ["get", "put", "post", "delete", "patch"] as const;

type Operation = { operationId?: string; "x-codeSamples"?: unknown };

const bundle = parse(readFileSync(bundlePath, "utf8")) as {
  paths: Record<string, Partial<Record<(typeof METHODS)[number], Operation>>>;
};

const missing: string[] = [];
let added = 0;

for (const [route, item] of Object.entries(bundle.paths)) {
  for (const method of METHODS) {
    const operation = item[method];

    if (operation === undefined) continue;

    const { operationId } = operation;

    if (operationId === undefined) {
      missing.push(`${method.toUpperCase()} ${route} has no operationId`);
      continue;
    }

    const files = samplePaths(operationId);
    const absent = [files.curl, files.typescript, files.python].filter(
      (file) => !existsSync(file),
    );

    if (absent.length > 0) {
      missing.push(
        ...absent.map((file) => `${operationId}: ${path.relative(root, file)}`),
      );
      continue;
    }

    operation["x-codeSamples"] = [
      {
        lang: "bash",
        label: "cURL",
        source: readFileSync(files.curl, "utf8").trimEnd(),
      },
      {
        lang: "typescript",
        label: "TypeScript",
        source: readFileSync(files.typescript, "utf8").trimEnd(),
      },
      {
        lang: "python",
        label: "Python",
        source: readFileSync(files.python, "utf8").trimEnd(),
      },
    ];
    added += 1;
  }
}

if (missing.length > 0) {
  throw new Error(`Code samples missing:\n  ${missing.join("\n  ")}`);
}

writeFileSync(bundlePath, stringify(bundle), "utf8");
console.log(
  `add-openapi-code-samples: ${added} operations have cURL, TypeScript and Python samples.`,
);
