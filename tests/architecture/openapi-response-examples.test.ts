import { readFileSync } from "node:fs";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * Every JSON response in the API reference shows an example, and every
 * example is one the response's own schema accepts. The examples are real
 * responses captured from the server; this keeps them true to the schema
 * as either changes.
 */

type Media = {
  schema?: unknown;
  example?: unknown;
  examples?: Record<string, { value?: unknown }>;
};
type Response = { $ref?: string; content?: Record<string, Media> };
type Operation = { operationId?: string; responses?: Record<string, Response> };

const METHODS = ["get", "put", "post", "delete", "patch"] as const;

/**
 * Responses with no JSON example on purpose: the OpenAPI document itself
 * (an example would repeat the whole reference), a PDF and a redirect.
 */
const NO_EXAMPLE = new Set([
  "getOpenApiSpec 200",
  "getOpenApiSpecJson 200",
  "getHandbookPdf 200",
  "getHandbookDownloadLead 302",
]);

const root = process.cwd();
const bundle = parse(
  readFileSync(path.join(root, "openapi", "openapi.bundled.yaml"), "utf8"),
) as {
  paths: Record<string, Partial<Record<(typeof METHODS)[number], Operation>>>;
  components: { responses?: Record<string, Response> };
};

function resolve(response: Response): Response {
  if (response.$ref === undefined) return response;

  const name = response.$ref.split("/").pop() ?? "";

  return bundle.components.responses?.[name] ?? response;
}

const responses = Object.values(bundle.paths).flatMap((item) =>
  METHODS.flatMap((method) => {
    const operation = item[method];

    if (operation === undefined) return [];

    return Object.entries(operation.responses ?? {}).map(
      ([status, response]) => ({
        id: `${operation.operationId ?? ""} ${status}`,
        response: resolve(response),
      }),
    );
  }),
);

function examplesOf(media: Media): unknown[] {
  return [
    ...(media.example === undefined ? [] : [media.example]),
    ...Object.values(media.examples ?? {}).map((example) => example.value),
  ];
}

describe("API reference response examples", () => {
  it("shows an example for every response, apart from the listed exceptions", () => {
    const missing = responses
      .filter(({ id, response }) => {
        const media = Object.values(response.content ?? {});

        return (
          !NO_EXAMPLE.has(id) &&
          !media.some((entry) => examplesOf(entry).length > 0)
        );
      })
      .map(({ id }) => id);

    expect(missing).toEqual([]);
  });

  it("keeps the exception list to responses that exist and still have no example", () => {
    const ids = new Set(responses.map(({ id }) => id));

    for (const id of NO_EXAMPLE) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("shows only examples the response's schema accepts", () => {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    ajv.addSchema({ $id: "openapi", components: bundle.components });

    let checked = 0;
    const failures: unknown[] = [];

    for (const { id, response } of responses) {
      const media = response.content?.["application/json"];

      if (media?.schema === undefined) continue;

      const validate = ajv.compile(
        JSON.parse(
          JSON.stringify(media.schema).replace(
            /"#\/components\//g,
            '"openapi#/components/',
          ),
        ) as object,
      );

      for (const example of examplesOf(media)) {
        if (!validate(example)) failures.push({ id, errors: validate.errors });
        checked += 1;
      }
    }

    expect(failures).toEqual([]);
    expect(checked).toBeGreaterThan(100);
  });
});
