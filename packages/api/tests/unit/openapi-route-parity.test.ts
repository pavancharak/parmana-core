import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { generateKeyPairSync } from "node:crypto";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { createExecutionSystem } from "../../src/bootstrap/createExecutionSystem.js";

/**
 * Express 5 does not keep a router's mount path on its layer (only a
 * matcher function), so the path is recorded here as each use() call
 * adds layers. Installed before createApp below so every mount is seen.
 */
const MOUNT_PATH = Symbol("mountPath");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const routerPrototype = (express.Router as any).prototype;
const originalUse = routerPrototype.use;
routerPrototype.use = function use(
  this: { stack: Array<Record<symbol, unknown>> },
  ...args: unknown[]
) {
  const before = this.stack.length;
  const result = originalUse.apply(this, args);
  const mountPath =
    typeof args[0] === "function" ||
    (Array.isArray(args[0]) && typeof args[0][0] === "function")
      ? "/"
      : args[0];

  for (const layer of this.stack.slice(before)) {
    layer[MOUNT_PATH] = mountPath;
  }

  return result;
};

/**
 * The app with every optional route mounted, so each one is checked
 * against the spec too: POST /sandbox/approvals exists only in sandbox
 * mode (ADR-0014).
 */
const app = createApp(createApplication(await createExecutionSystem()), {
  callerAuth: "disabled",
  sandboxApprover: {
    approverId: "parity-sandbox-approver",
    keyId: "parity-sandbox-approver-key",
    privateKey: generateKeyPairSync("ed25519").privateKey,
  },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Mirrors openapi-bundle-refs.test.ts's own findBundledSpec() -- walks up
 * from this file to the repository's bundled OpenAPI spec.
 */
function findBundledSpec(): string {
  let current = __dirname;

  while (true) {
    const candidate = join(current, "openapi", "openapi.bundled.yaml");

    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);

    if (parent === current) {
      throw new Error(
        "openapi/openapi.bundled.yaml not found in any parent directory.",
      );
    }

    current = parent;
  }
}

/**
 * Rendered doc surfaces, not API resources -- deliberately excluded from
 * the spec, see api-reference/introduction.mdx's "Three views of the same
 * spec" section. Every other route mounted in packages/api/src/app.ts
 * must have a matching { method, path } entry in openapi/openapi.yaml, or
 * this test fails: this is the regression coverage that api-reference/
 * introduction.mdx's Info callout notes does not otherwise exist.
 */
const DOC_SURFACE_ALLOWLIST = new Set(["get /documentation", "get /reference"]);

interface ExpressLayer {
  route?: {
    path: unknown;
    methods: Record<string, boolean>;
  };
  handle?: { stack?: ExpressLayer[] };
  [MOUNT_PATH]?: unknown;
}

function findMountedRoutes(expressApp: unknown): Set<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = (expressApp as any).router;

  if (!router?.stack) {
    throw new Error(
      "app.router.stack not found -- Express's internal router shape " +
        "has likely changed across a version bump. Update this test's " +
        "introspection to match, rather than silently skipping it.",
    );
  }

  const found = new Set<string>();

  function walk(stack: ExpressLayer[], prefix: string): void {
    for (const layer of stack) {
      if (layer.route) {
        if (typeof layer.route.path !== "string") {
          throw new Error(
            `Route path ${String(layer.route.path)} is not a string -- ` +
              "update this test to handle it rather than skipping it.",
          );
        }

        const full =
          (prefix + layer.route.path).replace(/\/+/g, "/").replace(/\/$/, "") ||
          "/";

        for (const [method, enabled] of Object.entries(layer.route.methods)) {
          if (enabled) {
            found.add(`${method} ${full}`);
          }
        }

        continue;
      }

      if (layer.handle?.stack) {
        const mountPath = layer[MOUNT_PATH];

        if (typeof mountPath !== "string") {
          throw new Error(
            `A router is mounted at ${String(mountPath)}, not a single ` +
              "path string -- update this test to handle it rather than " +
              "skipping it.",
          );
        }

        walk(layer.handle.stack, prefix + mountPath);
      }
    }
  }

  walk(router.stack, "");

  return found;
}

/**
 * OpenAPI path templates use {param}; Express route templates use
 * :param. Normalize both to a bare placeholder so real routes and spec
 * paths compare structurally, independent of the specific param name
 * each side happens to use -- e.g. the spec names it
 * {businessTransactionId} on /verification/{businessTransactionId}, but
 * verify-get.ts's real route is registered as /:id, param name "id".
 */
function normalizePath(path: string): string {
  return path.replace(/:[^/]+/g, "{}").replace(/\{[^}]+\}/g, "{}");
}

describe("OpenAPI spec vs. real mounted routes", () => {
  it("documents every real route (except the deliberately-excluded doc-UI surfaces)", () => {
    const mountedRoutes = findMountedRoutes(app);

    const specPath = findBundledSpec();
    const spec = parse(readFileSync(specPath, "utf8")) as {
      paths: Record<string, Record<string, unknown>>;
    };

    const specRoutes = new Set<string>();

    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const method of Object.keys(methods)) {
        specRoutes.add(`${method} ${normalizePath(path)}`);
      }
    }

    const missingFromSpec = [...mountedRoutes]
      .filter((route) => !DOC_SURFACE_ALLOWLIST.has(route))
      .map((route) => {
        const [method, ...pathParts] = route.split(" ");
        return `${method} ${normalizePath(pathParts.join(" "))}`;
      })
      .filter((normalized) => !specRoutes.has(normalized))
      .sort();

    expect(missingFromSpec).toEqual([]);
  });

  it("does not document a route that is no longer actually mounted", () => {
    const mountedRoutes = new Set(
      [...findMountedRoutes(app)].map((route) => {
        const [method, ...pathParts] = route.split(" ");
        return `${method} ${normalizePath(pathParts.join(" "))}`;
      }),
    );

    for (const surface of DOC_SURFACE_ALLOWLIST) {
      mountedRoutes.add(surface);
    }

    const specPath = findBundledSpec();
    const spec = parse(readFileSync(specPath, "utf8")) as {
      paths: Record<string, Record<string, unknown>>;
    };

    const specOnly = Object.entries(spec.paths)
      .flatMap(([path, methods]) =>
        Object.keys(methods).map(
          (method) => `${method} ${normalizePath(path)}`,
        ),
      )
      .filter((route) => !mountedRoutes.has(route))
      .sort();

    expect(specOnly).toEqual([]);
  });
});
