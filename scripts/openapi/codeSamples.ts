import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where the code samples for each OpenAPI operation live: one cURL,
 * one TypeScript and one Python file per operationId. Shared by
 * scripts/add-openapi-code-samples.ts, which puts them in the bundle,
 * and the test that typechecks them.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

export const CURL_SAMPLES_DIR = path.join(
  root,
  "openapi",
  "code-samples",
  "curl",
);
export const TYPESCRIPT_SAMPLES_DIR = path.join(
  root,
  "typescript",
  "examples",
  "api-reference",
);
export const PYTHON_SAMPLES_DIR = path.join(
  root,
  "python",
  "examples",
  "api_reference",
);

export function pythonSampleName(operationId: string): string {
  return `${operationId.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()}.py`;
}

export function samplePaths(operationId: string): {
  curl: string;
  typescript: string;
  python: string;
} {
  return {
    curl: path.join(CURL_SAMPLES_DIR, `${operationId}.sh`),
    typescript: path.join(TYPESCRIPT_SAMPLES_DIR, `${operationId}.ts`),
    python: path.join(PYTHON_SAMPLES_DIR, pythonSampleName(operationId)),
  };
}
