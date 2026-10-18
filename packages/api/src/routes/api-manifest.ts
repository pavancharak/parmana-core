import { Router } from "express";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findOpenApiSpecFile } from "./findOpenApiSpecFile.js";
import { API_BUILD_VERSION, API_NAME, API_VERSION } from "../apiVersionInfo.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * openapi/openapi.bundled.yaml only exists at the repository root, so
 * its parent's parent is that root -- reuses findOpenApiSpecFile's own
 * upward walk rather than writing a second one.
 */
const repoRoot = dirname(dirname(findOpenApiSpecFile(__dirname)));

/**
 * Reads a package's real, currently-configured version directly from
 * its own manifest (package.json's "version" field, or pyproject.toml's
 * `version = "..."` line) -- the exact field each package's own publish
 * step reads, not a hand-typed copy that could drift the moment a
 * version bumps. Returns null, not a guess, when the file is missing or
 * doesn't parse: GET /sdks/other-languages already documents that Go and
 * Java have no SDK at all, and this manifest must not contradict that by
 * fabricating a version for a package that doesn't exist.
 */
function readNpmPackageVersion(packageJsonPath: string): string | null {
  try {
    const raw = readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };

    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

function readPyprojectVersion(pyprojectTomlPath: string): string | null {
  try {
    const raw = readFileSync(pyprojectTomlPath, "utf8");
    const match = raw.match(/^version\s*=\s*"([^"]+)"/m);

    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

const typescriptSdkVersion = readNpmPackageVersion(
  join(repoRoot, "typescript", "package.json"),
);
const pythonSdkVersion = readPyprojectVersion(
  join(repoRoot, "python", "pyproject.toml"),
);
const typescriptConnectorSdkVersion = readNpmPackageVersion(
  join(repoRoot, "packages", "connector-sdk", "package.json"),
);
const pythonConnectorSdkVersion = readPyprojectVersion(
  join(repoRoot, "python-connector-sdk", "pyproject.toml"),
);

/**
 * Machine-readable index of how to reach Parmana: the spec, the two
 * rendered views of it, both real SDKs, and the documentation site --
 * for coding agents and tooling that want one URL to discover
 * everything else from, rather than needing to already know this
 * site's structure. Built once at startup from each package's own
 * real, current manifest, not hand-maintained prose that could say one
 * thing while a package.json says another.
 */
const manifest = {
  name: API_NAME,
  apiVersion: API_VERSION,
  buildVersion: API_BUILD_VERSION,
  openapi: {
    json: "/openapi.json",
    yaml: "/openapi.yaml",
  },
  documentation: {
    site: "https://docs.parmanasystems.com",
    swaggerUi: "/documentation",
    redoc: "/reference",
  },
  authentication: {
    type: "bearer",
    header: "Authorization: Bearer <key>",
    docs: "https://docs.parmanasystems.com/api-reference/authentication",
  },
  sdks: {
    typescript:
      typescriptSdkVersion === null
        ? null
        : {
            package: "@parmana/sdk",
            registry: "npm",
            version: typescriptSdkVersion,
            install: "npm install @parmana/sdk",
            docs: "https://docs.parmanasystems.com/sdks/typescript",
            reference:
              "https://docs.parmanasystems.com/sdks/reference/typescript/classes/ParmanaClient",
          },
    python:
      pythonSdkVersion === null
        ? null
        : {
            package: "parmana",
            registry: "pypi",
            version: pythonSdkVersion,
            install: "pip install parmana",
            docs: "https://docs.parmanasystems.com/sdks/python",
            reference:
              "https://docs.parmanasystems.com/sdks/reference/python/client",
          },
    go: null,
    java: null,
  },
  connectorSdks: {
    typescript:
      typescriptConnectorSdkVersion === null
        ? null
        : {
            package: "@parmana/connector-sdk",
            registry: "npm",
            version: typescriptConnectorSdkVersion,
            install: "npm install @parmana/connector-sdk",
            docs: "https://docs.parmanasystems.com/reference/connector-sdk",
          },
    python:
      pythonConnectorSdkVersion === null
        ? null
        : {
            package: "parmana-connector-sdk",
            registry: "pypi",
            version: pythonConnectorSdkVersion,
            install: "pip install parmana-connector-sdk",
            docs: "https://docs.parmanasystems.com/reference/connector-sdk-python",
          },
  },
};

const manifestJson = JSON.stringify(manifest);

const router = Router();

router.get("/", (_req, res) => {
  res.set({
    "Cache-Control": "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });

  res.type("application/json").send(manifestJson);
});

export default router;
