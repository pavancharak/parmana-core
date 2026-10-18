import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import {
  CURL_SAMPLES_DIR,
  PYTHON_SAMPLES_DIR,
  TYPESCRIPT_SAMPLES_DIR,
  pythonSampleName,
  samplePaths,
} from "../../scripts/openapi/codeSamples.js";

/**
 * Every operation in the API reference shows a sample in cURL, TypeScript
 * and Python (scripts/add-openapi-code-samples.ts). These tests keep the
 * samples true: each exists, the bundle holds exactly the file's text, no
 * sample is left for an operation that no longer exists, every cURL
 * sample calls its own method and path, is valid shell, and sends a body
 * the operation's request schema accepts, and every TypeScript sample
 * typechecks against the SDK. The Python samples are checked by mypy
 * --strict in python/tests/test_api_reference_samples.py.
 */

type Operation = {
  operationId?: string;
  requestBody?: { content?: Record<string, { schema?: unknown }> };
  "x-codeSamples"?: { lang: string; label: string; source: string }[];
};

const METHODS = ["get", "put", "post", "delete", "patch"] as const;

const root = process.cwd();

// A path bash can open on every platform: relative to the repo root,
// with forward slashes. WSL's bash on Windows strips the backslashes
// from an absolute Windows path (D:\x\y becomes D:xy) and fails.
const bashPath = (file: string) =>
  path.relative(root, file).split(path.sep).join("/");
const bundle = parse(
  readFileSync(path.join(root, "openapi", "openapi.bundled.yaml"), "utf8"),
) as {
  paths: Record<string, Partial<Record<(typeof METHODS)[number], Operation>>>;
  components: unknown;
};

const operations = Object.entries(bundle.paths).flatMap(([route, item]) =>
  METHODS.flatMap((method) => {
    const operation = item[method];

    return operation === undefined ? [] : [{ route, method, operation }];
  }),
);

/**
 * The method, the path (without host or query) and the literal JSON body
 * of a cURL sample. `body` is undefined when the sample sends a file or a
 * value made at run time (`--data @file`, `$(...)`).
 */
function readCurl(source: string): {
  method: string;
  path: string;
  body: unknown;
} {
  const command = source
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n");

  const url = /curl (?:-X (\w+) )?"?https:\/\/[^/\s"]+([^\s"?]*)/.exec(command);

  if (url === null) throw new Error(`No curl URL in:\n${source}`);

  const literal = /-d '([\s\S]*?)'/.exec(command);

  return {
    method: (url[1] ?? "GET").toLowerCase(),
    path: url[2] ?? "",
    body: literal?.[1] === undefined ? undefined : JSON.parse(literal[1]),
  };
}

function routePattern(route: string): RegExp {
  return new RegExp(
    `^${route
      .split(/\{[^}]+\}/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^/]+")}$`,
  );
}

describe("API reference code samples", () => {
  it("covers every operation with cURL, TypeScript and Python, as in the files", () => {
    expect(operations.length).toBeGreaterThan(0);

    for (const { operation } of operations) {
      const id = operation.operationId ?? "(no operationId)";
      const files = samplePaths(id);
      const samples = operation["x-codeSamples"] ?? [];

      expect(
        samples.map((sample) => sample.lang),
        id,
      ).toEqual(["bash", "typescript", "python"]);
      expect(samples[0]?.source, id).toBe(
        readFileSync(files.curl, "utf8").trimEnd(),
      );
      expect(samples[1]?.source, id).toBe(
        readFileSync(files.typescript, "utf8").trimEnd(),
      );
      expect(samples[2]?.source, id).toBe(
        readFileSync(files.python, "utf8").trimEnd(),
      );
    }
  });

  it("has no sample for an operation that does not exist", () => {
    const ids = operations.map(({ operation }) => operation.operationId ?? "");
    const named = (directory: string, extension: string) =>
      readdirSync(directory)
        .filter((file) => file.endsWith(extension))
        .sort();

    expect(named(CURL_SAMPLES_DIR, ".sh")).toEqual(
      ids.map((id) => `${id}.sh`).sort(),
    );
    expect(named(TYPESCRIPT_SAMPLES_DIR, ".ts")).toEqual(
      ids.map((id) => `${id}.ts`).sort(),
    );
    expect(named(PYTHON_SAMPLES_DIR, ".py")).toEqual(
      ids.map((id) => pythonSampleName(id)).sort(),
    );
  });

  it("calls each operation's own method and path from cURL, with a body its schema accepts", () => {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    ajv.addSchema({ $id: "openapi", components: bundle.components });

    for (const { route, method, operation } of operations) {
      const id = operation.operationId ?? "";
      const curl = readCurl(readFileSync(samplePaths(id).curl, "utf8"));

      expect(curl.method, id).toBe(method);
      expect(curl.path, id).toMatch(routePattern(route));

      const schema =
        operation.requestBody?.content?.["application/json"]?.schema;

      if (curl.body === undefined || schema === undefined) continue;

      const validate = ajv.compile(
        JSON.parse(
          JSON.stringify(schema).replace(
            /"#\/components\//g,
            '"openapi#/components/',
          ),
        ) as object,
      );

      expect(validate(curl.body) ? [] : validate.errors, id).toEqual([]);
    }
  });

  it("writes every cURL sample as valid shell", () => {
    // One bash process checks every sample: starting bash once per sample
    // is slow on Windows (WSL or Git Bash) and timed the test out there.
    // bash -n names the file and line of any syntax error. The loop is
    // read from stdin and the sample paths arrive as its arguments, so no
    // path is ever part of the command text.
    execFileSync(
      "bash",
      [
        "-s",
        "--",
        ...operations.map(({ operation }) =>
          bashPath(samplePaths(operation.operationId ?? "").curl),
        ),
      ],
      {
        cwd: root,
        input: 'for sample in "$@"; do bash -n "$sample" || exit 1; done\n',
        stdio: "pipe",
      },
    );
  });

  it("typechecks every TypeScript sample against the SDK", () => {
    // Throws, with the compiler's errors, when any sample does not typecheck.
    execFileSync(
      process.execPath,
      [
        path.join(root, "node_modules", "typescript", "bin", "tsc"),
        "-p",
        path.join(TYPESCRIPT_SAMPLES_DIR, "tsconfig.json"),
      ],
      { stdio: "pipe" },
    );
  }, 120_000);
});
