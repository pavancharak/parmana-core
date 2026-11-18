import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * A revoked external connector refuses requests with 503
 * CONNECTOR_NOT_REGISTERED. Tutorial 123 demonstrates this, and the connector
 * guide and the error catalog must say so. This test keeps the three in step:
 * if the tutorial stops showing the refusal, or a page stops describing it,
 * the test fails.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function read(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("a revoked connector's refusal is documented and demonstrated", () => {
  it("the connector guide's stop bullet names the 503 refusal", () => {
    const guide = read("docs/site/guides/connect-any-external-system.mdx");
    const stop = guide.match(/- \*\*Stop it:\*\*[\s\S]*?(?=\n- |\n## )/);
    expect(stop, "the 'Stop it' bullet").not.toBeNull();
    expect(stop![0]).toContain("revoke");
    expect(stop![0]).toContain("503 CONNECTOR_NOT_REGISTERED");
  });

  it("the error catalog row for CONNECTOR_NOT_REGISTERED names revocation", () => {
    const catalog = read("docs/site/api-reference/error-catalog.mdx");
    const row = catalog
      .split("\n")
      .find((line) => line.includes("`CONNECTOR_NOT_REGISTERED`"));
    expect(row, "the CONNECTOR_NOT_REGISTERED row").toBeDefined();
    expect(row).toContain("revoked");
  });

  it("tutorial 123 revokes the connector and then expects the refusal", () => {
    const tutorial = read("examples/tutorials/123-external-connector/run.ts");
    expect(tutorial).toContain("CONNECTOR_NOT_REGISTERED");
    expect(tutorial).toMatch(/revoke/i);
  });
});
