import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildPostmanCollection,
  loadOpenApiDocument,
  POSTMAN_COLLECTION_PATH,
  serializePostmanCollection,
} from "../../scripts/postman/buildPostmanCollection.js";

/**
 * postman/parmana.postman_collection.json is generated from
 * openapi/openapi.bundled.yaml. It must match a fresh generation, so the
 * collection always has one request for every API operation and never a
 * stale one.
 *
 * When this fails, run `npm run generate:postman` and commit the result.
 */

interface PostmanRequest {
  method: string;
  auth?: { type: string };
  url: { raw: string };
  description?: string;
}

interface PostmanFolder {
  name: string;
  item: Array<{ name: string; request: PostmanRequest }>;
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

describe("Postman collection is up to date", () => {
  const collection = buildPostmanCollection() as {
    auth: { type: string; bearer: Array<{ value: string }> };
    variable: Array<{ key: string; value: string }>;
    item: PostmanFolder[];
  };
  const requests = collection.item.flatMap((folder) => folder.item);
  const document = loadOpenApiDocument();

  it("the committed collection matches a fresh generation", () => {
    const committed = normalize(readFileSync(POSTMAN_COLLECTION_PATH, "utf8"));

    expect(committed).toBe(normalize(serializePostmanCollection()));
  });

  it("has a request for every OpenAPI operation", () => {
    const operationIds = Object.values(document.paths).flatMap((pathItem) =>
      HTTP_METHODS.map(
        (method) =>
          (pathItem as Record<string, { operationId?: string }>)[method]
            ?.operationId,
      ).filter((id): id is string => id !== undefined),
    );

    expect(operationIds.length).toBeGreaterThan(0);
    for (const operationId of operationIds) {
      expect(
        requests.some((request) =>
          request.request.description?.includes(`operationId: ${operationId}`),
        ),
        `no request for ${operationId}`,
      ).toBe(true);
    }
  });

  it("uses a bearer {{apiKey}} variable and commits no key value", () => {
    expect(collection.auth.type).toBe("bearer");
    expect(collection.auth.bearer[0]?.value).toBe("{{apiKey}}");
    expect(collection.variable.find((v) => v.key === "apiKey")?.value).toBe("");
  });

  it("sends no auth on operations the API marks as public", () => {
    const health = requests.find(
      (r) => r.request.url.raw === "{{baseUrl}}/health",
    );
    const execute = requests.find(
      (r) => r.request.url.raw === "{{baseUrl}}/execute",
    );

    expect(health?.request.auth?.type).toBe("noauth");
    expect(execute?.request.auth).toBeUndefined();
  });
});
