import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { load } from "js-yaml";
import $RefParser from "@apidevtools/json-schema-ref-parser";

//
// GET /openapi.yaml serves this API's own bundled OpenAPI 3.1
// specification, unauthenticated (a caller cannot discover how to get
// an API key from a spec it isn't allowed to read). This tutorial
// proves two things: the route serves a valid, well-formed document,
// and the bundled spec's $refs are genuinely resolvable -- a real
// historical bug here left composite schemas (e.g. an Execution Trust
// Record's nested executions/receipts) as raw, unexpanded $ref
// pointers under strict resolvers, breaking tools like Swagger UI even
// though this codebase's own lint step didn't catch it.
//
process.env.NODE_ENV = "test";

const { createExecutionSystem } =
  await import("../../../packages/api/src/bootstrap/createExecutionSystem.js");
const { createApplication } =
  await import("../../../packages/api/src/application.js");
const { createApp } = await import("../../../packages/api/src/app.js");

console.log();
console.log("==================================================");
console.log("Tutorial 90 - OpenAPI Self-Description");
console.log("==================================================");
console.log();

const executionSystem = await createExecutionSystem();
const application = createApplication(executionSystem);
const app = createApp(application, { callerAuth: "disabled" });

const server = app.listen(0);
const address = server.address();
const baseUrl = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;

try {
  console.log(
    "Scenario 1: GET /openapi.yaml, unauthenticated, serves a valid OpenAPI 3.1 document",
  );
  console.log("--------------------------------------------------");
  const response = await fetch(`${baseUrl}/openapi.yaml`);
  const text = await response.text();
  const spec = load(text) as {
    openapi?: string;
    paths?: Record<string, unknown>;
  };

  console.log(`Status         : ${response.status}`);
  console.log(`openapi field  : ${spec.openapi}`);
  console.log(`Route count    : ${Object.keys(spec.paths ?? {}).length}`);
  console.log();

  const scenario1Passed =
    response.status === 200 &&
    /^3\.1/.test(spec.openapi ?? "") &&
    Object.keys(spec.paths ?? {}).length > 0;

  console.log(
    "Scenario 2: The bundled spec's $refs fully resolve -- no composite schema is left as a raw pointer",
  );
  console.log("--------------------------------------------------");

  const __filename = fileURLToPath(import.meta.url);
  const specPath = path.resolve(
    path.dirname(__filename),
    "../../../openapi/openapi.bundled.yaml",
  );
  readFileSync(specPath, "utf8"); // confirms the file exists and is readable before handing it to the ref parser

  const dereferenced = (await $RefParser.dereference(specPath)) as {
    components: {
      schemas: Record<
        string,
        {
          $id?: unknown;
          $schema?: unknown;
          properties?: Record<
            string,
            { type?: string; items?: { type?: string } }
          >;
        }
      >;
    };
  };

  const noUnresolvedRefs = !JSON.stringify(dereferenced).includes('"$ref"');
  console.log(
    `No unresolved $ref remaining after dereference : ${noUnresolvedRefs}`,
  );

  const trustRecordSchema =
    dereferenced.components.schemas["execution-trust-record.schema"];
  const compositeFields = [
    "transaction",
    "overrides",
    "executions",
    "verifications",
    "receipts",
  ] as const;
  for (const field of compositeFields) {
    const property = trustRecordSchema?.properties?.[field];
    const type =
      field === "transaction" ? property?.type : property?.items?.type;
    console.log(
      `  ${field.padEnd(14)} -> resolved to type "${type}" (not left as an unexpanded $ref)`,
    );
  }

  const compositesFullyExpand = compositeFields.every((field) => {
    const property = trustRecordSchema?.properties?.[field];
    const type =
      field === "transaction" ? property?.type : property?.items?.type;
    return type === "object";
  });

  // The historical bug's root cause: a bundled component schema still
  // carrying its source file's own $id/$schema, which rebases $ref
  // resolution under strict (OAS 3.1 / JSON Schema 2020-12) resolvers.
  const noStrayIds = Object.values(dereferenced.components.schemas).every(
    (schema) => !("$id" in schema) && !("$schema" in schema),
  );
  console.log(`No bundled schema carries a stray $id/$schema  : ${noStrayIds}`);
  console.log();

  const allPassed =
    scenario1Passed && noUnresolvedRefs && compositesFullyExpand && noStrayIds;

  if (allPassed) {
    console.log(
      "✓ The API's own OpenAPI document is valid, unauthenticated, and its bundled $refs fully resolve -- no schema is left broken for strict-resolver tools like Swagger UI.",
    );
  } else {
    console.log(
      "✗ Expected a valid OpenAPI 3.1 document with every $ref fully resolved and no stray $id/$schema fields.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 91 - Graceful Shutdown");
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
