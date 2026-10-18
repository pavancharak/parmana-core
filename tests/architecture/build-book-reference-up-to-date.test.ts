import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { format } from "prettier";
import { describe, expect, it } from "vitest";

import { buildReferenceChapters } from "../../scripts/build-book/buildReference.js";

/**
 * The reference chapters of "Build with Parmana" are generated from the
 * code (scripts/build-book/buildReference.ts). When an endpoint, an SDK
 * method or an error code changes, this fails until
 * `npm run openapi && npm run generate:build-book-reference` is run and
 * the result committed, so the book never describes an API that is not
 * the one in the code.
 */
const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

describe("Build with Parmana reference chapters are up to date", () => {
  const chapters = buildReferenceChapters();

  it("finds what it documents (guards against a broken generator)", () => {
    const [endpoints, sdk, errors] = chapters.map((chapter) => chapter.content);

    expect(endpoints).toContain("`POST`");
    expect(endpoints).toContain("/execute");
    expect(sdk).toContain("policyInEffect(");
    expect(sdk).toContain("policy_in_effect(");
    expect(sdk).toContain("verifyParmanaRelease(");
    expect(sdk).toContain("verify_parmana_release(");
    expect(errors).toContain("`CONNECTOR_NOT_REGISTERED`");
    expect(errors).toContain("`NO_APPROVED_POLICY_VERSION`");
  });

  it.each(chapters.map((chapter) => [chapter.file, chapter] as const))(
    "%s matches what the code generates",
    async (file, chapter) => {
      const path = join(repoRoot, file);

      expect(existsSync(path), `${file} is missing`).toBe(true);
      expect(normalize(readFileSync(path, "utf8"))).toBe(
        normalize(await format(chapter.content, { filepath: path })),
      );
    },
  );
});
