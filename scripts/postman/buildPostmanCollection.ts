import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

/**
 * Builds a Postman collection (v2.1) with one request for every operation in
 * openapi/openapi.bundled.yaml, so the collection cannot drift from the API
 * description. Deterministic: no generated ids or timestamps, and ordering
 * follows the OpenAPI tags and paths.
 *
 * - One folder per OpenAPI tag, in the order the tags are declared.
 * - Bearer auth `{{apiKey}}` on the collection; operations with
 *   `security: []` (health, keys, the public verify routes) use no auth.
 * - `{{baseUrl}}` defaults to the first OpenAPI server. `apiKey` is empty on
 *   purpose: the key is set in a Postman environment, never committed.
 * - A request body comes from each named OpenAPI example (one request per
 *   example), or, when the operation has only a schema, from a placeholder
 *   built from that schema.
 *
 * The CLI (scripts/generate-postman-collection.ts) writes the file. The test
 * in tests/architecture/postman-collection-up-to-date.test.ts fails when the
 * committed collection differs from this output.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export const POSTMAN_COLLECTION_PATH = join(
  repoRoot,
  "postman",
  "parmana.postman_collection.json",
);

const POSTMAN_SCHEMA =
  "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface OpenApiSchema {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  enum?: JsonValue[];
  const?: JsonValue;
  example?: JsonValue;
  examples?: JsonValue[];
  default?: JsonValue;
  format?: string;
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  allOf?: OpenApiSchema[];
}

interface OpenApiParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  example?: JsonValue;
  schema?: OpenApiSchema;
}

interface OpenApiExample {
  summary?: string;
  value?: JsonValue;
}

interface OpenApiMediaType {
  schema?: OpenApiSchema;
  example?: JsonValue;
  examples?: Record<string, OpenApiExample>;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  security?: unknown[];
  requestBody?: { content?: Record<string, OpenApiMediaType> };
}

interface OpenApiDocument {
  info: { title: string; version: string; description?: string };
  components?: { schemas?: Record<string, OpenApiSchema> };
  servers?: Array<{ url: string }>;
  tags?: Array<{ name: string; description?: string }>;
  security?: unknown[];
  paths: Record<
    string,
    Partial<Record<(typeof HTTP_METHODS)[number], OpenApiOperation>> & {
      parameters?: OpenApiParameter[];
    }
  >;
}

interface PostmanRequestItem {
  name: string;
  request: Record<string, unknown>;
}

interface PostmanFolder {
  name: string;
  description?: string;
  item: PostmanRequestItem[];
}

export function loadOpenApiDocument(): OpenApiDocument {
  return parse(
    readFileSync(join(repoRoot, "openapi", "openapi.bundled.yaml"), "utf8"),
  ) as OpenApiDocument;
}

/**
 * A placeholder value for a schema, used only when an operation has no named
 * example. Prefers the schema's own example, const, default or first enum
 * value; otherwise a type shaped placeholder such as "<string>".
 */
function placeholderFor(
  schema: OpenApiSchema | undefined,
  schemas: Record<string, OpenApiSchema>,
  depth = 0,
): JsonValue {
  if (schema === undefined || depth > 6) {
    return null;
  }

  if (schema.$ref !== undefined) {
    const name = schema.$ref.replace("#/components/schemas/", "");
    return placeholderFor(schemas[name], schemas, depth + 1);
  }

  if (schema.example !== undefined) return schema.example;
  if (schema.examples !== undefined && schema.examples.length > 0) {
    return schema.examples[0] as JsonValue;
  }
  if (schema.const !== undefined) return schema.const;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum !== undefined && schema.enum.length > 0) {
    return schema.enum[0] as JsonValue;
  }

  const variant = schema.oneOf?.[0] ?? schema.anyOf?.[0];
  if (variant !== undefined) return placeholderFor(variant, schemas, depth + 1);

  if (schema.allOf !== undefined) {
    const merged: Record<string, JsonValue> = {};
    for (const part of schema.allOf) {
      const value = placeholderFor(part, schemas, depth + 1);
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        Object.assign(merged, value);
      }
    }
    return merged;
  }

  const type = Array.isArray(schema.type)
    ? schema.type.find((t) => t !== "null")
    : schema.type;

  if (type === "object" || schema.properties !== undefined) {
    const properties = schema.properties ?? {};
    const keys =
      schema.required !== undefined && schema.required.length > 0
        ? schema.required
        : Object.keys(properties);
    const result: Record<string, JsonValue> = {};
    for (const key of keys) {
      result[key] = placeholderFor(properties[key], schemas, depth + 1);
    }
    return result;
  }

  if (type === "array")
    return [placeholderFor(schema.items, schemas, depth + 1)];
  if (type === "integer" || type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "string") {
    return schema.format !== undefined ? `<${schema.format}>` : "<string>";
  }

  return null;
}

function parameterValue(parameter: OpenApiParameter): string {
  const value =
    parameter.example ??
    parameter.schema?.example ??
    parameter.schema?.default ??
    (parameter.required === true && parameter.in === "query"
      ? `<${parameter.name}>`
      : "");
  return typeof value === "string" ? value : JSON.stringify(value);
}

function buildUrl(path: string, parameters: OpenApiParameter[]) {
  const segments = path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replace(/^\{(.+)\}$/, ":$1"));

  const pathParameters = parameters.filter((p) => p.in === "path");
  const queryParameters = parameters.filter((p) => p.in === "query");

  const query = queryParameters.map((p) => ({
    key: p.name,
    value: parameterValue(p),
    ...(p.description !== undefined && { description: p.description.trim() }),
    ...(p.required !== true && { disabled: true }),
  }));

  const enabledQuery = query.filter((q) => q.disabled !== true);
  const queryString =
    enabledQuery.length > 0
      ? "?" + enabledQuery.map((q) => `${q.key}=${q.value}`).join("&")
      : "";

  return {
    raw: `{{baseUrl}}/${segments.join("/")}${queryString}`,
    host: ["{{baseUrl}}"],
    path: segments,
    ...(query.length > 0 && { query }),
    ...(pathParameters.length > 0 && {
      variable: pathParameters.map((p) => ({
        key: p.name,
        value: parameterValue(p),
        ...(p.description !== undefined && {
          description: p.description.trim(),
        }),
      })),
    }),
  };
}

function bodyVariants(
  operation: OpenApiOperation,
  schemas: Record<string, OpenApiSchema>,
): Array<{ label?: string; description?: string; body: JsonValue }> {
  const json = operation.requestBody?.content?.["application/json"];
  if (json === undefined) return [];

  if (json.examples !== undefined && Object.keys(json.examples).length > 0) {
    return Object.entries(json.examples).map(([label, example]) => ({
      label,
      ...(example.summary !== undefined && {
        description: example.summary.trim(),
      }),
      body: example.value ?? null,
    }));
  }

  if (json.example !== undefined) return [{ body: json.example }];

  return [{ body: placeholderFor(json.schema, schemas) }];
}

function requestFor(
  path: string,
  method: string,
  operation: OpenApiOperation,
  parameters: OpenApiParameter[],
  body: JsonValue | undefined,
  noAuth: boolean,
  description: string | undefined,
): Record<string, unknown> {
  return {
    method: method.toUpperCase(),
    ...(noAuth && { auth: { type: "noauth" } }),
    header:
      body !== undefined
        ? [{ key: "Content-Type", value: "application/json" }]
        : [],
    ...(body !== undefined && {
      body: {
        mode: "raw",
        raw: JSON.stringify(body, null, 2),
        options: { raw: { language: "json" } },
      },
    }),
    url: buildUrl(path, parameters),
    ...(description !== undefined && { description }),
  };
}

export function buildPostmanCollection(
  document: OpenApiDocument = loadOpenApiDocument(),
): Record<string, unknown> {
  const folderOrder = (document.tags ?? []).map((tag) => tag.name);
  const folders = new Map<string, PostmanFolder>();

  for (const tag of document.tags ?? []) {
    folders.set(tag.name, {
      name: tag.name,
      ...(tag.description !== undefined && {
        description: tag.description.trim(),
      }),
      item: [],
    });
  }

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation === undefined) continue;

      const tag = operation.tags?.[0] ?? "Other";
      if (!folders.has(tag)) {
        folders.set(tag, { name: tag, item: [] });
        folderOrder.push(tag);
      }

      const parameters = [
        ...(pathItem.parameters ?? []),
        ...(operation.parameters ?? []),
      ];
      const noAuth =
        operation.security !== undefined && operation.security.length === 0;
      const name =
        operation.summary?.trim() ??
        operation.operationId ??
        `${method.toUpperCase()} ${path}`;
      const baseDescription = [
        operation.operationId !== undefined
          ? `operationId: ${operation.operationId}`
          : undefined,
        operation.description?.trim(),
      ]
        .filter((part) => part !== undefined)
        .join("\n\n");

      const variants = bodyVariants(
        operation,
        document.components?.schemas ?? {},
      );
      const folder = folders.get(tag)!;

      if (variants.length === 0) {
        folder.item.push({
          name,
          request: requestFor(
            path,
            method,
            operation,
            parameters,
            undefined,
            noAuth,
            baseDescription || undefined,
          ),
        });
        continue;
      }

      for (const variant of variants) {
        const description = [variant.description, baseDescription]
          .filter((part) => part !== undefined && part.length > 0)
          .join("\n\n");
        folder.item.push({
          name:
            variant.label !== undefined && variants.length > 1
              ? `${name} (${variant.label})`
              : name,
          request: requestFor(
            path,
            method,
            operation,
            parameters,
            variant.body,
            noAuth,
            description || undefined,
          ),
        });
      }
    }
  }

  return {
    info: {
      name: document.info.title,
      description:
        `Generated from openapi/openapi.yaml (API version ${document.info.version}) ` +
        "by `npm run generate:postman`. Do not edit by hand.\n\n" +
        "Set `apiKey` in a Postman environment (never commit a key) and, if " +
        "needed, change `baseUrl`. Requests that need no key use no auth.",
      schema: POSTMAN_SCHEMA,
    },
    auth: {
      type: "bearer",
      bearer: [{ key: "token", value: "{{apiKey}}", type: "string" }],
    },
    variable: [
      {
        key: "baseUrl",
        value: document.servers?.[0]?.url ?? "http://localhost:3000",
        type: "string",
      },
      { key: "apiKey", value: "", type: "string" },
    ],
    item: folderOrder
      .map((name) => folders.get(name)!)
      .filter((folder) => folder.item.length > 0),
  };
}

export function serializePostmanCollection(
  collection: Record<string, unknown> = buildPostmanCollection(),
): string {
  return JSON.stringify(collection, null, 2) + "\n";
}
